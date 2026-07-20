/* =============================================================================
 * Sensitivity analysis (Sprint 9 §10 · AIS-003 §09) — PURE.
 *
 *   stable(r) ⟺ argmax unchanged for all wk ± δ
 *
 * Each weight is perturbed by ±δ (re-normalized to sum to 1) and the ranking is
 * recomputed. Items whose rank never moves are robust; items that move are
 * fragile and flagged so an operator knows the call is close. Fully deterministic
 * enumeration — NO Monte Carlo (AIS-003 §10 reserves simulation for genuinely
 * distributional, interacting inputs, which this is not).
 * ========================================================================== */

import {
  FORMULA_VERSION,
  sensitivityAnalysisSchema,
  type DecisionWeights,
  type ExpectedValue,
  type FactorSet,
  type EngineRecommendation,
  type SensitivityAnalysis,
  type SensitivityEntry,
  type UncertaintyAssessment,
} from "@brightloop/schema";
import { computePriority, DEFAULT_WEIGHTS } from "./priority.js";
import { rankRecommendations } from "./ranking.js";

export const DEFAULT_DELTA = 0.05;
/** A ranking is called fragile when more than this share of items move. */
export const FRAGILE_THRESHOLD = 0.5;

const WEIGHT_KEYS: (keyof DecisionWeights)[] = ["impact", "opportunity", "riskReduction", "strategicAlignment"];

/** Perturb one weight by `delta` and re-normalize so the set still sums to 1. Pure. */
export function perturbWeights(weights: DecisionWeights, key: keyof DecisionWeights, delta: number): DecisionWeights {
  const raw: DecisionWeights = { ...weights, [key]: Math.max(0, weights[key] + delta) };
  const sum = WEIGHT_KEYS.reduce((acc, k) => acc + raw[k], 0);
  if (sum === 0) return weights;
  return { impact: raw.impact / sum, opportunity: raw.opportunity / sum, riskReduction: raw.riskReduction / sum, strategicAlignment: raw.strategicAlignment / sum };
}

export interface SensitivityInput {
  recommendations: readonly EngineRecommendation[];
  factorSets: ReadonlyMap<string, FactorSet>;
  uncertainties?: ReadonlyMap<string, UncertaintyAssessment>;
  expectedValues?: ReadonlyMap<string, ExpectedValue>;
  blockedIds?: readonly string[];
  baseWeights?: DecisionWeights;
  delta?: number;
}

function rankMap(input: SensitivityInput, weights: DecisionWeights): Map<string, number> {
  const priorities = new Map(
    input.recommendations.map((r) => [
      r.id,
      computePriority(r, input.factorSets.get(r.id)!, { weights, uncertainty: input.uncertainties?.get(r.id) }),
    ]),
  );
  const result = rankRecommendations({
    recommendations: input.recommendations,
    priorities,
    expectedValues: input.expectedValues,
    blockedIds: input.blockedIds,
    weights,
  });
  return new Map(result.ranked.map((r) => [r.recommendationId, r.rank]));
}

/**
 * Run the sensitivity sweep: baseline ranking plus ±δ on each of the four weights
 * (8 perturbations). Reports per-item rank spread, stability share, the most
 * sensitive items, and warnings when the ordering is fragile.
 */
export function analyzeSensitivity(input: SensitivityInput): SensitivityAnalysis {
  const weights = input.baseWeights ?? DEFAULT_WEIGHTS;
  const delta = input.delta ?? DEFAULT_DELTA;

  const baseline = rankMap(input, weights);
  const perturbed: Map<string, number>[] = [];
  for (const key of WEIGHT_KEYS) {
    perturbed.push(rankMap(input, perturbWeights(weights, key, delta)));
    perturbed.push(rankMap(input, perturbWeights(weights, key, -delta)));
  }

  const entries: SensitivityEntry[] = [...baseline.keys()]
    .sort()
    .map((id) => {
      const ranks = [baseline.get(id)!, ...perturbed.map((m) => m.get(id)!)];
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);
      return { recommendationId: id, baselineRank: baseline.get(id)!, minRank, maxRank, rankSpread: maxRank - minRank, stable: maxRank === minRank };
    });

  const stableCount = entries.filter((e) => e.stable).length;
  const rankingStability = entries.length === 0 ? 1 : stableCount / entries.length;

  const mostSensitive = [...entries]
    .filter((e) => !e.stable)
    .sort((a, b) => (b.rankSpread !== a.rankSpread ? b.rankSpread - a.rankSpread : a.recommendationId < b.recommendationId ? -1 : 1))
    .map((e) => e.recommendationId);

  const warnings: string[] = [];
  if (entries.length > 0 && rankingStability < FRAGILE_THRESHOLD) {
    warnings.push(`Ranking is fragile: only ${Math.round(rankingStability * 100)}% of items held rank under ±${delta} weight perturbation.`);
  }

  // a threshold crossing = an item that changed which side of rank 1 it sits on
  const thresholdCrossings = entries
    .filter((e) => e.baselineRank === 1 && e.maxRank > 1)
    .map((e) => ({ recommendationId: e.recommendationId, detail: `lost the top rank under perturbation (to rank ${e.maxRank})` }));

  return sensitivityAnalysisSchema.parse({
    delta,
    rankingStability,
    entries,
    mostSensitive,
    stableAcrossScenarios: entries.filter((e) => e.stable).map((e) => e.recommendationId),
    thresholdCrossings,
    warnings,
    formulaVersion: FORMULA_VERSION,
  });
}
