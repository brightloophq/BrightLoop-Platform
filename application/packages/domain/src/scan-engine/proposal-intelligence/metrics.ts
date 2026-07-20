/* =============================================================================
 * Success metrics (Sprint 11 §7) — PURE.
 *
 * HARD RULES:
 *   · an unavailable baseline STAYS unavailable — never zero, never assumed;
 *   · a target may not be set without a baseline (there is nothing to move from);
 *   · an estimated target is always LABELLED `targetIsEstimated`;
 *   · NO fabricated ROI or revenue uplift — money targets require supplied
 *     financial inputs, and are otherwise refused.
 * ========================================================================== */

import {
  proposalSuccessMetricSchema,
  type EngineRecommendation,
  type EvidenceState,
  type ProposalSuccessMetric,
} from "@brightloop/schema";

export const NO_BASELINE_LIMITATION = "Baseline unavailable; no target is asserted and progress will be measured from first observation.";
export const ESTIMATED_TARGET_LIMITATION = "Target is modelled, not measured — treat as an estimate.";
export const NO_FINANCIAL_LIMITATION = "Financial inputs unavailable; no revenue or ROI target is asserted.";

/** Units that represent money — these require supplied financial evidence. */
const MONETARY_UNITS = new Set(["usd", "eur", "gbp", "revenue", "roi", "currency", "$"]);

export interface MetricInput {
  id: string;
  title: string;
  /** Omit/null when no baseline could be evidenced. */
  baseline?: number | null;
  target?: number | null;
  targetIsEstimated?: boolean;
  unit?: string | null;
  measurementMethod: string;
  dataSource?: string | null;
  cadence?: ProposalSuccessMetric["cadence"];
  ownerRole?: string | null;
  confidence: number;
  evidenceState: EvidenceState;
  evidenceIds?: string[];
  targetHorizon?: ProposalSuccessMetric["targetHorizon"];
  reviewThreshold?: number | null;
  affectedDomains?: ProposalSuccessMetric["affectedDomains"];
  /** Set true only when the caller supplied real financial evidence. */
  financialInputsAvailable?: boolean;
}

/**
 * Build a success metric under the no-fabrication rules. Returns the metric with
 * any refused target nulled and the reason recorded in `limitations`. Pure.
 */
export function buildSuccessMetric(input: MetricInput): ProposalSuccessMetric {
  const limitations: string[] = [];
  const baselineAvailable = input.baseline !== undefined && input.baseline !== null;
  let target = input.target ?? null;
  let targetIsEstimated = input.targetIsEstimated ?? false;

  if (!baselineAvailable) {
    if (target !== null) limitations.push("Target supplied without a baseline; target withheld.");
    target = null; // no baseline ⇒ no target
    limitations.push(NO_BASELINE_LIMITATION);
  }

  const unit = (input.unit ?? "").toLowerCase();
  const isMonetary = MONETARY_UNITS.has(unit);
  if (isMonetary && input.financialInputsAvailable !== true) {
    if (target !== null) limitations.push("Monetary target refused: no financial inputs were supplied.");
    target = null; // never fabricate revenue/ROI
    limitations.push(NO_FINANCIAL_LIMITATION);
  }

  if (target !== null && input.evidenceState !== "observed") {
    targetIsEstimated = true; // a target from non-observed evidence is an estimate
  }
  if (targetIsEstimated && target !== null) limitations.push(ESTIMATED_TARGET_LIMITATION);

  return proposalSuccessMetricSchema.parse({
    id: input.id,
    title: input.title,
    baseline: baselineAvailable ? input.baseline! : null,
    baselineAvailable,
    target,
    targetIsEstimated: target === null ? false : targetIsEstimated,
    unit: input.unit ?? null,
    measurementMethod: input.measurementMethod,
    dataSource: input.dataSource ?? null,
    cadence: input.cadence ?? "unspecified",
    ownerRole: input.ownerRole ?? null,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    evidenceState: input.evidenceState,
    evidenceIds: input.evidenceIds ?? [],
    targetHorizon: input.targetHorizon ?? "unavailable",
    reviewThreshold: input.reviewThreshold ?? null,
    affectedDomains: input.affectedDomains ?? [],
    limitations,
  });
}

/**
 * Derive metrics from a recommendation's declared success metrics. No baseline is
 * invented — each starts unavailable until measured. Deterministic.
 */
export function metricsFromRecommendations(
  recommendations: readonly EngineRecommendation[],
  idFor: (rec: EngineRecommendation, index: number) => string,
): ProposalSuccessMetric[] {
  const out: ProposalSuccessMetric[] = [];
  let index = 0;
  for (const rec of [...recommendations].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    for (const m of rec.successMetrics) {
      out.push(
        buildSuccessMetric({
          id: idFor(rec, index++),
          title: m.key,
          measurementMethod: m.description,
          baseline: null, // never invented
          confidence: rec.confidence.value,
          evidenceState: rec.evidenceState,
          evidenceIds: rec.evidenceIds,
          affectedDomains: m.dimension === null ? rec.affectedDomains : [m.dimension],
          targetHorizon: "unavailable",
        }),
      );
    }
  }
  return out;
}
