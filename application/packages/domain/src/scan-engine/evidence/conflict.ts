/* =============================================================================
 * Conflict detection (PDF 27 §07 evidence validation) — PURE, no AI.
 *
 * Detects, as structured objects:
 *   • duplicate   — two items with identical content (same hash, different ids)
 *   • conflict    — one subject with ≥2 disagreeing values
 *   • superseded  — an older item carrying the same value as a newer one
 *   • missing     — a required Index dimension with no collected evidence
 * Deterministic; ordering of outputs is stable (grouped, id-sorted).
 * ========================================================================== */

import type { IndexDimension, EngineEvidenceItem, EvidenceBundle, EvidenceConflict } from "@brightloop/schema";
import { hashContent } from "./hash.js";

/** The subject a fact is about: source + affected dimensions + optional metric. */
export function subjectKey(item: EngineEvidenceItem): string {
  const metric = typeof item.metadata.metric === "string" ? item.metadata.metric : "";
  return `${item.source}::${[...item.affectedDomains].sort().join(",")}::${metric}`;
}

const valueHash = (item: EngineEvidenceItem) => hashContent(item.value);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface ConflictOptions {
  requiredDimensions?: readonly IndexDimension[];
}

/** All conflicts in a bundle, in a stable order: duplicates, conflicts, superseded, missing. */
export function detectConflicts(bundle: EvidenceBundle, options: ConflictOptions = {}): EvidenceConflict[] {
  const out: EvidenceConflict[] = [];
  const items = bundle.items;

  // ---- duplicates: identical content hash across distinct ids ----
  const byHash = new Map<string, string[]>();
  for (const i of items) byHash.set(i.hash, [...(byHash.get(i.hash) ?? []), i.id]);
  for (const [hash, ids] of [...byHash.entries()].sort((a, b) => byId(a[0], b[0]))) {
    const unique = [...new Set(ids)].sort(byId);
    if (unique.length > 1) out.push({ type: "duplicate", itemIds: unique, dimension: null, subjectKey: null, detail: `identical content (hash ${hash})` });
  }

  // ---- group by subject for conflict / superseded ----
  const groups = new Map<string, EngineEvidenceItem[]>();
  for (const i of items) groups.set(subjectKey(i), [...(groups.get(subjectKey(i)) ?? []), i]);
  for (const [key, group] of [...groups.entries()].sort((a, b) => byId(a[0], b[0]))) {
    if (group.length < 2) continue;
    const distinctValues = new Set(group.map(valueHash));
    if (distinctValues.size >= 2) {
      out.push({ type: "conflict", itemIds: group.map((i) => i.id).sort(byId), dimension: group[0]!.affectedDomains[0] ?? null, subjectKey: key, detail: `${distinctValues.size} disagreeing values for the same subject` });
    } else {
      // all agree → older items are superseded by the newest
      const newest = Math.max(...group.map((i) => Date.parse(i.timestamp)));
      const superseded = group.filter((i) => Date.parse(i.timestamp) < newest).map((i) => i.id).sort(byId);
      if (superseded.length > 0) out.push({ type: "superseded", itemIds: superseded, dimension: group[0]!.affectedDomains[0] ?? null, subjectKey: key, detail: "older observation of an unchanged fact" });
    }
  }

  // ---- missing: required dimensions with no non-unavailable coverage ----
  if (options.requiredDimensions?.length) {
    const covered = new Set<IndexDimension>();
    for (const i of items) if (i.state !== "unavailable") for (const d of i.affectedDomains) covered.add(d);
    for (const d of options.requiredDimensions) {
      if (!covered.has(d)) out.push({ type: "missing", itemIds: [], dimension: d, subjectKey: null, detail: `no collected evidence for ${d}` });
    }
  }

  return out;
}

/**
 * Bundle agreement (0–1): the share of items NOT participating in a value
 * conflict. Feeds the `agreement` confidence factor. Deterministic.
 */
export function agreementScore(bundle: EvidenceBundle): number {
  if (bundle.items.length === 0) return 1;
  const conflicted = new Set<string>();
  for (const c of detectConflicts(bundle)) if (c.type === "conflict") for (const id of c.itemIds) conflicted.add(id);
  return (bundle.items.length - conflicted.size) / bundle.items.length;
}
