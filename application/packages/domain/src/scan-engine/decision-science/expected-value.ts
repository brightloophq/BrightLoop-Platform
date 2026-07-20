/* =============================================================================
 * Expected value (Sprint 9 §3 · AIS-003 §04) — PURE.
 *
 *   EV        = p·I − (1−p)·L                    (expected value)
 *   EV_C      = EV · C                           (confidence-adjusted)
 *   ROI       = (EV·C − Cost) / Cost             (risk-adjusted, as a BAND)
 *
 * When financial inputs are absent the model returns a NON-FINANCIAL value only:
 * `financialAvailable:false`, financial EV and ROI null. Revenue and ROI are never
 * fabricated (AIS-001 §05 No Hallucinations).
 * ========================================================================== */

import { FORMULA_VERSION, expectedValueSchema, type CostRange, type ExpectedValue, type EngineRecommendation } from "@brightloop/schema";

/** Time discount applied per horizon (AIS-003 §10: value erodes with distance). */
export const HORIZON_DISCOUNT: Record<EngineRecommendation["timeHorizon"], number> = { days: 1.0, weeks: 0.9, quarter: 0.75, quarter_plus: 0.55 };

export interface ExpectedValueInputs {
  /** Projected monetary benefit. Absent ⇒ no financial model is produced. */
  financialBenefit?: number | null;
  /** Estimated cost band. Absent ⇒ ROI is null (never a point estimate). */
  costRange?: CostRange | null;
  /** Loss if the move fails, in the same units as impact. Defaults to effort. */
  lossOnFailure?: number;
}

/**
 * Compute expected value for a recommendation. `expectedBenefit` is always the
 * normalized Index-movement (non-financial) figure, so a value model exists even
 * when money is unknown. Deterministic.
 */
export function computeExpectedValue(rec: EngineRecommendation, inputs: ExpectedValueInputs = {}): ExpectedValue {
  const p = rec.probabilityOfSuccess;
  const impact = rec.impact;
  const loss = inputs.lossOnFailure ?? rec.effort; // failing costs the effort spent
  const limitations: string[] = [];

  // EV = p·I − (1−p)·L
  const expectedBenefit = p * impact - (1 - p) * loss;
  const confidence01 = rec.confidence.value / 100;
  const confidenceAdjusted = expectedBenefit * confidence01;
  const timeAdjusted = confidenceAdjusted * HORIZON_DISCOUNT[rec.timeHorizon];

  const hasFinancial = inputs.financialBenefit !== undefined && inputs.financialBenefit !== null;
  const hasCost = inputs.costRange !== undefined && inputs.costRange !== null;

  let financialExpectedValue: number | null = null;
  let roiRange: { low: number; high: number } | null = null;

  if (hasFinancial) {
    financialExpectedValue = p * inputs.financialBenefit! - (1 - p) * (inputs.costRange?.high ?? 0);
    if (hasCost && inputs.costRange!.low > 0 && inputs.costRange!.high > 0) {
      const evc = financialExpectedValue * confidence01;
      // a band, not a point — width reflects the cost range
      roiRange = { low: (evc - inputs.costRange!.high) / inputs.costRange!.high, high: (evc - inputs.costRange!.low) / inputs.costRange!.low };
    } else {
      limitations.push("Cost range unavailable — ROI not computed (never estimated from a single point).");
    }
  } else {
    limitations.push("Financial inputs unavailable — value reported in non-financial (Index-movement) terms only; ROI and revenue are NOT estimated.");
  }

  return expectedValueSchema.parse({
    recommendationId: rec.id,
    expectedBenefit,
    probabilityOfSuccess: p,
    downsideExposure: (1 - p) * loss,
    implementationRisk: rec.implementationRisk,
    confidenceAdjustedExpectedValue: confidenceAdjusted,
    timeAdjustedValue: timeAdjusted,
    financialAvailable: hasFinancial && hasCost,
    expectedCostRange: inputs.costRange ?? null,
    financialExpectedValue,
    roiRange,
    formulaVersion: FORMULA_VERSION,
    limitations,
  });
}
