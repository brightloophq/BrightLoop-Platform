/* =============================================================================
 * RuntimeCoordinator (Phase B · Sprint 13C) — what runs next, and how it queues.
 *
 * The coordinator owns SCHEDULING; the RuntimeExecutionEngine owns EXECUTION.
 * Splitting them on that question is what keeps either from sprawling: the
 * coordinator sequences runs and jobs, the engine sequences the steps inside a
 * single stage, and neither reaches into the other's half.
 *
 *   coordinator  ──▶ engine.execute(stage)      "run this stage"
 *   coordinator  ──▶ queue.{lease,complete,fail} "and account for the job"
 *
 * Every multi-service sequence lives in one of these two files and nowhere else,
 * so orchestration cannot leak into repositories (which stay dumb) or into
 * services (which would each duplicate a slice of it).
 *
 * THIS FILE STARTS NOTHING ON ITS OWN. `runOnce` performs exactly one worker
 * turn and returns — no daemon, no cron, no hosted queue. The caller decides
 * when a turn happens.
 * ========================================================================== */

import type { PipelineRunStage, RuntimeQueueJob, RuntimeRun } from "@brightloop/schema";
import { PIPELINE_STAGE_ORDER } from "../../scan-engine/pipeline-run/stages.js";
import { err, type RuntimeResult } from "../results.js";
import type { ArtifactService } from "./artifact.service.js";
import type { CheckpointService } from "./checkpoint.service.js";
import type { EventService } from "./event.service.js";
import {
  RuntimeExecutionEngine,
  type StageExecutor,
  type StageOutcome,
} from "./execution-engine.js";
import type { PipelineService } from "./pipeline.service.js";
import type { QueueService } from "./queue.service.js";
import type { RunService, StartRunInput } from "./run.service.js";
import type { RuntimeServiceContext } from "./support.js";

/** Re-exported so callers depend on the coordinator, not on the engine's module. */
export type { StageExecutor, StageOutcome, StageWork } from "./execution-engine.js";

export interface CoordinatorServices {
  runs: RunService;
  pipeline: PipelineService;
  checkpoints: CheckpointService;
  artifacts: ArtifactService;
  queue: QueueService;
  events: EventService;
}

export class RuntimeCoordinator {
  private readonly engine: RuntimeExecutionEngine;

  constructor(
    private readonly svc: CoordinatorServices,
    ctx: RuntimeServiceContext,
    /** Injectable so a caller can supply an engine with different policy. */
    engine?: RuntimeExecutionEngine,
  ) {
    this.engine =
      engine ??
      new RuntimeExecutionEngine(
        {
          runs: svc.runs,
          pipeline: svc.pipeline,
          checkpoints: svc.checkpoints,
          artifacts: svc.artifacts,
          events: svc.events,
        },
        ctx,
      );
  }

  /** The execution engine, for callers that drive stages without a queue. */
  get execution(): RuntimeExecutionEngine {
    return this.engine;
  }

  /* ---- run lifecycle -------------------------------------------------------- */
  /**
   * Create (or replay) the run for a scan and enqueue its first stage.
   * Safe to call repeatedly: both the run and the queue job are keyed on natural
   * identity, so a duplicate initialize converges on the same two rows.
   */
  async initializeRun(input: StartRunInput): Promise<RuntimeResult<{ run: RuntimeRun; job: RuntimeQueueJob }>> {
    const created = await this.svc.runs.createRun(input);
    if (!created.ok) return created;
    const run = created.value;

    const job = await this.svc.queue.enqueue({
      jobType: "advance_stage",
      clientId: run.clientId,
      runId: run.id,
      scanId: run.scanId,
      stage: PIPELINE_STAGE_ORDER[0]!,
    });
    if (!job.ok) return job;

    return { ok: true, code: created.code, value: { run, job: job.value } };
  }

  /** Where a resumed run continues. Delegated to the engine (recovery is execution). */
  async resumePoint(runId: string): Promise<RuntimeResult<PipelineRunStage>> {
    return this.engine.resumePoint(runId);
  }

  /** Stages a checkpoint proves complete — these must never re-execute. */
  async completedStages(runId: string): Promise<RuntimeResult<PipelineRunStage[]>> {
    return this.engine.completedStages(runId);
  }

  /** Advance one stage. The engine owns the how; this is the stable entry point. */
  async advanceStage(
    runId: string,
    stage: PipelineRunStage,
    execute: StageExecutor,
    attempt = 0,
  ): Promise<RuntimeResult<StageOutcome>> {
    return this.engine.execute(runId, stage, execute, attempt);
  }

