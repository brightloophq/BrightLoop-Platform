/* =============================================================================
 * Orchestration · the 13-stage Business Intelligence pipeline (PDF 27 §03).
 *
 * A single directed flow from raw URL to a monitored, improving account. Amber
 * nodes are produced knowledge ARTIFACTS; neutral nodes are PROCESSES that
 * transform them. This module owns the ORDER, the stage↔layer map, and the
 * transition rules — pure, no I/O. Background execution (queue/workers/retry)
 * lives in ./background; per-scan surface progress (PDF 26's 9 stages) stays in
 * ../pipeline.ts and is unaffected.
 * ========================================================================== */

import {
  engineStageSchema,
  type EngineStage,
  type StageKind,
  type EngineLayer,
} from "@brightloop/schema";

/** Canonical stage order (enum declaration order = PDF 27 §03 flow). */
export const ENGINE_PIPELINE: readonly EngineStage[] = engineStageSchema.options;

/** Artifact vs process per stage (PDF 27 §03: amber = artifact). */
export const ENGINE_STAGE_KIND: Record<EngineStage, StageKind> = {
  website_url: "artifact",
  discovery: "process",
  crawler: "process",
  evidence_collection: "process",
  normalization: "process",
  business_profile: "artifact",
  competitor_discovery: "process",
  competitor_evidence: "process",
  ai_reasoning: "process",
  intelligence_graph: "artifact",
  recommendations: "artifact",
  proposal: "artifact",
  monitoring: "process",
};

/** Which of the 8 engine layers owns each stage (input artifact has no layer). */
export const ENGINE_STAGE_LAYER: Record<EngineStage, EngineLayer | null> = {
  website_url: null,
  discovery: "discovery",
  crawler: "crawler",
  evidence_collection: "evidence",
  normalization: "graph",
  business_profile: "graph",
  competitor_discovery: "evidence",
  competitor_evidence: "evidence",
  ai_reasoning: "reasoning",
  intelligence_graph: "graph",
  recommendations: "recommendation",
  proposal: "proposal",
  monitoring: "monitoring",
};

/** The stage after `stage`, or null once `monitoring` (the terminal stage) is reached. */
export function nextEngineStage(stage: EngineStage): EngineStage | null {
  const i = ENGINE_PIPELINE.indexOf(stage);
  if (i < 0 || i >= ENGINE_PIPELINE.length - 1) return null;
  return ENGINE_PIPELINE[i + 1]!;
}

/** A transition is legal iff `to` immediately follows `from` in the pipeline. */
export function canTransition(from: EngineStage, to: EngineStage): boolean {
  return nextEngineStage(from) === to;
}

export function isEngineTerminal(stage: EngineStage): boolean {
  return stage === "monitoring";
}

export function stageKind(stage: EngineStage): StageKind {
  return ENGINE_STAGE_KIND[stage];
}

export function isArtifactStage(stage: EngineStage): boolean {
  return ENGINE_STAGE_KIND[stage] === "artifact";
}
