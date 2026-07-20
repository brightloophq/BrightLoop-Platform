/* =============================================================================
 * Competitor-set confidence (Sprint 10 §14 · AIS-005 §05) — PURE.
 *
 * A versioned quality read on the competitor SET itself, not on any one rival.
 * Nine weighted factors; ambiguity and unavailable data pull the score DOWN.
 *
 * HARD RULE: a low-quality set must not support strong market claims —
 * `supportsMarketClaims` gates every downstream "leader/ahead of market" statement.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  competitorSetConfidenceSchema,
  type CompetitorSetConfidence,
  type ConfidenceBand,
  type EngineCompetitorBenchmark,
  type EngineCompetitorCandidate,
  type SetConfidenceFactorKey,
  type SimilarityScore,
} from "@brightloop/schema";
import { benchmarkCoverage } from "./benchmarks.js";

export const SET_CONFIDENCE_WEIGHTS: Record<SetConfidenceFactorKey, number> = {
  candidate_count: 0.12,
  validated_share: 0.16,
  evidence_coverage: 0.18,
  evidence_freshness: 0.1,
  geographic_relevance: 0.1,
  industry_similarity: 0.12,
  data_availability: 0.08,
  ambiguity_rate: 0.07, // inverted
  unavailable_rate: 0.07, // inverted
};

/** The set size at/above which the count factor saturates. */
export const IDEAL_SET_SIZE = 5;
/** Below this score the set may not support market claims. */
export const MIN_SET_CONFIDENCE_FOR_CLAIMS = 60;

export function confidenceBandFor(score: number): ConfidenceBand {
  if (score >= 85) return "very_high";
  if (score >= 65) return "high";
  if (score >= 45) return "moderate";
  if (score >= 25) return "low";
  return "very_low";
}

export interface SetConfidenceInput {
  candidates: readonly EngineCompetitorCandidate[];
  selectedIds: readonly string[];
  similarities?: ReadonlyMap<string, SimilarityScore>;
  benchmarks?: readonly EngineCompetitorBenchmark[];
  dimensions?: readonly EngineCompetitorBenchmark["dimension"][];
  /** Share of benchmark evidence that is fresh, 0–1. Defaults to a declared 0.5. */
  freshnessShare?: number;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Compute the competitor-set confidence. Deterministic. */
export function computeSetConfidence(input: SetConfidenceInput): CompetitorSetConfidence {
  const limitations: string[] = [];
  const warnings: string[] = [];
  const total = input.candidates.length;
  const selected = input.selectedIds.length;

  const validated = input.candidates.filter((c) => c.status === "validated").length;
  const ambiguous = input.candidates.filter((c) => c.status === "ambiguous").length;
  const unavailable = input.candidates.filter((c) => c.status === "unavailable").length;

  const selectedCandidates = input.candidates.filter((c) => input.selectedIds.includes(c.id));
  const sims = selectedCandidates.map((c) => input.similarities?.get(c.id)).filter((s): s is SimilarityScore => s !== undefined);
  const factorMean = (key: string) => mean(sims.map((s) => s.factors.find((f) => f.key === key)?.score ?? 0).filter((v) => v > 0));

  const dimensions = input.dimensions ?? [];
  const coverage =
    input.benchmarks === undefined || dimensions.length === 0 || selected === 0
      ? 0
      : mean(input.selectedIds.map((id) => benchmarkCoverage(input.benchmarks!, dimensions, id)));

  if (input.freshnessShare === undefined) limitations.push("Evidence freshness share not supplied; a neutral policy default was applied.");
  if (selected < 3) warnings.push(`Only ${selected} competitor(s) in the set; comparisons rest on a thin base.`);
  if (dimensions.length === 0) limitations.push("No benchmark dimensions supplied; evidence coverage could not be measured.");

  const values: Record<SetConfidenceFactorKey, number> = {
    candidate_count: Math.min(100, (selected / IDEAL_SET_SIZE) * 100),
    validated_share: total === 0 ? 0 : (validated / total) * 100,
    evidence_coverage: coverage * 100,
    evidence_freshness: (input.freshnessShare ?? 0.5) * 100,
    geographic_relevance: factorMean("geography_relevance"),
    industry_similarity: factorMean("industry_similarity"),
    data_availability: factorMean("data_availability"),
    ambiguity_rate: total === 0 ? 0 : 100 - (ambiguous / total) * 100, // inverted: less ambiguity is better
    unavailable_rate: total === 0 ? 0 : 100 - (unavailable / total) * 100,
  };

  const contributions = (Object.keys(SET_CONFIDENCE_WEIGHTS) as SetConfidenceFactorKey[])
    .sort()
    .map((key) => {
      const weight = SET_CONFIDENCE_WEIGHTS[key];
      const value = Math.max(0, Math.min(100, values[key]));
      return { key, weight, value, contribution: weight * value };
    });

  const score = Math.round(contributions.reduce((acc, c) => acc + c.contribution, 0));
  const supportsMarketClaims = score >= MIN_SET_CONFIDENCE_FOR_CLAIMS && selected >= 3;
  if (!supportsMarketClaims) warnings.push("Competitor-set quality is insufficient to support strong market claims.");

  return competitorSetConfidenceSchema.parse({
    score,
    band: confidenceBandFor(score),
    contributions,
    supportsMarketClaims,
    limitations,
    warnings,
    formulaVersion: COMPETITOR_FORMULA_VERSION,
  });
}
