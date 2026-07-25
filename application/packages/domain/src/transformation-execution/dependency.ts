/* =============================================================================
 * Dependency engine — GRAPH + cycle detection (Phase D · Sprint D3) — PURE.
 *
 * Manages a directed dependency graph between initiatives in a workspace. Two
 * edge types normalize to the same "must-precede" direction:
 *   depends_on(A, B) → A waits for B  → edge A → B
 *   blocks(A, B)     → A blocks B      → B waits for A → edge B → A
 * A dependency may only be linked if it does not introduce a cycle. Pure — no io.
 * ========================================================================== */

import type { Dependency, DependencyType } from "@brightloop/schema";

/** A directed "must-precede" edge (waiter → prerequisite). */
export interface DependencyEdge {
  from: string;
  to: string;
}

/** Normalize a typed dependency to its directed must-precede edge. */
export function normalizeEdge(fromInitiativeId: string, toInitiativeId: string, type: DependencyType): DependencyEdge {
  return type === "depends_on" ? { from: fromInitiativeId, to: toInitiativeId } : { from: toInitiativeId, to: fromInitiativeId };
}

/** Normalize a stored dependency record. */
export function edgeOf(dependency: Dependency): DependencyEdge {
  return normalizeEdge(dependency.fromInitiativeId, dependency.toInitiativeId, dependency.type);
}

/** Does the directed graph contain a cycle? DFS with a recursion stack. */
export function hasCycle(edges: readonly DependencyEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);

  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (node: string): boolean => {
    if (stack.has(node)) return true; // back-edge → cycle
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const next of adjacency.get(node) ?? []) if (visit(next)) return true;
    stack.delete(node);
    return false;
  };

  for (const node of adjacency.keys()) if (visit(node)) return true;
  return false;
}

export type DependencyLinkOutcome =
  | { ok: true; edges: DependencyEdge[] }
  | { ok: false; reason: "cycle" | "self_dependency" | "duplicate" };

/**
 * Validate adding a new typed dependency to an existing set. Rejects self-edges,
 * duplicates, and any edge that would introduce a cycle. Pure.
 */
export function linkDependency(existing: readonly Dependency[], fromInitiativeId: string, toInitiativeId: string, type: DependencyType): DependencyLinkOutcome {
  if (fromInitiativeId === toInitiativeId) return { ok: false, reason: "self_dependency" };
  const edge = normalizeEdge(fromInitiativeId, toInitiativeId, type);
  const edges = existing.map(edgeOf);
  if (edges.some((e) => e.from === edge.from && e.to === edge.to)) return { ok: false, reason: "duplicate" };
  const next = [...edges, edge];
  if (hasCycle(next)) return { ok: false, reason: "cycle" };
  return { ok: true, edges: next };
}

/** Validate a full dependency set (used for defensive re-checks). Pure. */
export function validateDependencyGraph(dependencies: readonly Dependency[]): { ok: true } | { ok: false; reason: "cycle" } {
  return hasCycle(dependencies.map(edgeOf)) ? { ok: false, reason: "cycle" } : { ok: true };
}
