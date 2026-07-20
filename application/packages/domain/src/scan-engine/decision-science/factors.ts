/* =============================================================================
 * Scoring factors (Sprint 9 §2 · AIS-003 §01 Normalization) — PURE.
 *
 * The twelve criteria, each normalized to 0–100 and each carrying its source
 * inputs, formula version, limitations, and missing-data treatment. A factor that
 * cannot be computed returns `value: null` with treatment `unavailable` — it is
 * EXCLUDED from the score rather than silently defaulted to zero.
 * ========================================================================== */

import {
  FORMULA_VERSION,
  factorSetSchema,
  type FactorSet,
  type EngineRecommendation,
  type ScoringFactor,
  type ScoringFactorKey,
} from "@brightloop/schema";

/** Inputs the caller may supply; absent ones are declared, never invented. */
export interface FactorInputs {
  /** Projected monetary effect. Absent ⇒ financial_impact is `unavailable`. */
  financialImpact?: number | null;
  /** 0–100 evidence quality; defaults to the confidence-derived proxy. */
  evidenceQuality?: number;
  /** 0–100; how reversible the move is. Absent ⇒ policy default. */
  reversibility?: number;
  /** Count of unmet prerequisites, for dependency burden. */
  unresolvedDependencies?: number;
}

export const DEFAULT_REVERSIBILITY = 50;
const TIME_TO_VALUE: Record<EngineRecommendation["timeHorizon"], number> = { days: 100, weeks: 75, quarter: 45, quarter_plus: 20 };

function factor(key: ScoringFactorKey, value: number | null, sourceInputs: string[], treatment: ScoringFactor["missingDataTreatment"], limitations: string[] = []): ScoringFactor {
  return { key, value: value === null ? null : Math.max(0, Math.min(100, Math.round(value))), sourceInputs, formulaVersion: FORMULA_VERSION, limitations, missingDataTreatment: treatment };
}

/** Compute all twelve factors for a recommendation. Deterministic. */
export function computeFactors(rec: EngineRecommendation, inputs: FactorInputs = {}): FactorSet {
  const depBurden = inputs.unresolvedDependencies ?? rec.dependencies.length;
  const factors: ScoringFactor[] = [
    factor("business_impact", rec.impact, ["recommendation.impact"], "observed"),
    inputs.financialImpact === undefined || inputs.financialImpact === null
      ? factor("financial_impact", null, [], "unavailable", ["No financial inputs available; financial impact is not modelled and is excluded from scoring."])
      : factor("financial_impact", Math.min(100, inputs.financialImpact), ["inputs.financialImpact"], "observed"),
    factor("urgency", rec.urgency, ["recommendation.urgency"], "observed"),
    factor("strategic_alignment", rec.strategicAlignment, ["recommendation.strategicAlignment"], "observed"),
    factor("confidence", rec.confidence.value, ["recommendation.confidence.value"], "observed"),
    inputs.evidenceQuality === undefined
      ? factor("evidence_quality", proxyEvidenceQuality(rec), ["recommendation.confidence.inputs", "recommendation.evidenceState"], "policy_default", ["Evidence quality derived from confidence inputs + evidence state (no direct measure supplied)."])
      : factor("evidence_quality", inputs.evidenceQuality, ["inputs.evidenceQuality"], "observed"),
    factor("probability_of_success", rec.probabilityOfSuccess * 100, ["recommendation.probabilityOfSuccess"], "observed"),
    factor("implementation_effort", rec.effort, ["recommendation.effort"], "observed"),
    factor("implementation_risk", rec.implementationRisk, ["recommendation.implementationRisk"], "observed"),
    factor("dependency_burden", Math.min(100, depBurden * 25), ["recommendation.dependencies"], "observed"),
    factor("time_to_value", TIME_TO_VALUE[rec.timeHorizon], ["recommendation.timeHorizon"], "observed"),
    inputs.reversibility === undefined
      ? factor("reversibility", DEFAULT_REVERSIBILITY, [], "policy_default", ["Reversibility not supplied; neutral policy default applied."])
      : factor("reversibility", inputs.reversibility, ["inputs.reversibility"], "observed"),
  ];
  return factorSetSchema.parse({ recommendationId: rec.id, factors, formulaVersion: FORMULA_VERSION });
}

/** Evidence quality proxy: the confidence factor product, capped by evidence state. Pure. */
export function proxyEvidenceQuality(rec: EngineRecommendation): number {
  const i = rec.confidence.inputs;
  const stateCap: Record<EngineRecommendation["evidenceState"], number> = { observed: 100, estimated: 80, inferred: 60, unavailable: 20 };
  const base = ((i.coverage + i.reliability + i.freshness + i.agreement + i.completeness + i.provenanceQuality) / 6) * 100;
  return Math.min(stateCap[rec.evidenceState], base);
}

export function factorValue(set: FactorSet, key: ScoringFactorKey): number | null {
  return set.factors.find((f) => f.key === key)?.value ?? null;
}

/** Factors that could not be computed — surfaced, never hidden. Pure. */
export function unavailableFactors(set: FactorSet): ScoringFactorKey[] {
  return set.factors.filter((f) => f.missingDataTreatment === "unavailable").map((f) => f.key);
}
