/* =============================================================================
 * L5 · Reasoning Engine (PDF 27 §07/§08) — SKELETON.
 *
 * The staged reasoning strategy (six bounded stages, each hands a validated
 * artifact to the next) + the pure confidence model. No LLM is called here — the
 * ReasoningEngine port delegates model work to an AiProviderRouter (providers.ts).
 * ========================================================================== */

import {
  reasoningStageSchema,
  confidenceInputsSchema,
  type ReasoningStage,
  type ConfidenceInputs,
  type EngineConfidence,
  type EvidenceSignal,
  type DimensionScore,
  type EngineMove,
} from "@brightloop/schema";

/* ---- 07 · six-stage reasoning strategy (ordered state machine) -------------
 * Order is the enum declaration order (the canonical PDF 27 §07 sequence). */
export const REASONING_STRATEGY: readonly ReasoningStage[] = reasoningStageSchema.options;

/** The stage after `stage`, or null once `proposal_writing` (the sixth) is reached. */
export function nextReasoningStage(stage: ReasoningStage): ReasoningStage | null {
  const i = REASONING_STRATEGY.indexOf(stage);
  if (i < 0 || i >= REASONING_STRATEGY.length - 1) return null;
  return REASONING_STRATEGY[i + 1]!;
}

/** A transition is legal iff `to` immediately follows `from` in the strategy. */
export function canAdvanceReasoning(from: ReasoningStage, to: ReasoningStage): boolean {
  return nextReasoningStage(from) === to;
}

export function isReasoningComplete(stage: ReasoningStage): boolean {
  return stage === "proposal_writing";
}

/* ---- 08 · confidence model (pure, deterministic) --------------------------- */
/**
 * Composite confidence (0–100) as the GEOMETRIC MEAN of the five factors. A
 * geometric mean means **any factor near zero caps the composite** — the engine
 * reports low confidence and never raises it to fill a gap (PDF 27 §08, Law:
 * confidence_is_mandatory). Pure + deterministic; no clock, no I/O.
 */
export function computeConfidence(inputs: ConfidenceInputs): EngineConfidence {
  const p = confidenceInputsSchema.parse(inputs);
  const factors = [p.coverage, p.reliability, p.freshness, p.agreement, p.completeness];
  const product = factors.reduce((acc, f) => acc * f, 1);
  const geomean = Math.pow(product, 1 / factors.length); // ∈ [0,1]
  return { value: Math.round(geomean * 100), inputs: p };
}

/* ---- reasoning port (no model logic in the domain) ------------------------- */
export interface PlannerOutput {
  questions: { id: string; needs: EvidenceSignal["source"][] }[];
}
export interface ReasoningArtifacts {
  planner: PlannerOutput;
  scores: DimensionScore[];
  moves: EngineMove[];
  executiveSummary: string;
}

/**
 * Runs the staged strategy over the graph. An adapter implements each stage by
 * delegating to an AiProviderRouter; the domain owns only the STAGE CONTRACT and
 * the order. No stage may emit a conclusion without cited evidence.
 */
export interface ReasoningEngine {
  run(input: { scanId: string; evidence: EvidenceSignal[] }): Promise<ReasoningArtifacts>;
}

export { reasoningStageSchema };

/* ---- Sprint 6 · AI Reasoning Orchestrator (extends the skeleton above) ------
 * The deterministic orchestration layer: job model + state machine, canonical
 * stage specs, grounding guards, provider-routing integration, retry/fallback,
 * multi-pass consensus, result provenance, and pure event constructors. No live
 * model execution. `stages.ts` re-exports `reasoningStageSchema` (already exported
 * above), so export it explicitly here to avoid an ambiguous duplicate re-export. */
export * from "./job.js";
export {
  REASONING_OUTPUT_KINDS,
  REASONING_STAGE_SPECS,
  stageSpec,
  preconditionsMet,
  completionMet,
  outputAllowed,
  type ReasoningOutputKind,
  type StageSpec,
} from "./stages.js";
export * from "./grounding.js";
export * from "./support.js";
export * from "./routing-integration.js";
export * from "./retry.js";
export * from "./multipass.js";
export * from "./provenance.js";
export * as reasoningEvents from "./events.js";
