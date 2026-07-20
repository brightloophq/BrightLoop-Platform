/* =============================================================================
 * Priority score (Sprint 9 §4 · AIS-003 §06) — PURE.
 *
 *   π = C · (wI·I + wO·O + wR·R + wS·S) · U / (E + ε)
 *
 * Confidence-scaled weighted value, amplified by urgency, divided by effort — then
 * further reduced by explicit risk / dependency / uncertainty penalties. Critical
 * risks receive the AIS-003 override that floors priority above optimization.
 *
 * `raw` is the unbounded π; `total` is a monotonic 0–100 squash (π/(π+1)), so the
 * ranking induced by either is IDENTICAL. Every score reports its contributions,
 * penalties, warnings, formula version, and a STRUCTURED rationale — never prose.
 * ========================================================================== */

import {
  FORMULA_VERSION,
  priorityScoreSchema,
  type DecisionWeights,
  type FactorContribution,
  type FactorSet,
  type Penalty,
  type PriorityScore,
  type EngineRecommendation,
  type ScoringFactorKey,
  type UncertaintyAssessment,
} from "@brightloop/schema";
import { factorValue } from "./factors.js";

/** AIS-003 §08 worked-example weights (impact .35, opportunity .25, risk .20, strategic .20). */
export const DEFAULT_WEIGHTS: DecisionWeights = { impact: 0.35, opportunity: 0.25, riskReduction: 0.2, strategicAlignment: 0.2 };

/** ε in the effort denominator — keeps a zero-effort move finite. */
export const EFFORT_EPSILON = 0.05;
/** Floor applied to a critical risk so it outranks optimization (AIS-003 §06). */
export const CRITICAL_RISK_FLOOR = 90;

export function weightsSumToOne(w: DecisionWeights): boolean {
  return Math.abs(w.impact + w.opportunity + w.riskReduction + w.strategicAlignment - 1) < 1e-9;
}

/** Monotonic squash of the unbounded π into 0–100. Order-preserving. Pure. */
export function normalizePriority(raw: number): number {
  const positive = Math.max(0, raw);
  return Math.round((positive / (positive + 1)) * 100);
}

export interface PriorityInputs {
  weights?: DecisionWeights;
  uncertainty?: UncertaintyAssessment;
  /** Unmet prerequisites, for the dependency penalty. */
  unresolvedDependencies?: number;
}

/**
 * Compute the priority score. Missing factors are EXCLUDED from the weighted value
 * (their weight is redistributed across the available criteria) rather than treated
 * as zero — absence must not masquerade as a measured low score.
 */
export function computePriority(rec: EngineRecommendation, factors: FactorSet, inputs: PriorityInputs = {}): PriorityScore {
  const weights = inputs.weights ?? DEFAULT_WEIGHTS;
  const warnings: string[] = [];
  if (!weightsSumToOne(weights)) warnings.push("Decision weights do not sum to 1; score comparability is not guaranteed.");

  // criterion → (weight, factor key). "opportunity" is carried by time-to-value +
  // probability of success; "riskReduction" is the inverse of implementation risk.
  const criteria: { key: ScoringFactorKey; weight: number; invert?: boolean }[] = [
    { key: "business_impact", weight: weights.impact },
    { key: "probability_of_success", weight: weights.opportunity },
    { key: "implementation_risk", weight: weights.riskReduction, invert: true },
    { key: "strategic_alignment", weight: weights.strategicAlignment },
  ];

  const present = criteria.filter((c) => factorValue(factors, c.key) !== null);
  const missing = criteria.filter((c) => factorValue(factors, c.key) === null);
  for (const m of missing) warnings.push(`Criterion ${m.key} unavailable; its weight was redistributed (not scored as zero).`);

  const weightTotal = present.reduce((acc, c) => acc + c.weight, 0);
  const contributions: FactorContribution[] = present.map((c) => {
    const v = factorValue(factors, c.key)!;
    const normalized = (c.invert === true ? 100 - v : v) / 100;
    const effectiveWeight = weightTotal > 0 ? c.weight / weightTotal : 0; // redistribute
    return { key: c.key, weight: effectiveWeight, normalizedValue: normalized, contribution: effectiveWeight * normalized };
  });

  const weightedValue = contributions.reduce((acc, c) => acc + c.contribution, 0);
  const confidence01 = rec.confidence.value / 100;
  const urgency01 = rec.urgency / 100;
  const effort01 = rec.effort / 100;

  // ---- π = C · value · U / (E + ε)
  let raw = (confidence01 * weightedValue * urgency01) / (effort01 + EFFORT_EPSILON);

  // ---- explicit penalties (all reduce; none can raise the score)
  const penalties: Penalty[] = [];
  const uncertaintyPenalty = inputs.uncertainty?.confidencePenalty ?? 1;
  if (uncertaintyPenalty < 1) {
    raw *= uncertaintyPenalty;
    penalties.push({ key: "uncertainty", amount: uncertaintyPenalty, kind: "multiplier", reason: `flags: ${inputs.uncertainty!.flags.join(", ")}` });
  }
  const unresolved = inputs.unresolvedDependencies ?? 0;
  if (unresolved > 0) {
    const depPenalty = Math.max(0.5, 1 - unresolved * 0.1);
    raw *= depPenalty;
    penalties.push({ key: "dependency", amount: depPenalty, kind: "multiplier", reason: `${unresolved} unresolved prerequisite(s)` });
  }
  if (rec.implementationRisk > 70) {
    const riskPenalty = 0.9;
    raw *= riskPenalty;
    penalties.push({ key: "implementation_risk", amount: riskPenalty, kind: "multiplier", reason: `implementation risk ${rec.implementationRisk}` });
  }

  let total = normalizePriority(raw);

  // ---- critical-risk override: floor above optimization, regardless of effort
  const blockedFromCritical = inputs.uncertainty?.blockedFromCritical === true;
  const criticalOverride = rec.tier === "critical_risk" && !blockedFromCritical;
  if (criticalOverride) {
    total = Math.max(total, CRITICAL_RISK_FLOOR);
  } else if (rec.tier === "critical_risk" && blockedFromCritical) {
    warnings.push("Critical-risk override withheld: recommendation rests on inferred-only evidence.");
  }

  const sorted = [...contributions].sort((a, b) => b.contribution - a.contribution);
  return priorityScoreSchema.parse({
    recommendationId: rec.id,
    total,
    raw,
    weightedValue,
    contributions,
    penalties,
    warnings,
    formulaVersion: FORMULA_VERSION,
    rationale: {
      dominantFactors: sorted.slice(0, 2).map((c) => c.key),
      limitingFactors: sorted.slice(-1).map((c) => c.key),
      criticalRiskOverride: criticalOverride,
      confidenceScaled: true,
    },
  });
}
