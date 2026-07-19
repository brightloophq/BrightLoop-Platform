/* =============================================================================
 * L6 · Recommendation Engine (PDF 27 §11) — SKELETON.
 *
 * Converts validated findings into scored, evidence-linked Moves across four
 * tiers. Ordering is PURE + deterministic: Critical Risks always outrank every
 * optimization regardless of effort; the rest sort by impact, then by ease.
 * ========================================================================== */

import { recommendationTierSchema, type EngineMove, type RecommendationTier, type EvidenceSignal, type DimensionScore } from "@brightloop/schema";

/** Tier precedence for grouping. Critical risks lead; the three win tiers share
 *  a group and are ranked by the move's own impact (PDF 27 §11). */
export const TIER_RANK: Record<RecommendationTier, number> = {
  critical_risk: 0,
  strategic_win: 1,
  medium_win: 1,
  quick_win: 1,
};

export function isCriticalRisk(move: Pick<EngineMove, "tier">): boolean {
  return move.tier === "critical_risk";
}

/**
 * Deterministic priority ordering:
 *   1. Critical Risks first (they outrank optimization regardless of effort).
 *   2. Higher impact first.
 *   3. Lower difficulty first (easier wins sooner).
 *   4. Id ascending — a total, stable tie-break.
 * Pure; returns a new array.
 */
export function sortMoves(moves: EngineMove[]): EngineMove[] {
  return [...moves].sort((a, b) => {
    const ga = TIER_RANK[a.tier];
    const gb = TIER_RANK[b.tier];
    if (ga !== gb) return ga - gb;
    if (b.impact !== a.impact) return b.impact - a.impact;
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Group moves by tier (canonical tier order), each group already priority-sorted. */
export function groupByTier(moves: EngineMove[]): Record<RecommendationTier, EngineMove[]> {
  const out = { critical_risk: [], strategic_win: [], medium_win: [], quick_win: [] } as Record<RecommendationTier, EngineMove[]>;
  for (const m of sortMoves(moves)) out[m.tier].push(m);
  return out;
}

/* ---- recommendation port --------------------------------------------------- */
export interface RecommendationEngine {
  /** Every returned Move must cite evidence (enforced by engineMoveSchema.evidenceIds.min(1)). */
  recommend(input: { scanId: string; scores: DimensionScore[]; evidence: EvidenceSignal[] }): Promise<EngineMove[]>;
}

export { recommendationTierSchema };
