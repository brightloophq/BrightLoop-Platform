/* =============================================================================
 * Recommendation dependency graph (Sprint 9 §6 · AIS-003 §09) — PURE.
 *
 * A recommendation-SPECIFIC DAG, deliberately separate from the Intelligence Graph
 * (which stays an immutable evidence substrate — never mutable storage for moves).
 * Validates references, detects cycles, finds blocked items, orders prerequisites
 * first, and surfaces conflicts / duplicates / substitutes. Deterministic:
 * ties in the topological order break by id.
 * ========================================================================== */

import {
  dependencyAnalysisSchema,
  type DependencyAnalysis,
  type DependencyEdge,
  type DependencyIssue,
  type EngineRecommendation,
} from "@brightloop/schema";

/** Edge kinds that impose an ordering constraint (prerequisite → dependent). */
const ORDERING_KINDS = new Set(["requires", "sequences_after"]);
/** Edge kinds where `from` must come BEFORE `to`. */
const FORWARD_KINDS = new Set(["enables", "sequences_before", "blocks"]);

/** Build edges from each recommendation's `dependencies` (implicit `requires`). Pure. */
export function edgesFromRecommendations(recs: readonly EngineRecommendation[]): DependencyEdge[] {
  const out: DependencyEdge[] = [];
  for (const r of recs) for (const dep of r.dependencies) out.push({ from: r.id, to: dep, kind: "requires", note: null });
  return out;
}

/**
 * Normalize edges into prerequisite→dependent pairs.
 * `requires`/`sequences_after`: from depends on to  ⇒ to must precede from.
 * `enables`/`sequences_before`/`blocks`: from must precede to.
 */
function orderingPairs(edges: readonly DependencyEdge[]): { before: string; after: string }[] {
  const pairs: { before: string; after: string }[] = [];
  for (const e of edges) {
    if (ORDERING_KINDS.has(e.kind)) pairs.push({ before: e.to, after: e.from });
    else if (FORWARD_KINDS.has(e.kind)) pairs.push({ before: e.from, after: e.to });
  }
  return pairs;
}

/**
 * Analyse the dependency graph: validate references, detect cycles, compute the
 * prerequisite-first order, and list blocked / conflicting / duplicate items.
 */
export function analyzeDependencies(recs: readonly EngineRecommendation[], extraEdges: readonly DependencyEdge[] = []): DependencyAnalysis {
  const ids = new Set(recs.map((r) => r.id));
  const edges = [...edgesFromRecommendations(recs), ...extraEdges];
  const issues: DependencyIssue[] = [];

  // ---- validation: unknown references + self references
  for (const e of edges) {
    if (e.from === e.to) issues.push({ kind: "self_reference", recommendationIds: [e.from], detail: `${e.from} references itself (${e.kind})` });
    if (!ids.has(e.from)) issues.push({ kind: "unknown_reference", recommendationIds: [e.from], detail: `unknown recommendation '${e.from}'` });
    if (!ids.has(e.to)) issues.push({ kind: "unknown_reference", recommendationIds: [e.to], detail: `unknown recommendation '${e.to}'` });
  }

  // ---- conflicts / duplicates / substitutes
  for (const e of edges) {
    if (e.kind === "conflicts_with") issues.push({ kind: "conflict", recommendationIds: [e.from, e.to].sort(), detail: `${e.from} conflicts with ${e.to}` });
    if (e.kind === "duplicates" || e.kind === "substitutes") issues.push({ kind: "duplicate", recommendationIds: [e.from, e.to].sort(), detail: `${e.from} ${e.kind} ${e.to}` });
  }

  // ---- blocked: a prerequisite that is not present in the set
  const blocked = [...new Set(edges.filter((e) => ORDERING_KINDS.has(e.kind) && !ids.has(e.to)).map((e) => e.from))].sort();

  // ---- topological order (Kahn), id-sorted for determinism
  const known = orderingPairs(edges).filter((p) => ids.has(p.before) && ids.has(p.after));
  const indegree = new Map<string, number>([...ids].map((id) => [id, 0]));
  const adj = new Map<string, string[]>([...ids].map((id) => [id, []]));
  for (const p of known) {
    adj.get(p.before)!.push(p.after);
    indegree.set(p.after, (indegree.get(p.after) ?? 0) + 1);
  }
  const ready = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of adj.get(id)!.sort()) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }

  const acyclic = order.length === ids.size;
  if (!acyclic) {
    const inCycle = [...ids].filter((id) => !order.includes(id)).sort();
    issues.push({ kind: "cycle", recommendationIds: inCycle, detail: `dependency cycle among: ${inCycle.join(", ")}` });
  }

  return dependencyAnalysisSchema.parse({ edges, order: acyclic ? order : [], blocked, issues, acyclic });
}

/** Ids that conflict with an already-selected id, per the analysis. Pure. */
export function conflictsFor(analysis: DependencyAnalysis, id: string): string[] {
  return analysis.issues
    .filter((i) => i.kind === "conflict" && i.recommendationIds.includes(id))
    .flatMap((i) => i.recommendationIds.filter((x) => x !== id))
    .sort();
}

/** Prerequisites of `id` that are present in the set. Pure. */
export function prerequisitesOf(analysis: DependencyAnalysis, id: string): string[] {
  return analysis.edges.filter((e) => e.from === id && ORDERING_KINDS.has(e.kind)).map((e) => e.to).sort();
}
