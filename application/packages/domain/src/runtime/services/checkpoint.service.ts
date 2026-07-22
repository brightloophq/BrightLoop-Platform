/* =============================================================================
 * CheckpointService (Phase B · Sprint 13C) — durable resume points.
 *
 * A checkpoint records what COMPLETED, not what is in progress: the finished
 * stage, the attempt that finished it, the artifacts it produced, the checksums
 * of the artifacts it consumed, and where to go next.
 *
 * HISTORICAL CHECKPOINTS ARE NEVER DESTROYED. Superseding one marks it
 * `invalidated` with a reason and retains the row, so the audit trail survives
 * and a later investigation can see what the run believed at the time.
 *
 * Resume selects the LAST VALID checkpoint; everything before it is already
 * done and must not execute a second time.
 * ========================================================================== */

import type { RuntimeCheckpoint } from "@brightloop/schema";
import type { CheckpointRepository } from "../repository.js";
import type { RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { checkpointKey, RUNTIME_EVENTS, type RuntimeServiceContext } from "./support.js";

export interface SaveCheckpointInput {
  runId: string;
  clientId: string | null;
  scanId: string;
  /** The stage that just COMPLETED. */
  stage: string;
  attempt: number;
  /** Artifacts this stage produced. */
  artifactIds?: string[];
  /** Checksums of the upstream artifacts it consumed — the resume validity proof. */
  sourceChecksums?: Record<string, string>;
  /** Where the run continues; null at the end of the pipeline. */
  nextStage?: string | null;
}

export class CheckpointService {
  constructor(
    private readonly repo: CheckpointRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /**
   * Record a completed stage. Keyed on (run, stage, attempt), so re-saving the
   * same checkpoint after a crash replays rather than duplicating.
   */
  async save(input: SaveCheckpointInput): Promise<RuntimeResult<RuntimeCheckpoint>> {
    const record: RuntimeCheckpoint = {
      id: this.ctx.ids("ckpt"),
      runId: input.runId,
      clientId: input.clientId,
      scanId: input.scanId,
      stage: input.stage,
      status: "valid",
      artifactIds: [...(input.artifactIds ?? [])].sort(),
      sourceChecksums: input.sourceChecksums ?? {},
      nextStage: input.nextStage ?? null,
      attempt: input.attempt,
      invalidationReason: null,
      idempotencyKey: checkpointKey(input.runId, input.stage, input.attempt),
      createdAt: this.ctx.clock(),
    };

    const result = await this.repo.saveCheckpoint(record);
    if (result.ok && result.code === "created") {
      await this.events.emit({
        eventType: RUNTIME_EVENTS.checkpointSaved,
        aggregateType: "intelligence_run",
        aggregateId: input.runId,
        clientId: input.clientId,
        runId: input.runId,
        scanId: input.scanId,
        stage: input.stage,
        payload: { attempt: input.attempt, nextStage: record.nextStage, artifactIds: record.artifactIds },
      });
    }
    return result;
  }

  /** The resume point: the most recent VALID checkpoint, or `not_found`. */
  async latestValid(runId: string): Promise<RuntimeResult<RuntimeCheckpoint>> {
    return this.repo.getLatestValidCheckpoint(runId);
  }

  /**
   * Invalidate this stage and everything downstream of it — used when an upstream
   * artifact changes and the work derived from it can no longer be trusted.
   * The rows are RETAINED and marked, never deleted.
   */
  async invalidateFrom(
    runId: string,
    fromStage: string,
    reason: string,
    context: { clientId: string | null; scanId: string },
  ): Promise<RuntimeResult<string[]>> {
    const result = await this.repo.invalidateCheckpoints(runId, fromStage, reason);
    if (result.ok && result.value.length > 0) {
      await this.events.emit({
        eventType: RUNTIME_EVENTS.checkpointInvalidated,
        aggregateType: "intelligence_run",
        aggregateId: runId,
        clientId: context.clientId,
        runId,
        scanId: context.scanId,
        stage: fromStage,
        payload: { reason, invalidatedIds: result.value },
      });
    }
    return result;
  }
}
