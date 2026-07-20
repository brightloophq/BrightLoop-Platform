/* =============================================================================
 * Market position (Sprint 10 §10 · AIS-005 §07) — PURE.
 *
 *   Lead = Σ wk · percentilek(client | set)
 *
 * The client's weighted percentile across the evidenced dimensions, carried with
 * the set's COVERAGE so its reliability is visible.
 *
 * HARD RULE: a market claim ("leader", "ahead of the market") is only supported
 * when coverage AND competitor-set quality clear policy. Below that,
 * `supportsMarketClaims` is false and `overallPercentile` may be null — the engine
 * reports an unreliable read rather than an unsupported claim.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  marketPositionSchema,
  type BenchmarkDimension,
  type CompetitiveGap,
  type EngineCompetitorBenchmark,
  type MarketPosition,
} from "@brightloop/schema";
import { percentileRank } from "./normalize.js";
import { clientBenchmark, competitorBenchmarks } from "./benchmarks.js";

/** Minimum share of dimensions evidenced before a market claim is supportable. */
export const MIN_COVERAGE_FOR_CLAIMS = 0.6;
/** Minimum competitor-set quality (0–100) before a market claim is supportable. */
export const MIN_SET_QUALITY_FOR_CLAIMS = 60;
/** Minimum evidenced rivals per dimension for its percentile to count. */
export const MIN_RIVALS_PER_DIMENSION = 2;

export const STRONG_PERCENTILE = 75;
export const WEAK_PERCENTILE = 35;

export interface MarketPositionInput {
  scanId: string;
  dimensions: readonly BenchmarkDimension[];
  benchmarks: readonly EngineCompetitorBenchmark[];
  gaps?: readonly CompetitiveGap[];
  /** Per-dimension weights; defaults to equal weighting over evidenced dimensions. */
  weights?: Partial<Record<BenchmarkDimension, number>>;
  competitorSetQuality: number;
  provenance?: Record<string, unknown>;
}

/**
 * Assemble the market position. Dimensions without a client value or without
 * enough evidenced rivals are listed `unavailable` and EXCLUDED from the weighted
 * percentile — never scored as zero. Deterministic.
 */
export function buildMarketPosition(input: MarketPositionInput): MarketPosition {
  const dimensionPercentiles: Record<string, number> = {};
  const unavailable: BenchmarkDimension[] = [];
  const limitations: string[] = [];

  for (const dimension of input.dimensions) {
    const client = clientBenchmark(input.benchmarks, dimension);
    const rivals = competitorBenchmarks(input.benchmarks, dimension).filter((b) => b.available && b.normalizedScore !== null);
    const clientScore = client !== null && client.available ? client.normalizedScore : null;

    if (clientScore === null || rivals.length < MIN_RIVALS_PER_DIMENSION) {
      unavailable.push(dimension);
      continue;
    }
    const pct = percentileRank(clientScore, rivals.map((r) => r.normalizedScore));
    if (pct === null) {
      unavailable.push(dimension);
      continue;
    }
    dimensionPercentiles[dimension] = pct;
  }

  const scored = Object.keys(dimensionPercentiles) as BenchmarkDimension[];
  const evidenceCoverage = input.dimensions.length === 0 ? 0 : scored.length / input.dimensions.length;

  // weighted percentile over the evidenced dimensions only (weights redistributed)
  const weightOf = (d: BenchmarkDimension) => input.weights?.[d] ?? 1;
  const weightTotal = scored.reduce((acc, d) => acc + weightOf(d), 0);
  const overallPercentile =
    scored.length === 0 || weightTotal === 0 ? null : Math.round(scored.reduce((acc, d) => acc + (weightOf(d) / weightTotal) * dimensionPercentiles[d]!, 0));

  if (unavailable.length > 0) limitations.push(`${unavailable.length} dimension(s) lacked evidence on one side and were excluded from the percentile (not scored as zero).`);
  if (evidenceCoverage < MIN_COVERAGE_FOR_CLAIMS) limitations.push(`Evidence coverage ${Math.round(evidenceCoverage * 100)}% is below the ${Math.round(MIN_COVERAGE_FOR_CLAIMS * 100)}% policy for market claims.`);
  if (input.competitorSetQuality < MIN_SET_QUALITY_FOR_CLAIMS) limitations.push(`Competitor-set quality ${input.competitorSetQuality} is below the ${MIN_SET_QUALITY_FOR_CLAIMS} policy for market claims.`);

  const supportsMarketClaims = evidenceCoverage >= MIN_COVERAGE_FOR_CLAIMS && input.competitorSetQuality >= MIN_SET_QUALITY_FOR_CLAIMS && overallPercentile !== null;
  if (!supportsMarketClaims) limitations.push("Insufficient basis for market-standing claims such as 'market leader'.");

  const byPercentile = [...scored].sort((a, b) => (dimensionPercentiles[b]! !== dimensionPercentiles[a]! ? dimensionPercentiles[b]! - dimensionPercentiles[a]! : a < b ? -1 : 1));
  const strongest = byPercentile.filter((d) => dimensionPercentiles[d]! >= STRONG_PERCENTILE);
  const weakest = byPercentile.filter((d) => dimensionPercentiles[d]! <= WEAK_PERCENTILE).reverse();
  const parity = byPercentile.filter((d) => dimensionPercentiles[d]! > WEAK_PERCENTILE && dimensionPercentiles[d]! < STRONG_PERCENTILE);

  // defensible = strong AND backed by a confident advantage gap
  const gapByDimension = new Map((input.gaps ?? []).map((g) => [g.dimension, g]));
  const defensible = strongest.filter((d) => {
    const g = gapByDimension.get(d);
    return g !== undefined && g.type === "advantage" && g.confidence >= 50;
  });
  const material = weakest.filter((d) => {
    const g = gapByDimension.get(d);
    return g !== undefined && g.type === "deficit" && (g.severity === "high" || g.severity === "critical");
  });

  const confidence = Math.round(evidenceCoverage * 100 * (input.competitorSetQuality / 100));

  return marketPositionSchema.parse({
    scanId: input.scanId,
    overallPercentile,
    dimensionPercentiles,
    strongestDimensions: strongest,
    weakestDimensions: weakest,
    parityDimensions: parity,
    defensibleAdvantages: defensible,
    materialDeficits: material,
    confidence,
    evidenceCoverage,
    competitorSetQuality: input.competitorSetQuality,
    unavailableDimensions: unavailable,
    supportsMarketClaims,
    limitations,
    provenance: input.provenance ?? {},
    formulaVersion: COMPETITOR_FORMULA_VERSION,
  });
}
