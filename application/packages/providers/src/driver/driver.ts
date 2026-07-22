/* =============================================================================
 * ControlledRuntimeDriver (Phase C · Sprint C2.1).
 *
 * Performs EXACTLY ONE controlled runtime turn by coordinating the existing
 * services + coordinator + provider adapter. One invocation leases at most one
 * job, executes at most one stage, persists at most one outcome, enqueues at most
 * one downstream job, and returns — no loop, no recursion, no timer, no polling,
 * no daemon.
 *
 * It duplicates NONE of the runtime's logic: the coordinator does the lease,
 * execution, settle, and enqueue (its atomic lease, retry, and idempotency all
 * apply); the driver only resolves the per-stage executor, captures observability,
 * and maps the outcome to a safe structured result.
 * ========================================================================== */

import type { PipelineRunStage, RuntimeQueueJob } from "@brightloop/schema";
import { StageBlockedError, type RuntimeServices, type StageExecutor, type StageOutcome } from "@brightloop/domain";
import { PROVIDER_DISABLED_REASON } from "../anthropic/config.js";
import type { DriverEligibility, DriverOutcome, DriverResult, RetryDisposition, StageExecutorRegistry } from "./contract.js";
import type { ReasoningTelemetry } from "./registry.js";

export interface RuntimeDriverDeps {
  services: RuntimeServices;
  registry: StageExecutorRegistry;
  /** Set when the default registry is reasoning-capable — for provider ids in results. */
  reasoningProviderId?: string;
  ids: (prefix: string) => string;
  now: () => string;
  /** Reasoning telemetry sink populated by the registry's reasoning executor. */
  telemetry?: { current: ReasoningTelemetry | null };
}

export interface RunQueueTurnOptions {
  owner?: string;
  leaseSeconds?: number;
  jobType?: string;
  clientId?: string | null;
}

export class ControlledRuntimeDriver {
  constructor(private readonly deps: RuntimeDriverDeps) {}

  /** Non-mutating: is there a turn worth running right now? (dry-run) */
  async checkEligibility(options: { jobType?: string; clientId?: string | null } = {}): Promise<DriverEligibility> {
    const depth = await this.deps.services.queue.depth(options.jobType ?? "advance_stage", options.clientId ?? null);
    if (!depth.ok) return { eligible: false, reason: `queue read failed: ${depth.code}`, queuedJobs: 0, leasedJobs: 0 };
    const { eligible, queued, leased } = depth.value;
    return {
      eligible: eligible > 0,
      reason: eligible > 0 ? "eligible job available" : "no eligible job",
      queuedJobs: queued,
      leasedJobs: leased,
    };
  }

  /** Cancel a run (delegates to the coordinator; used to stop queued work). */
  async cancel(runId: string): Promise<DriverOutcome> {
    const result = await this.deps.services.coordinator.cancelRun(runId);
    return result.ok ? "cancelled" : "failed";
  }

  /**
   * Lease one eligible job and advance one stage. The dispatcher resolves the
   * per-stage executor; an unsupported stage throws `StageBlockedError`, which
   * the engine turns into a `blocked` outcome and the coordinator releases the
   * lease without consuming an attempt.
   */
  async runQueueTurn(options: RunQueueTurnOptions = {}): Promise<DriverResult> {
    const startedAt = this.deps.now();
    const owner = options.owner ?? this.deps.ids("worker");
    this.resetTelemetry();

    // A holder object keeps the captured ids readable after the closures run
    // (TS does not reset an object property's type across a callback the way it
    // resets a plain `let`).
    const captured: { job: RuntimeQueueJob | null; downstreamJobId: string | null } = { job: null, downstreamJobId: null };

    const turn = await this.deps.services.coordinator.runOnce(owner, this.dispatcher(), {
      ...(options.leaseSeconds !== undefined ? { leaseSeconds: options.leaseSeconds } : {}),
      ...(options.jobType !== undefined ? { jobType: options.jobType } : {}),
      clientId: options.clientId ?? null,
      onLease: (job: RuntimeQueueJob) => { captured.job = job; },
      onEnqueue: (jobId: string) => { captured.downstreamJobId = jobId; },
    });

    if (!turn.ok) {
      return this.result({
        startedAt, runId: captured.job?.runId ?? null, queueJobId: captured.job?.id ?? null,
        stage: captured.job?.stage ?? null, outcome: "failed", failureCode: turn.code,
      });
    }

    // Idle queue.
    if (turn.value === null) {
      return this.result({ startedAt, outcome: "no_job_available" });
    }

    return this.fromOutcome(startedAt, captured.job, captured.downstreamJobId, turn.value);
  }

  /**
   * Advance the resume stage of ONE specific run (no queue lease). Useful for a
   * targeted internal re-drive. Still exactly one stage.
   */
  async runRunTurn(runId: string): Promise<DriverResult> {
    const startedAt = this.deps.now();
    this.resetTelemetry();

    const resume = await this.deps.services.coordinator.resumePoint(runId);
    if (!resume.ok) {
      return this.result({ startedAt, runId, outcome: resume.code === "terminal_state" ? "completed" : "failed", failureCode: resume.code });
    }
    const advanced = await this.deps.services.coordinator.advanceStage(runId, resume.value, this.dispatcher(), 0);
    if (!advanced.ok) {
      return this.result({ startedAt, runId, stage: resume.value, outcome: "failed", failureCode: advanced.code });
    }
    return this.fromOutcome(startedAt, null, null, advanced.value, runId);
  }

