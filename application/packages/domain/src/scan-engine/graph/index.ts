/* =============================================================================
 * L4 · Business Graph (PDF 27 §04/§09) — SKELETON.
 *
 * Normalizes classified evidence into a queryable business model, and computes
 * the Business Health Index — a single 0–100 figure over ten fixed-weight
 * dimensions. Index computation is PURE + deterministic (weights sum to 100).
 * ========================================================================== */

import {
  INDEX_DIMENSION_WEIGHTS,
  indexDimensionSchema,
  type IndexDimension,
  type DimensionScore,
  type BusinessHealthIndex,
  type EvidenceSignal,
} from "@brightloop/schema";
import { computeConfidence } from "../reasoning/index.js";

/**
 * Weighted Business Health Index (PDF 27 §09). Each present dimension score is
 * weighted by its canonical weight and normalized by the weight actually covered;
 * `coverage` reports how much of the 100-point weight was scored. Duplicate
 * dimensions are ignored (first wins) for determinism. Risk is assumed already
 * inverse-scored upstream (higher score = lower exposure). Pure — `computedAt`
 * is supplied by the caller (no clock).
 */
export function computeIndex(scores: DimensionScore[], computedAt: string): BusinessHealthIndex {
  const seen = new Set<IndexDimension>();
  const dimensions: DimensionScore[] = [];
  let weighted = 0;
  let weightPresent = 0;
  for (const s of scores) {
    if (seen.has(s.dimension)) continue;
    seen.add(s.dimension);
    dimensions.push(s);
    const w = INDEX_DIMENSION_WEIGHTS[s.dimension];
    weighted += w * s.score;
    weightPresent += w;
  }
  const value = weightPresent === 0 ? 0 : Math.round(weighted / weightPresent);
  const coverage = weightPresent / 100;

  // Roll dimension confidences up into an Index confidence, discounted by coverage.
  const mean = (pick: (i: DimensionScore["confidence"]["inputs"]) => number) =>
    dimensions.length === 0 ? 0 : dimensions.reduce((a, d) => a + pick(d.confidence.inputs), 0) / dimensions.length;
  const confidence = computeConfidence({
    coverage,
    reliability: mean((i) => i.reliability),
    freshness: mean((i) => i.freshness),
    agreement: mean((i) => i.agreement),
    completeness: mean((i) => i.completeness),
  });

  return { value, coverage, dimensions, confidence, computedAt };
}

/** The fixed weights must always sum to 100 — guarded so a spec edit can't drift. */
export function indexWeightsSumTo100(): boolean {
  return indexDimensionSchema.options.reduce((sum, d) => sum + INDEX_DIMENSION_WEIGHTS[d], 0) === 100;
}

/* ---- business graph port --------------------------------------------------- */
export interface BusinessProfile {
  scanId: string;
  clientId: string | null;
  identity: Record<string, unknown>; // name, category, location … (normalized)
  evidenceIds: string[];
}

/** Normalizes classified evidence into the queryable substrate reasoning runs over. */
export interface BusinessGraph {
  normalize(input: { scanId: string; clientId: string | null; evidence: EvidenceSignal[] }): Promise<BusinessProfile>;
}
