/* =============================================================================
 * Workflow DAG algorithms (Phase E · Sprint E5) — PURE.
 *
 * A workflow is a directed graph of steps whose edges are `nextStepKeys`. These
 * helpers power validation (cycles, reachability, dead branches) and simulation
 * (execution order). A `loop` is a NODE kind that iterates internally — it is not
 * a back-edge, so a well-formed workflow's step graph is acyclic. No io.
 * ========================================================================== */

export interface GraphNode {
  key: string;
  nextStepKeys: readonly string[];
  onErrorStepKey?: string | null;
}

/** Every distinct key referenced as a successor or error target. */
export function referencedKeys(nodes: readonly GraphNode[]): Set<string> {
  const refs = new Set<string>();
  for (const n of nodes) {
    for (const k of n.nextStepKeys) refs.add(k);
    if (n.onErrorStepKey) refs.add(n.onErrorStepKey);
  }
  return refs;
}

/** DFS cycle detection over `nextStepKeys` (error edges are excluded). */
export function hasWorkflowCycle(nodes: readonly GraphNode[]): boolean {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen 1=in-stack 2=done
  const visit = (key: string): boolean => {
    const s = state.get(key) ?? 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(key, 1);
    for (const next of byKey.get(key)?.nextStepKeys ?? []) {
      if (byKey.has(next) && visit(next)) return true;
    }
    state.set(key, 2);
    return false;
  };
  for (const n of nodes) if (visit(n.key)) return true;
  return false;
}

/** The set of keys reachable from `entryKey` via `nextStepKeys` (+ error edges). */
export function reachableFrom(nodes: readonly GraphNode[], entryKey: string | null): Set<string> {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const seen = new Set<string>();
  if (entryKey === null || !byKey.has(entryKey)) return seen;
  const stack = [entryKey];
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = byKey.get(key);
    if (!node) continue;
    for (const next of node.nextStepKeys) if (byKey.has(next)) stack.push(next);
    if (node.onErrorStepKey && byKey.has(node.onErrorStepKey)) stack.push(node.onErrorStepKey);
  }
  return seen;
}

/** Keys with no outgoing `nextStepKeys` (workflow terminals / leaf outputs). */
export function terminalKeys(nodes: readonly GraphNode[]): string[] {
  return nodes.filter((n) => n.nextStepKeys.length === 0).map((n) => n.key);
}

/**
 * Kahn topological order from `entryKey` following `nextStepKeys` only. Returns
 * `null` on a cycle. Restricted to nodes reachable from the entry so unreachable
 * subgraphs never appear in the execution order.
 */
export function topologicalOrder(nodes: readonly GraphNode[], entryKey: string | null): string[] | null {
  const reachable = reachableFrom(nodes, entryKey);
  const byKey = new Map(nodes.filter((n) => reachable.has(n.key)).map((n) => [n.key, n]));
  const indegree = new Map<string, number>();
  for (const k of byKey.keys()) indegree.set(k, 0);
  for (const n of byKey.values()) for (const next of n.nextStepKeys) if (indegree.has(next)) indegree.set(next, (indegree.get(next) ?? 0) + 1);
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  const order: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    order.push(key);
    for (const next of byKey.get(key)?.nextStepKeys ?? []) {
      if (!indegree.has(next)) continue;
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order.length === byKey.size ? order : null;
}
