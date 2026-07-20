/* =============================================================================
 * Pipeline events (Sprint 8 §11) — PURE constructors.
 *
 * Builders for the pipeline.* event stream — record only, no transport, no bus,
 * no persistence. Each event carries the run id, an optional stage, a supplied
 * timestamp, and an optional structured detail.
 * ========================================================================== */

import { pipelineEventSchema, type PipelineEvent, type PipelineEventType, type PipelineRunStage } from "@brightloop/schema";

export function pipelineEvent(type: PipelineEventType, pipelineRunId: string, now: string, stage: PipelineRunStage | null = null, detail: string | null = null): PipelineEvent {
  return pipelineEventSchema.parse({ type, pipelineRunId, stage, at: now, detail });
}

export const created = (runId: string, now: string, detail?: string) => pipelineEvent("pipeline.created", runId, now, null, detail ?? null);
export const stageStarted = (runId: string, stage: PipelineRunStage, now: string, detail?: string) => pipelineEvent("pipeline.stage_started", runId, now, stage, detail ?? null);
export const stageCompleted = (runId: string, stage: PipelineRunStage, now: string, detail?: string) => pipelineEvent("pipeline.stage_completed", runId, now, stage, detail ?? null);
export const stageFailed = (runId: string, stage: PipelineRunStage, now: string, detail?: string) => pipelineEvent("pipeline.stage_failed", runId, now, stage, detail ?? null);
export const checkpointCreated = (runId: string, stage: PipelineRunStage, now: string, detail?: string) => pipelineEvent("pipeline.checkpoint_created", runId, now, stage, detail ?? null);
export const resumed = (runId: string, stage: PipelineRunStage, now: string, detail?: string) => pipelineEvent("pipeline.resumed", runId, now, stage, detail ?? null);
export const budgetWarning = (runId: string, stage: PipelineRunStage | null, now: string, detail?: string) => pipelineEvent("pipeline.budget_warning", runId, now, stage, detail ?? null);
export const blocked = (runId: string, stage: PipelineRunStage | null, now: string, detail?: string) => pipelineEvent("pipeline.blocked", runId, now, stage, detail ?? null);
export const cancelled = (runId: string, stage: PipelineRunStage | null, now: string, detail?: string) => pipelineEvent("pipeline.cancelled", runId, now, stage, detail ?? null);
export const completed = (runId: string, now: string, detail?: string) => pipelineEvent("pipeline.completed", runId, now, null, detail ?? null);
