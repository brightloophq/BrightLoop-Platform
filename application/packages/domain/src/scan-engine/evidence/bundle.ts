/* =============================================================================
 * EvidenceBundle operations (PDF 27 §03 output) — PURE.
 *
 * The canonical container the engine passes between layers. merge / split /
 * filter / sort plus coverage / confidence / conflict summaries. All pure and
 * deterministic; every operation returns a new bundle (no mutation).
 * ========================================================================== */

import type { IndexDimension, EngineEvidenceItem, EvidenceBundle, CoverageSummary, EvidenceConfidence, EvidenceConflict } from "@brightloop/schema";
import { computeCoverage } from "./coverage.js";
import { agreementScore, detectConflicts, type ConflictOptions } from "./conflict.js";
import { computeEvidenceConfidence } from "./confidence.js";

export function emptyBundle(scanId: string): EvidenceBundle {
  return { scanId, items: [] };
}

/** Union of two bundles, de-duplicated by id (first occurrence wins). */
export function mergeBundles(a: EvidenceBundle, b: EvidenceBundle): EvidenceBundle {
  const seen = new Set<string>();
  const items: EngineEvidenceItem[] = [];
  for (const item of [...a.items, ...b.items]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return { scanId: a.scanId, items };
}

export function filterBundle(bundle: EvidenceBundle, predicate: (item: EngineEvidenceItem) => boolean): EvidenceBundle {
  return { scanId: bundle.scanId, items: bundle.items.filter(predicate) };
}

/** Partition into [matching, rest]. */
export function splitBundle(bundle: EvidenceBundle, predicate: (item: EngineEvidenceItem) => boolean): [EvidenceBundle, EvidenceBundle] {
  const yes: EngineEvidenceItem[] = [];
  const no: EngineEvidenceItem[] = [];
  for (const item of bundle.items) (predicate(item) ? yes : no).push(item);
  return [
    { scanId: bundle.scanId, items: yes },
    { scanId: bundle.scanId, items: no },
  ];
}

/** Canonical strongest-first order: reliability → freshness → recency → id. Total + stable. */
export function sortBundle(bundle: EvidenceBundle): EvidenceBundle {
  const items = [...bundle.items].sort((a, b) => {
    if (b.reliability !== a.reliability) return b.reliability - a.reliability;
    if (b.freshness.score !== a.freshness.score) return b.freshness.score - a.freshness.score;
    const tb = Date.parse(b.timestamp);
    const ta = Date.parse(a.timestamp);
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return { scanId: bundle.scanId, items };
}

export function coverageSummary(bundle: EvidenceBundle, dimensions?: readonly IndexDimension[]): CoverageSummary {
  return computeCoverage(bundle.items, dimensions);
}

/** Bundle-accurate confidence: real coverage + cross-item agreement folded in. */
export function confidenceSummary(bundle: EvidenceBundle): EvidenceConfidence {
  const items = bundle.items;
  const mean = (pick: (i: EngineEvidenceItem) => number) => (items.length === 0 ? 0 : items.reduce((a, i) => a + pick(i), 0) / items.length);
  return computeEvidenceConfidence({
    coverage: computeCoverage(items).overall,
    reliability: mean((i) => i.reliability),
    freshness: mean((i) => i.freshness.score),
    agreement: agreementScore(bundle),
    completeness: mean((i) => i.confidence.inputs.completeness),
    provenanceQuality: mean((i) => i.confidence.inputs.provenanceQuality),
  });
}

export function conflictSummary(bundle: EvidenceBundle, options?: ConflictOptions): EvidenceConflict[] {
  return detectConflicts(bundle, options);
}
