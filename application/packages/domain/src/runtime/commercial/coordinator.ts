/* =============================================================================
 * CommercialCoordinator — the post-scan commercial workflow scheduler.
 *
 * A SEPARATE scheduler from the core RuntimeCoordinator (whose settle/enqueueNext
 * is hardwired to the 13-stage `pipeline.nextStage`). It runs on the same durable
 * queue under the `commercial_intelligence` job type, so enqueue idempotency,
 * backoff, dead-letter and lease ownership all apply unchanged — but it sequences
 * COMMERCIAL stages, never core pipeline stages, and touches the core coordinator
 * not at all.
 *
 * `runCommercialOnce` performs exactly one worker turn (lease → execute → settle →
 * enqueue next) and returns. It starts nothing on its own; the caller decides when
 * a turn happens, exactly like the core `runOnce`.
 * ========================================================================== */

import type { RuntimeQueueJob } from "@brightloop/schema";
import { err, type RuntimeResult } from "../results.js";
import type { ArtifactService } from "../services/artifact.service.js";
import type { EventService } from "../services/event.service.js";
import type { QueueService } from "../services/queue.service.js";
import { RUNTIME_EVENTS, type RuntimeServiceContext } from "../services/support.js";
import { runCompetitorCommercialStage, type CommercialStageDeps, type CommercialStageResult } from "./competitor-executor.js";
import { COMMERCIAL_JOB_TYPE, COMMERCIAL_STAGE_ORDER, isCommercialStage, nextCommercialStage } from "./stages.js";

export interface CommercialCoordinatorServices {
  queue: QueueService;
  artifacts: ArtifactService;
  events: EventService;
}

export interface EnqueueCommercialInput {
  runId: string;
  scanId: string;
  clientId: string | null;
  /** Admin-supplied competitor domains, carried on the job payload. */
  manualCompetitorDomains?: string[];
}

export class CommercialCoordinator {
  private readonly stageDeps: CommercialStageDeps;

  constructor(
    private readonly svc: CommercialCoordinatorServices,
    ctx: RuntimeServiceContext,
  ) {
    this.stageDeps = { artifacts: svc.artifacts, events: svc.events, ctx };
  }

  /**
   * Enqueue the commercial workflow for a run whose core scan has COMPLETED.
   * Idempotent — the queue key is (jobType, runId, firstStage), so a duplicate
   * completion (replay, refresh, re-drive) converges on the same single job.
   */
  async enqueueForCompletedRun(input: EnqueueCommercialInput): Promise<RuntimeResult<RuntimeQueueJob>> {
    const job = await this.svc.queue.enqueue({
      jobType: COMMERCIAL_JOB_TYPE,
      clientId: input.clientId,
      runId: input.runId,
      scanId: input.scanId,
      stage: COMMERCIAL_STAGE_ORDER[0],
      payload: input.manualCompetitorDomains ? { manualCompetitorDomains: input.manualCompetitorDomains } : {},
    });
    if (job.ok && job.code === "created") {
      await this.svc.events.emit({
        eventType: RUNTIME_EVENTS.commercialEnqueued,
        aggregateType: "intelligence_run",
        aggregateId: input.runId,
        clientId: input.clientId,
        runId: input.runId,
        scanId: input.scanId,
        stage: COMMERCIAL_STAGE_ORDER[0],
        payload: {},
      });
    }
    return job;
  }

  /**
   * One commercial worker turn: lease → execute the stage → account for the job →
   * enqueue the next commercial stage (or mark the workflow complete). Returns the
   * stage result, or null when the commercial queue is idle.
   */
  async runCommercialOnce(owner: string, options: { leaseSeconds?: number } = {}): Promise<RuntimeResult<CommercialStageResult | null>> {
    const leased = await this.svc.queue.lease({
      owner,
      leaseSeconds: options.leaseSeconds ?? 60,
      jobType: COMMERCIAL_JOB_TYPE,
      clientId: null,
    });
    if (!leased.ok) {
      if (leased.code === "no_job_available") return { ok: true, code: "found", value: null };
      return leased;
    }

    const job = leased.value;
    if (job.runId === null || job.stage === null || !isCommercialStage(job.stage)) {
      await this.svc.queue.fail(job, owner, `commercial job ${job.id} has an unknown stage '${job.stage ?? "null"}'`, { fatal: true });
      return err("check_violation", `commercial job ${job.id} has an invalid stage`);
    }

    const executed = await this.dispatch(job);
    if (!executed.ok) {
      await this.svc.queue.fail(job, owner, executed.message);
      return executed;
    }

    await this.svc.queue.complete(job.id, owner);
    await this.settle(job, executed.value);
    return { ok: true, code: "found", value: executed.value };
  }

  /** Route a leased commercial job to its stage executor. */
  private dispatch(job: RuntimeQueueJob): Promise<RuntimeResult<CommercialStageResult>> {
    switch (job.stage) {
      case "competitor_intelligence":
        return runCompetitorCommercialStage(this.stageDeps, job);
      default:
        return Promise.resolve(err("check_violation", `no commercial executor for stage '${job.stage ?? "null"}'`));
    }
  }

  /** Enqueue the next commercial stage, or emit completion when exhausted. */
  private async settle(job: RuntimeQueueJob, result: CommercialStageResult): Promise<void> {
    await this.svc.events.emit({
      eventType: RUNTIME_EVENTS.commercialStageCompleted,
      aggregateType: "intelligence_run",
      aggregateId: job.runId!,
      clientId: job.clientId,
      runId: job.runId,
      scanId: job.scanId,
      stage: job.stage,
      payload: { status: result.status, persisted: result.persisted },
    });

    const next = nextCommercialStage(result.stage);
    if (next !== null) {
      await this.svc.queue.enqueue({
        jobType: COMMERCIAL_JOB_TYPE,
        clientId: job.clientId,
        runId: job.runId!,
        scanId: job.scanId!,
        stage: next,
        payload: job.payload ?? {},
      });
      return;
    }

    await this.svc.events.emit({
      eventType: RUNTIME_EVENTS.commercialCompleted,
      aggregateType: "intelligence_run",
      aggregateId: job.runId!,
      clientId: job.clientId,
      runId: job.runId,
      scanId: job.scanId,
      payload: {},
    });
  }
}
