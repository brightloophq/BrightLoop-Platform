/* =============================================================================
 * ReasoningService (Phase B · Sprint 13C) — durable reasoning job lifecycle.
 *
 * PROVIDER-AGNOSTIC. No SDK, no vendor branch, no network call. A provider is an
 * opaque string id; this service records that a job exists, what happened to it,
 * and what the retry policy says to do next.
 *
 * Retry and fallback DECISIONS come from Phase A's pure `decideRetry`
 * (Sprint 6 · AIS-001 §11) — this service only makes them durable.
 * ========================================================================== */

import type {
  ReasoningFailureKind,
  RuntimeReasoningJob,
  RuntimeReasoningJobStatus,
  SelectionResult,
} from "@brightloop/schema";
import { decideRetry, DEFAULT_RETRY_POLICY, type RetryDecision, type RetryPolicy } from "../../scan-engine/reasoning/retry.js";
import type { ReasoningJobRepository } from "../repository.js";
import type { RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { AGGREGATE, reasoningKey, RUNTIME_EVENTS, type RuntimeServiceContext } from "./support.js";

export interface CreateReasoningJobInput {
  runId: string;
  clientId: string | null;
  scanId: string;
  stage: string;
  taskType: string;
  maxAttempts?: number;
  /** Input REFERENCES and budget envelope — never the evidence itself. */
  metadata?: Record<string, unknown>;
  deadline?: string | null;
}

export class ReasoningService {
  constructor(
    private readonly repo: ReasoningJobRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
    private readonly policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  ) {}

  /** Create the job for (run, stage, taskType), or replay the existing one. */
  async create(input: CreateReasoningJobInput): Promise<RuntimeResult<RuntimeReasoningJob>> {
    const now = this.ctx.clock();
    const record: RuntimeReasoningJob = {
      id: this.ctx.ids("rjob"),
      runId: input.runId,
      clientId: input.clientId,
      scanId: input.scanId,
      stage: input.stage,
      taskType: input.taskType,
      status: "pending",
      attempt: 0,
      maxAttempts: input.maxAttempts ?? this.policy.maxAttempts,
      idempotencyKey: reasoningKey(input.runId, input.stage, input.taskType),
      metadata: input.metadata ?? {},
      deadline: input.deadline ?? null,
      createdBy: this.ctx.actorId ?? null,
      createdAt: now,
      updatedAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
    };

    const result = await this.repo.createReasoningJob(record);
    if (result.ok && result.code === "created") {
      await this.emit(RUNTIME_EVENTS.reasoningCreated, result.value, { taskType: input.taskType });
    }
    return result;
  }

  async get(id: string): Promise<RuntimeResult<RuntimeReasoningJob>> {
    return this.repo.getReasoningJob(id);
  }

  async markRunning(id: string, attempt: number): Promise<RuntimeResult<RuntimeReasoningJob>> {
    return this.repo.updateReasoningJobStatus(id, "running", { attempt, startedAt: this.ctx.clock() });
  }

  async markCompleted(id: string): Promise<RuntimeResult<RuntimeReasoningJob>> {
    const result = await this.repo.updateReasoningJobStatus(id, "completed", { completedAt: this.ctx.clock() });
    if (result.ok) await this.emit(RUNTIME_EVENTS.reasoningCompleted, result.value, {});
    return result;
  }

  async markCancelled(id: string): Promise<RuntimeResult<RuntimeReasoningJob>> {
    return this.repo.updateReasoningJobStatus(id, "cancelled", { cancelledAt: this.ctx.clock() });
  }

  /**
   * Record a failed attempt and return what to do next.
   *
   * The DECISION is Phase A's: a fatal/budget/cancelled failure stops, a
   * validation failure retries the same route, a retryable/timeout failure falls
   * back to the next provider when one is available. This service persists the
   * resulting status and emits the event; it does not re-derive the rule.
   */
  async recordFailure(
    job: RuntimeReasoningJob,
    kind: ReasoningFailureKind,
    error: string,
    /** The routing result from Sprint 7, whose `fallbackOrder` decides fallback eligibility. */
    selection: SelectionResult | null,
  ): Promise<RuntimeResult<{ job: RuntimeReasoningJob; decision: RetryDecision }>> {
    const decision = decideRetry(kind, job.attempt, selection, {
      ...this.policy,
      maxAttempts: job.maxAttempts,
    });

    const status: RuntimeReasoningJobStatus = decision === "stop" ? "failed" : "pending";
    const updated = await this.repo.updateReasoningJobStatus(job.id, status, {
      attempt: job.attempt + 1,
      ...(decision === "stop" ? { failedAt: this.ctx.clock() } : {}),
    });
    if (!updated.ok) return updated;

    await this.emit(RUNTIME_EVENTS.reasoningFailed, updated.value, { kind, error, decision, attempt: job.attempt });
    return { ok: true, code: "updated", value: { job: updated.value, decision } };
  }

  /* ---- internals ----------------------------------------------------------- */
  private async emit(
    eventType: (typeof RUNTIME_EVENTS)[keyof typeof RUNTIME_EVENTS],
    job: RuntimeReasoningJob,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateType: AGGREGATE.reasoning,
      aggregateId: job.id,
      clientId: job.clientId,
      runId: job.runId,
      scanId: job.scanId,
      stage: job.stage,
      payload,
    });
  }
}
