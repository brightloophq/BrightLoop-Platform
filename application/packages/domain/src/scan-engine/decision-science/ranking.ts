/* =============================================================================
 * Deterministic ranking (Sprint 9 §7 · AIS-003 §06/§08) — PURE.
 *
 * Total, stable ordering:
 *   1. actionable before blocked
 *   2. critical unresolved risks first
 *   3. priority score (desc)
 *   4. confidence (desc)
 *   5. confidence-adjusted expected value (desc)
 *   6. time-to-value (sooner first)
 *   7. recommendation id (asc) — the stable tie-breaker
 *
 * Identical inputs always produce an identical order. Adjacent items carry a
 * STRUCTURED comparison reason — inspectable metadata, never free-form reasoning.
 * ========================================================================== */

import {
  FORMULA_VERSION,
  rankingResultSchema,
  type DecisionWeights,
  type ExpectedValue,
  type PriorityScore,
  type RankedRecommendation,
  type RankingResult,
  type EngineRecommendation,
} from "@brightloop/schema";
import { DEFAULT_WEIGHTS } from "./priority.js";

const HORIZON_RANK: Record<EngineRecommendation["timeHorizon"], number> = { days: 0, weeks: 1, quarter: 2, quarter_plus: 3 };

export interface RankingInput {
  recommendations: readonly EngineRecommendation[];
  priorities: ReadonlyMap<string, PriorityScore>;
  expectedValues?: ReadonlyMap<string, ExpectedValue>;
  blockedIds?: readonly string[];
  weights?: DecisionWeights;
}

interface Row {
  rec: EngineRecommendation;
  priority: PriorityScore;
  ev: ExpectedValue | null;
  blocked: boolean;
  criticalUnresolved: boolean;
}

/** The 7-key comparator. Returns <0 when a outranks b. Pure + total. */
function compare(a: Row, b: Row): number {
  if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
  if (a.criticalUnresolved !== b.criticalUnresolved) return a.criticalUnresolved ? -1 : 1;
  if (a.priority.total !== b.priority.total) return b.priority.total - a.priority.total;
  if (a.rec.confidence.value !== b.rec.confidence.value) return b.rec.confidence.value - a.rec.confidence.value;
  const aev = a.ev?.confidenceAdjustedExpectedValue ?? 0;
  const bev = b.ev?.confidenceAdjustedExpectedValue ?? 0;
  if (aev !== bev) return bev - aev;
  const ah = HORIZON_RANK[a.rec.timeHorizon];
  const bh = HORIZON_RANK[b.rec.timeHorizon];
  if (ah !== bh) return ah - bh;
  return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
}

/** The structured reason `a` sits above `b` — the first key that differed. Pure. */
export function comparisonReason(a: Row, b: Row): string {
  if (a.blocked !== b.blocked) return "actionable_before_blocked";
  if (a.criticalUnresolved !== b.criticalUnresolved) return "critical_risk_first";
  if (a.priority.total !== b.priority.total) return `priority ${a.priority.total} > ${b.priority.total}`;
  if (a.rec.confidence.value !== b.rec.confidence.value) return `confidence ${a.rec.confidence.value} > ${b.rec.confidence.value}`;
  const aev = a.ev?.confidenceAdjustedExpectedValue ?? 0;
  const bev = b.ev?.confidenceAdjustedExpectedValue ?? 0;
  if (aev !== bev) return "higher_expected_value";
  if (HORIZON_RANK[a.rec.timeHorizon] !== HORIZON_RANK[b.rec.timeHorizon]) return "shorter_time_to_value";
  return "stable_id_tiebreak";
}

/** Rank the recommendations. Deterministic and total. */
export function rankRecommendations(input: RankingInput): RankingResult {
  const blockedSet = new Set(input.blockedIds ?? []);
  const rejected: { recommendationId: string; reason: string }[] = [];

  const rows: Row[] = [];
  for (const rec of input.recommendations) {
    const priority = input.priorities.get(rec.id);
    if (priority === undefined) {
      rejected.push({ recommendationId: rec.id, reason: "no priority score computed" });
      continue;
    }
    rows.push({
      rec,
      priority,
      ev: input.expectedValues?.get(rec.id) ?? null,
      blocked: blockedSet.has(rec.id),
      criticalUnresolved: rec.tier === "critical_risk" && priority.rationale.criticalRiskOverride,
    });
  }

  rows.sort(compare);

  const ranked: RankedRecommendation[] = rows.map((row, i) => ({
    recommendationId: row.rec.id,
    rank: i + 1,
    priority: row.priority,
    expectedValue: row.ev,
    blocked: row.blocked,
    comparisonToNext: i + 1 < rows.length ? comparisonReason(row, rows[i + 1]!) : null,
  }));

  return rankingResultSchema.parse({
    ranked,
    blocked: rows.filter((r) => r.blocked).map((r) => r.rec.id).sort(),
    rejected,
    metadata: {
      formulaVersion: FORMULA_VERSION,
      weights: input.weights ?? DEFAULT_WEIGHTS,
      consideredCount: input.recommendations.length,
      orderedBy: ["blocked", "critical_risk", "priority", "confidence", "expected_value", "time_to_value", "id"],
    },
  });
}
