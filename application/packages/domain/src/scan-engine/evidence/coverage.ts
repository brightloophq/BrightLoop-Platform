/* =============================================================================
 * Coverage scoring (PDF 27 §08/§09) — PURE.
 *
 * How much of the ten Business Health Index dimensions the collected evidence
 * actually covers. A dimension is covered when at least one non-`unavailable`
 * item touches it. Coverage later feeds the Index confidence. Deterministic.
 * ========================================================================== */

import { indexDimensionSchema, type IndexDimension, type EngineEvidenceItem, type CoverageSummary } from "@brightloop/schema";

/**
 * Coverage over the given dimensions (default: all ten). `byDimension` is 1 when
 * a dimension has at least one non-unavailable item, else 0; `overall` is the
 * covered share. Pure + deterministic.
 */
export function computeCoverage(items: EngineEvidenceItem[], dimensions: readonly IndexDimension[] = indexDimensionSchema.options): CoverageSummary {
  const touched = new Set<IndexDimension>();
  for (const item of items) {
    if (item.state === "unavailable") continue; // an unavailable source is not "collected"
    for (const d of item.affectedDomains) touched.add(d);
  }
  const covered: IndexDimension[] = [];
  const missing: IndexDimension[] = [];
  const byDimension: Record<string, number> = {};
  for (const d of dimensions) {
    const isCovered = touched.has(d);
    byDimension[d] = isCovered ? 1 : 0;
    (isCovered ? covered : missing).push(d);
  }
  return {
    overall: dimensions.length === 0 ? 0 : covered.length / dimensions.length,
    covered,
    missing,
    byDimension,
  };
}