  /* ---- internals ----------------------------------------------------------- */

  /** The per-stage dispatcher: resolve the registry; block or execute. */
  private dispatcher(): StageExecutor {
    return async (stage, run) => {
      const support = this.deps.registry.resolve(stage, run);
      if (support.kind === "blocked") throw new StageBlockedError(support.reason);
      return support.execute(stage, run);
    };
  }

  private resetTelemetry(): void {
    if (this.deps.telemetry) this.deps.telemetry.current = null;
  }

  /** Map a `StageOutcome` (+ captured job/downstream) into a safe `DriverResult`. */
  private async fromOutcome(
    startedAt: string,
    job: RuntimeQueueJob | null,
    downstreamJobId: string | null,
    outcome: StageOutcome,
    runId?: string,
  ): Promise<DriverResult> {
    const effectiveRunId = job?.runId ?? runId ?? null;
    const stage = outcome.stage;
    const detail = outcome.detail ?? "";
    const t = this.deps.telemetry?.current ?? null;

    let driverOutcome: DriverOutcome;
    let retryDisposition: RetryDisposition | null = null;
    let checkpointId: string | null = null;

    switch (outcome.status) {
      case "completed":
      case "skipped":
        driverOutcome = downstreamJobId !== null ? "advanced" : "completed";
        checkpointId = await this.latestCheckpointId(effectiveRunId);
        break;
      case "blocked":
        driverOutcome = detail === PROVIDER_DISABLED_REASON ? "provider_disabled" : "blocked";
        break;
      case "cancelled":
        driverOutcome = "cancelled";
        break;
      case "deadline_exceeded":
        driverOutcome = "deadline_exceeded";
        break;
      case "failed":
        if (detail.includes("budget_exhausted")) driverOutcome = "budget_exhausted";
        else if (detail.includes("deadline_exceeded")) driverOutcome = "deadline_exceeded";
        else {
          // retry vs dead-letter: read the job's post-settle status.
          const disp = await this.retryDispositionOf(job?.id ?? null);
          retryDisposition = disp;
          driverOutcome = disp === "retry" ? "retried" : "failed";
        }
        break;
    }

    return this.result({
      startedAt,
      runId: effectiveRunId,
      queueJobId: job?.id ?? null,
      stage,
      providerId: t?.providerId ?? (this.isReasoningStage(stage) ? (this.deps.reasoningProviderId ?? null) : null),
      modelId: t?.modelId ?? null,
      outcome: driverOutcome,
      artifactIds: outcome.artifactId !== null ? [outcome.artifactId] : [],
      checkpointId,
      downstreamJobId,
      retryDisposition,
      blockedReason: outcome.status === "blocked" ? detail : null,
      failureCode: outcome.status === "failed" ? detail : null,
      latencyMs: t?.latencyMs ?? null,
      usage: t !== null ? { inputTokens: t.inputTokens, outputTokens: t.outputTokens, estimated: t.estimated } : null,
      validationStatus: t?.validationStatus ?? null,
    });
  }

  private isReasoningStage(stage: string): boolean {
    return stage === "provider_execution";
  }

  private async latestCheckpointId(runId: string | null): Promise<string | null> {
    if (runId === null) return null;
    const cp = await this.deps.services.checkpoints.latestValid(runId);
    return cp.ok ? cp.value.id : null;
  }

  private async retryDispositionOf(jobId: string | null): Promise<RetryDisposition> {
    if (jobId === null) return "none";
    const job = await this.deps.services.queue.get(jobId);
    if (!job.ok) return "none";
    if (job.value.status === "queued") return "retry";
    if (job.value.status === "dead_letter") return "dead_letter";
    return "none";
  }

  /** Assemble the final result, stamping timestamps + duration. */
  private result(partial: Partial<DriverResult> & { startedAt: string; outcome: DriverOutcome }): DriverResult {
    const completedAt = this.deps.now();
    return {
      executionId: this.deps.ids("exec"),
      correlationId: this.deps.ids("corr"),
      runId: partial.runId ?? null,
      queueJobId: partial.queueJobId ?? null,
      stage: partial.stage ?? null,
      providerId: partial.providerId ?? null,
      modelId: partial.modelId ?? null,
      outcome: partial.outcome,
      artifactIds: partial.artifactIds ?? [],
      checkpointId: partial.checkpointId ?? null,
      downstreamJobId: partial.downstreamJobId ?? null,
      retryDisposition: partial.retryDisposition ?? null,
      blockedReason: partial.blockedReason ?? null,
      failureCode: partial.failureCode ?? null,
      latencyMs: partial.latencyMs ?? null,
      usage: partial.usage ?? null,
      validationStatus: partial.validationStatus ?? null,
      startedAt: partial.startedAt,
      completedAt,
      durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(partial.startedAt).getTime()),
      warnings: partial.warnings ?? [],
    };
  }
}

/** Re-export the stage type for callers assembling a registry. */
export type { PipelineRunStage };
