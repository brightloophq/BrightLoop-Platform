/* =============================================================================
 * Conflict-aware updates (PDF 27 §07) — PURE.
 *
 * Diffs incoming evidence against the prior evidence set and returns structured
 * GraphChange events describing how each item affects an existing conclusion:
 * confirmed / conflicted / superseded / confidence_changed / became_unavailable.
 * A pure diff — it NEVER mutates or overwrites provenance; new evidence is added
 * as new nodes (see assembly), and prior provenance is retained by construction.
 * ========================================================================== */

import { graphChangeSchema, type EngineEvidenceItem, type GraphChange, type GraphChangeKind } from "@brightloop/schema";
import { subjectKey } from "../evidence/conflict.js";
import { hashContent } from "../evidence/hash.js";

const change = (kind: GraphChangeKind, nodeId: string, evidenceIds: string[], prev: number | null, next: number | null, detail: string): GraphChange =>
  graphChangeSchema.parse({ kind, nodeId, evidenceIds, previousConfidence: prev, newConfidence: next, detail });

/**
 * Structured change events for `incoming` evidence against `previous`. Only
 * effects on EXISTING subjects are reported (a brand-new subject is an addition,
 * surfaced as a `graph.node_added` event, not a change). Deterministic; stable
 * order (incoming order preserved).
 */
export function evidenceChanges(scanId: string, previous: EngineEvidenceItem[], incoming: EngineEvidenceItem[]): GraphChange[] {
  const bySubject = new Map<string, EngineEvidenceItem[]>();
  for (const p of previous) bySubject.set(subjectKey(p), [...(bySubject.get(subjectKey(p)) ?? []), p]);

  const changes: GraphChange[] = [];
  for (const item of incoming) {
    const dim = item.affectedDomains[0];
    const nodeId = dim ? `dom:${scanId}:${dim}` : `ev:${item.id}`;

    if (item.state === "unavailable") {
      changes.push(change("became_unavailable", nodeId, [item.id], null, null, "source became unavailable — no factual claim"));
      continue;
    }
    const prev = bySubject.get(subjectKey(item)) ?? [];
    if (prev.length === 0) continue; // new subject → addition, not a change to an existing node

    const iv = hashContent(item.value);
    const disagree = prev.some((p) => hashContent(p.value) !== iv);
    const newerSameValue = prev.some((p) => hashContent(p.value) === iv && Date.parse(item.timestamp) > Date.parse(p.timestamp));
    const prevConf = Math.max(...prev.map((p) => p.confidence.value));
    const ids = [item.id, ...prev.map((p) => p.id)];

    if (disagree) changes.push(change("conflicted", nodeId, ids, prevConf, item.confidence.value, "incoming evidence disagrees with a prior conclusion"));
    else if (newerSameValue) changes.push(change("superseded", nodeId, [item.id], prevConf, item.confidence.value, "newer observation of an unchanged fact"));
    else if (item.confidence.value !== prevConf) changes.push(change("confidence_changed", nodeId, [item.id], prevConf, item.confidence.value, "confidence changed"));
    else changes.push(change("confirmed", nodeId, [item.id], prevConf, item.confidence.value, "evidence confirms the prior conclusion"));
  }
  return changes;
}
