/* =============================================================================
 * Canonical reasoning stages (PDF 27 §07 · AIS-001 §05) — PURE.
 *
 * The six-stage flow, each stage fully specified: purpose, required inputs,
 * allowed outputs, preconditions, completion criteria, validation rules, failure
 * modes, retryability, and fallback behaviour. Deterministic predicates gate
 * precondition + completion. No model runs here.
 * ========================================================================== */

import { reasoningStageSchema, type ReasoningStage } from "@brightloop/schema";

/** The output-contract kinds a stage may emit. */
export const REASONING_OUTPUT_KINDS = [
  "research_finding",
  "validated_claim",
  "hypothesis",
  "counter_hypothesis",
  "recommendation_candidate",
  "executive_summary_section",
  "proposal_section",
  "uncertainty_declaration",
  "evidence_citation",
  "validation_result",
] as const;
export type ReasoningOutputKind = (typeof REASONING_OUTPUT_KINDS)[number];

export interface StageSpec {
  stage: ReasoningStage;
  purpose: string;
  requiredInputs: string[];
  allowedOutputs: ReasoningOutputKind[];
  /** Stages that must be complete before this one may run. */
  preconditionStages: ReasoningStage[];
  completionCriteria: string;
  validationRules: string[];
  failureModes: string[];
  retryable: boolean;
  fallbackBehavior: string;
}

export const REASONING_STAGE_SPECS: Record<ReasoningStage, StageSpec> = {
  planner: {
    stage: "planner",
    purpose: "Decide which questions to answer and which evidence each requires.",
    requiredInputs: ["businessContext", "coverage"],
    allowedOutputs: ["hypothesis", "uncertainty_declaration"],
    preconditionStages: [],
    completionCriteria: "An ordered set of questions with the evidence each needs.",
    validationRules: ["objective must be non-empty", "no conclusions emitted at plan time"],
    failureModes: ["over-scoping", "planning against stale coverage"],
    retryable: true,
    fallbackBehavior: "re-plan with a tighter objective; never a full restart",
  },
  research: {
    stage: "research",
    purpose: "Fill the evidence gaps the planner flagged; classify unreachable sources Unavailable.",
    requiredInputs: ["hypothesis", "evidenceRefs"],
    allowedOutputs: ["research_finding", "evidence_citation"],
    preconditionStages: ["planner"],
    completionCriteria: "Each planned question has collected evidence or an Unavailable marker.",
    validationRules: ["every finding cites evidence", "unreachable sources marked Unavailable"],
    failureModes: ["missing evidence", "over-collection"],
    retryable: true,
    fallbackBehavior: "request the missing sources or mark them Unavailable",
  },
  evidence_validation: {
    stage: "evidence_validation",
    purpose: "Cross-check signals for agreement, freshness, and reliability before scoring.",
    requiredInputs: ["research_finding"],
    allowedOutputs: ["validated_claim", "validation_result", "counter_hypothesis"],
    preconditionStages: ["research"],
    completionCriteria: "Every claim carries a validation verdict.",
    validationRules: ["no claim above its evidence confidence", "contradictions reconciled explicitly"],
    failureModes: ["false pass", "false reject"],
    retryable: true,
    fallbackBehavior: "escalate to the critic; lower confidence rather than ignore a critique",
  },
  recommendation: {
    stage: "recommendation",
    purpose: "Derive scored, evidence-linked recommendation candidates from validated findings.",
    requiredInputs: ["validated_claim"],
    allowedOutputs: ["recommendation_candidate"],
    preconditionStages: ["evidence_validation"],
    completionCriteria: "Each candidate carries its full attribute set + evidence link.",
    validationRules: ["a candidate must derive from a validated finding", "impact/difficulty within range"],
    failureModes: ["candidate without a finding", "miscomputed impact"],
    retryable: true,
    fallbackBehavior: "recompute from validated findings",
  },
  executive_summary: {
    stage: "executive_summary",
    purpose: "Render findings into plain-language priorities without losing the evidence trace.",
    requiredInputs: ["recommendation_candidate", "validated_claim"],
    allowedOutputs: ["executive_summary_section"],
    preconditionStages: ["recommendation"],
    completionCriteria: "Every summary section links to its underlying evidence.",
    validationRules: ["no claim beyond the validated set", "limitations stated"],
    failureModes: ["overstated certainty", "unsupported claims"],
    retryable: true,
    fallbackBehavior: "regenerate from the validated set only",
  },
  proposal_writing: {
    stage: "proposal_writing",
    purpose: "Turn approved moves into a client-ready proposal in the Auxion voice.",
    requiredInputs: ["recommendation_candidate"],
    allowedOutputs: ["proposal_section"],
    preconditionStages: ["executive_summary"],
    completionCriteria: "Every proposal section is backed by an approved, evidence-linked candidate.",
    validationRules: ["nothing written without an approved candidate", "state-first, never hyped"],
    failureModes: ["scope drift", "unbacked sections"],
    retryable: true,
    fallbackBehavior: "regenerate from the approved candidate set",
  },
};

export function stageSpec(stage: ReasoningStage): StageSpec {
  return REASONING_STAGE_SPECS[stage];
}

/** All precondition stages of `stage` are in `completedStages`. Pure. */
export function preconditionsMet(stage: ReasoningStage, completedStages: readonly ReasoningStage[]): boolean {
  const done = new Set(completedStages);
  return REASONING_STAGE_SPECS[stage].preconditionStages.every((s) => done.has(s));
}

/** A stage is complete when it produced at least one of its allowed output kinds. */
export function completionMet(stage: ReasoningStage, producedKinds: readonly string[]): boolean {
  const allowed = new Set<string>(REASONING_STAGE_SPECS[stage].allowedOutputs);
  return producedKinds.some((k) => allowed.has(k));
}

/** An output kind is permitted for a stage. Pure. */
export function outputAllowed(stage: ReasoningStage, kind: string): boolean {
  return (REASONING_STAGE_SPECS[stage].allowedOutputs as readonly string[]).includes(kind);
}

export { reasoningStageSchema };