  /**
   * Enqueue the stage after this one, or complete the run when the pipeline is
   * exhausted. Idempotent — the queue key is derived from (type, run, stage).
   */
  async enqueueNext(runId: string, completedStage: PipelineRunStage): Promise<RuntimeResult<RuntimeQueueJob | null>> {
    const loaded = await this.svc.runs.getRun(runId);
    if (!loaded.ok) return loaded;
    const run = loaded.value;

    const next = this.svc.pipeline.nextStage(completedStage);
    if (next === null) {
      const completed = await this.svc.runs.completeRun(run.id);
      if (!completed.ok) return completed;
      return { ok: true, code: "updated", value: null };
    }

    const job = await this.svc.queue.enqueue({
      jobType: "advance_stage",
      clientId: run.clientId,
      runId: run.id,
      scanId: run.scanId,
      stage: next,
    });
    if (!job.ok) return job;
    return { ok: true, code: job.code, value: job.value };
  }

  /* ---- worker turn ------------------------------------------------------------ */
  /**
   * One full worker turn: lease → execute → account for the job → enqueue next.
   *
   * This is the unit a queue consumer repeats. It is NOT a worker, a daemon, or
   * a cron job — it performs exactly one turn and returns.
   */
  async runOnce(
    owner: string,
    execute: StageExecutor,
    options: { leaseSeconds?: number; jobType?: string; clientId?: string | null } = {},
  ): Promise<RuntimeResult<StageOutcome | null>> {
    const leased = await this.svc.queue.lease({
      owner,
      leaseSeconds: options.leaseSeconds ?? 60,
      jobType: options.jobType ?? "advance_stage",
      // A worker is generic by default and takes ANY eligible job. Scoping to a
      // tenant is opt-in — for a dedicated worker pool, or to keep one caller's
      // work from being picked up by a drain it did not intend.
      clientId: options.clientId ?? null,
    });
    if (!leased.ok) {
      // an idle queue is a normal outcome, not a failure
      if (leased.code === "no_job_available") return { ok: true, code: "found", value: null };
      return leased;
    }

    const job = leased.value;
    if (job.runId === null || job.stage === null) {
      await this.svc.queue.fail(job, owner, "job is missing runId or stage", { fatal: true });
      return err("check_violation", `job ${job.id} has no runId/stage to advance`);
    }

    const advanced = await this.engine.execute(job.runId, job.stage as PipelineRunStage, execute, job.attempt);
    if (!advanced.ok) {
      await this.svc.queue.fail(job, owner, advanced.message);
      return advanced;
    }

    await this.settleJob(job, owner, advanced.value);
    return { ok: true, code: "found", value: advanced.value };
  }

  /**
   * Translate a stage outcome into the job's disposition.
   *
   * `blocked` deliberately RELEASES rather than fails: dependencies not being
   * ready yet is not a failed attempt, and charging it one would eventually
   * dead-letter perfectly recoverable work.
   */
  private async settleJob(job: RuntimeQueueJob, owner: string, outcome: StageOutcome): Promise<void> {
    switch (outcome.status) {
      case "completed":
      case "skipped":
        await this.svc.queue.complete(job.id, owner);
        if (job.runId !== null) await this.enqueueNext(job.runId, outcome.stage);
        break;
      case "blocked":
        await this.svc.queue.release(job.id, owner);
        break;
      case "cancelled":
        await this.svc.queue.cancel(job.id);
        break;
      case "deadline_exceeded":
        await this.svc.queue.fail(job, owner, outcome.detail ?? "deadline exceeded", { fatal: true });
        break;
      case "failed":
        await this.svc.queue.fail(job, owner, outcome.detail ?? "stage failed");
        break;
    }
  }

  /* ---- retry ------------------------------------------------------------------ */
  /**
   * Retry a run's FAILED stage by reusing runtime recovery.
   *
   * The stage to retry is the resume point — the last valid checkpoint's
   * `nextStage`, which for a failed stage is the stage that failed (a failed
   * stage never checkpoints). Requeuing resets that stage's non-progressing job
   * back to `queued`; a worker then re-drives from there, and every stage the
   * checkpoints already prove complete is skipped, never re-run.
   *
   * Returns the requeued job. `terminal_state` when the RUN itself is terminal
   * (a completed/cancelled/deadline-failed run is not resumable — start a new
   * scan). `not_found` when there is no failed stage to retry (the run is not
   * stuck, or work is already in flight).
   */
  async retryRun(runId: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const loaded = await this.svc.runs.getRun(runId);
    if (!loaded.ok) return loaded;
    const run = loaded.value;

    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled" || run.cancelled) {
      return err("terminal_state", `run ${runId} is ${run.status} and cannot be retried`);
    }

    const resume = await this.engine.resumePoint(runId);
    if (!resume.ok) return resume;

    return this.svc.queue.requeue(runId, resume.value);
  }

  /* ---- cancellation ----------------------------------------------------------- */
  /**
   * Cancel a run. The run is cancelled FIRST, so any worker that leases in the
   * meantime sees the cancellation and stops before executing work.
   */
  async cancelRun(runId: string): Promise<RuntimeResult<RuntimeRun>> {
    return this.svc.runs.cancelRun(runId);
  }
}
