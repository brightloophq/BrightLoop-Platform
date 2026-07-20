/* =============================================================================
 * Decision-science integration (Sprint 10 §13) — PURE.
 *
 * Produces explicit, VERSIONED competitor factors that Sprint 9 may consume as
 * additional context. This module OFFERS inputs; it never writes to, overwrites,
 * or re-ranks an existing recommendation score. Nothing here generates a
 * recommendation — that remains Sprint 9's responsibility.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  competitorDecisionInputSchema,
  type CompetitiveGap,
  type CompetitorDecisionFactorKey,
  type CompetitorDecisionInput,
  type CompetitorSetConfidence,
  type GapSeverity,
  type MarketPosition,
} from "@brightloop/schema";

/** Severity → a 0–100 magnitude for the market-gap factor. */
const SEVERITY_VALUE: Record<GapSeverity, number> = { critical: 100, high: 75, moderate: 50, low: 25, none: 0 };

export interface DecisionInputsOptions {
  scanId: string;
  gaps: readonly CompetitiveGap[];
  marketPosition?: MarketPosition | null;
  setConfidence?: CompetitorSetConfidence | null;
  competitorIds?: readonly string[];
}

/**
 * Build one decision input per gap that carries a usable signal. Gaps of type
 * `unknown` are SKIPPED — an unevidenced gap must not nudge a recommendation score.
 * Deterministic (dimension-ordered).
 */
export function buildDecisionInputs(opts: DecisionInputsOptions): CompetitorDecisionInput[] {
  const coverage = opts.marketPosition?.evidenceCoverage ?? 0;
  const setQuality = opts.setConfidence?.score ?? 0;
  const competitorIds = [...(opts.competitorIds ?? [])].sort();

  return [...opts.gaps]
    .filter((g) => g.type !== "unknown")
    .sort((a, b) => (a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0))
    .map((gap) => {
      const differentiation = gap.type === "advantage" ? Math.min(100, Math.abs(gap.absoluteGap ?? 0) * 2) : 0;
      const threatUrgency = gap.type === "deficit" ? SEVERITY_VALUE[gap.severity] : 0;

      const factors: { key: CompetitorDecisionFactorKey; value: number; sourceInputs: string[]; limitations: string[] }[] = [
        { key: "market_gap_severity", value: SEVERITY_VALUE[gap.severity], sourceInputs: [`gap:${gap.id}`], limitations: [] },
        { key: "benchmark_confidence", value: gap.confidence, sourceInputs: [`gap:${gap.id}.confidence`], limitations: gap.limitations },
        { key: "differentiation_potential", value: Math.round(differentiation), sourceInputs: [`gap:${gap.id}.type`], limitations: [] },
        { key: "threat_urgency", value: threatUrgency, sourceInputs: [`gap:${gap.id}.severity`], limitations: [] },
        { key: "evidence_coverage", value: Math.round(coverage * 100), sourceInputs: ["marketPosition.evidenceCoverage"], limitations: opts.marketPosition === null || opts.marketPosition === undefined ? ["Market position unavailable; coverage reported as 0."] : [] },
        { key: "competitor_set_quality", value: setQuality, sourceInputs: ["setConfidence.score"], limitations: opts.setConfidence == null ? ["Set confidence unavailable; quality reported as 0."] : [] },
      ];

      return competitorDecisionInputSchema.parse({
        scanId: opts.scanId,
        dimension: gap.dimension,
        gapIds: [gap.id],
        competitorIds,
        factors,
        supportingContext: `Competitor-evidenced ${gap.type} on ${gap.dimension} (severity ${gap.severity}).`,
        evidenceIds: gap.evidenceIds,
        confidence: gap.confidence,
        formulaVersion: COMPETITOR_FORMULA_VERSION,
      });
    });
}

/** Look up a factor value from a built input. Pure. */
export function decisionFactorValue(input: CompetitorDecisionInput, key: CompetitorDecisionFactorKey): number | null {
  return input.factors.find((f) => f.key === key)?.value ?? null;
}
