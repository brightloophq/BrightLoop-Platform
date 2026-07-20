/* =============================================================================
 * Checkpoint + resume (Sprint 8 §4 · AIS-001 §08 Reproducible) — PURE.
 *
 * A checkpoint is written after every completed stage. A resume replays from the
 * last VALID checkpoint and skips already-completed deterministic stages. When an
 * upstream artifact changes, every checkpoint at or after the first stage that
 * consumes it is invalidated, so stale downstream work can never be reused.
 * Prior attempt history and failed outputs are preserved for audit.
 * ========================================================================== */

import {
  pipelineCheckpointSchema,
  type ArtifactKind,
  type PipelineCheckpoint,
  type PipelineRunStage,
} from "@brightloop/schema";
import { PIPELINE_STAGE_ORDER, stagesDependingOn } from "./stages.js";

export interface NewCheckpointInput {
  id: string;
  pipelineRunId: string;
  stage: PipelineRunStage;
  artifactIds?: string[];
  now: string;
}

/** Create a valid checkpoint for a completed stage. Pure. */
export function newCheckpoint(input: NewCheckpointInput): PipelineCheckpoint {
  return pipelineCheckpointSchema.parse({
    id: input.id,
    pipelineRunId: input.pipelineRunId,
    stage: input.stage,
    at: input.now,
    artifactIds: input.artifactIds ?? [],
    valid: true,
  });
}

/** Index of a stage in the canonical order (−1 when unknown). Pure. */
function stageIndex(stage: PipelineRunStage): number {
  return PIPELINE_STAGE_ORDER.indexOf(stage);
}

/**
 * The last valid checkpoint (furthest along the stage order), or null when the run
 * has none — the resume point. Pure.
 */
export function lastValidCheckpoint(checkpoints: readonly PipelineCheckpoint[]): PipelineCheckpoint | null {
  let best: PipelineCheckpoint | null = null;
  for (const c of checkpoints) {
    if (!c.valid) continue;
    if (best === null || stageIndex(c.stage) > stageIndex(best.stage)) best = c;
  }
  return best;
}

/** The stage to resume at: the one after the last valid checkpoint (or the first stage). Pure. */
export function resumeStage(checkpoints: readonly PipelineCheckpoint[]): PipelineRunStage {
  const last = lastValidCheckpoint(checkpoints);
  if (last === null) return PIPELINE_STAGE_ORDER[0]!;
  const i = stageIndex(last.stage);
  return PIPELINE_STAGE_ORDER[Math.min(i + 1, PIPELINE_STAGE_ORDER.length - 1)]!;
}

/** Stages already completed per the valid checkpoints — safe to skip on resume. Pure. */
export function completedStagesFrom(checkpoints: readonly PipelineCheckpoint[]): PipelineRunStage[] {
  return PIPELINE_STAGE_ORDER.filter((s) => checkpoints.some((c) => c.valid && c.stage === s));
}

/** A deterministic stage already covered by a valid checkpoint need not re-run. Pure. */
export function shouldSkipStage(stage: PipelineRunStage, checkpoints: readonly PipelineCheckpoint[]): boolean {
  return checkpoints.some((c) => c.valid && c.stage === stage);
}

/**
 * Invalidate every checkpoint at or after the earliest stage that consumes
 * `changedKind`. Upstream checkpoints stay valid; downstream work is discarded.
 * Returns a new array (input untouched). Pure.
 */
export function invalidateDownstream(checkpoints: readonly PipelineCheckpoint[], changedKind: ArtifactKind): PipelineCheckpoint[] {
  const consumers = stagesDependingOn(changedKind);
  if (consumers.length === 0) return [...checkpoints];
  const firstConsumerIdx = Math.min(...consumers.map(stageIndex));
  return checkpoints.map((c) => (stageIndex(c.stage) >= firstConsumerIdx ? { ...c, valid: false } : { ...c }));
}
