/**
 * Workspace Experience — global search model (Phase F · Sprint F1).
 *
 * PURE. A workspace-scoped search index over the heterogeneous entities the
 * client can see (projects, reports, strategies, missions, tasks, approvals,
 * agents, artifacts, notes). The DATA comes from existing read models; this
 * module only builds + ranks the index. Unit tested. No React, no io.
 */

import { subsequenceMatch } from "./command-palette";

export type SearchKind = "project" | "report" | "strategy" | "mission" | "task" | "approval" | "agent" | "artifact" | "note";

export interface SearchDoc {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  keywords?: readonly string[];
}

const KIND_WEIGHT: Record<SearchKind, number> = { approval: 0, mission: 1, project: 1, report: 2, strategy: 2, task: 3, agent: 3, artifact: 4, note: 4 };

/** Rank documents for a query — subsequence match on title+subtitle+keywords. */
export function rankSearch(query: string, docs: readonly SearchDoc[]): SearchDoc[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  return docs
    .map((d) => ({ d, hay: [d.title, d.subtitle, ...(d.keywords ?? [])].join(" ").toLowerCase(), titleHit: d.title.toLowerCase().includes(q) }))
    .filter(({ hay }) => subsequenceMatch(hay, q))
    .sort((a, b) => (Number(b.titleHit) - Number(a.titleHit)) || (KIND_WEIGHT[a.d.kind] - KIND_WEIGHT[b.d.kind]) || a.d.title.localeCompare(b.d.title))
    .map(({ d }) => d);
}

/** Group ranked results by kind, preserving rank order within each group. */
export function groupByKind(results: readonly SearchDoc[]): { kind: SearchKind; items: SearchDoc[] }[] {
  const order: SearchKind[] = ["approval", "mission", "project", "report", "strategy", "task", "agent", "artifact", "note"];
  const byKind = new Map<SearchKind, SearchDoc[]>();
  for (const r of results) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  return order.filter((k) => byKind.has(k)).map((kind) => ({ kind, items: byKind.get(kind)! }));
}
