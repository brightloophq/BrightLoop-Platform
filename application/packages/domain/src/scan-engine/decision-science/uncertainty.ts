/* =============================================================================
 * Uncertainty & missing data (Sprint 9 §5 · AIS-003 §03) — PURE.
 *
 * Deterministic treatment of thin, stale, contradicted, or inferred-only evidence.
 * HARD RULES enforced here:
 *   · confidence may LOWER priority; it may never raise it because data is missing
 *   · a contradicted recommendation always requires review
 *   · an inferred-only recommendation may not auto-escalate to critical
 *   · unavailable evidence is never silently converted to zero
 * ========================================================================== */

import {
  uncertaintyAssessmentSchema,
  type FactorSet,
  type EngineRecommendation,
  type UncertaintyAssessment,
  type UncertaintyFlag,
} from "@brightloop/schema";
import { unavailableFactors } from "./factors.js";

/** Multiplicative penalties per flag — all ≤ 1, so priority can only fall. */
export const FLAG_PENALTY: Record<UncertaintyFlag, number> = {
  missing_evidence: 0.8,
  unavailable_financial_data: 1.0, // declared, not penalized — absence ≠ badness
  contradictory_evidence: 0.7,
  low_confidence_estimate: 0.85,
  stale_evidence: 0.75,
  inferred_only: 0.8,
  unresolved_dependency: 0.9,
};

export const LOW_CONFIDENCE_THRESHOLD = 50;

export interface UncertaintyInputs {
  /** Evidence freshness band, when known. `stale`/`expired` flags stale evidence. */
  freshnessBand?: "fresh" | "recent" | "stale" | "expired";
  unresolvedDependencies?: number;
  minimumEvidenceCount?: number;
}

/**
 * Assess a recommendation's uncertainty. Returns the flags, the combined
 * multiplicative confidence penalty (0,1], whether review is forced, and whether
 * the item is barred from critical escalation. Deterministic.
 */
export function assessUncertainty(rec: EngineRecommendation, factors: FactorSet, inputs: UncertaintyInputs = {}): UncertaintyAssessment {
  const flags: UncertaintyFlag[] = [];
  const notes: string[] = [];

  const minEvidence = inputs.minimumEvidenceCount ?? 2;
  if (rec.evidenceIds.length < minEvidence) {
    flags.push("missing_evidence");
    notes.push(`Only ${rec.evidenceIds.length} evidence record(s); coverage below the ${minEvidence}-record policy.`);
  }
  if (unavailableFactors(factors).includes("financial_impact")) {
    flags.push("unavailable_financial_data");
    notes.push("Financial impact unavailable — value reported in non-financial terms only.");
  }
  if (rec.contradictionStatus === "contradicted") {
    flags.push("contradictory_evidence");
    notes.push("Contradiction unresolved — surfaced, never averaged away.");
  }
  if (rec.confidence.value < LOW_CONFIDENCE_THRESHOLD) {
    flags.push("low_confidence_estimate");
    notes.push(`Confidence ${rec.confidence.value} below the ${LOW_CONFIDENCE_THRESHOLD} threshold.`);
  }
  if (inputs.freshnessBand === "stale" || inputs.freshnessBand === "expired") {
    flags.push("stale_evidence");
    notes.push(`Evidence freshness is ${inputs.freshnessBand}.`);
  }
  if (rec.evidenceState === "inferred" || rec.evidenceState === "unavailable") {
    flags.push("inferred_only");
    notes.push("Rests on inferred/unavailable evidence — cannot auto-escalate to a critical action.");
  }
  const unresolved = inputs.unresolvedDependencies ?? 0;
  if (unresolved > 0) {
    flags.push("unresolved_dependency");
    notes.push(`${unresolved} unresolved prerequisite(s).`);
  }

  const confidencePenalty = flags.reduce((acc, f) => acc * FLAG_PENALTY[f], 1);
  return uncertaintyAssessmentSchema.parse({
    recommendationId: rec.id,
    flags,
    confidencePenalty: Math.min(1, confidencePenalty), // clamped — can never exceed 1
    reviewRequired: flags.includes("contradictory_evidence") || flags.includes("low_confidence_estimate") || rec.reviewRequired,
    blockedFromCritical: flags.includes("inferred_only"),
    notes,
  });
}

/** A tier that respects the inferred-only bar on critical escalation. Pure. */
export function permittedTier(rec: EngineRecommendation, assessment: UncertaintyAssessment): EngineRecommendation["tier"] {
  if (rec.tier === "critical_risk" && assessment.blockedFromCritical) return "strategic_win";
  return rec.tier;
}
