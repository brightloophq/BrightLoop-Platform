/* =============================================================================
 * Agent task graph (Phase E · Sprint E7) — PURE.
 *
 * Agent tasks form a DAG whose edges are `dependsOn`. Validation catches cycles,
 * unreachable tasks, missing dependencies, duplicate ids, missing outputs/criteria,
 * invalid capability references, and conflicting parallel writes. Also provides
 * deterministic topological order and optimistic task-claiming semantics. No io.
 * ========================================================================== */

import { getCapability, isKnownCapability } from "./capabilities.js";

export interface TaskNode {
  key: string;
  kind: "capability" | "approval_gate" | "terminal" | "compensation";
  capabilityKey: string | null;
  dependsOn: readonly string[];
  parallelizable: boolean;
  optional: boolean;
  approvalGated: boolean;
  completionCriteria: string;
  expectedOutput: string;
  compensatesTaskKey?: string | null;
}

export interface TaskGraphValidation { ok: boolean; issues: string[] }

export function hasTaskGraphCycle(tasks: readonly TaskNode[]): boolean {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (key: string): boolean => {
    const s = state.get(key) ?? 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(key, 1);
    for (const dep of byKey.get(key)?.dependsOn ?? []) if (byKey.has(dep) && visit(dep)) return true;
    state.set(key, 2);
    return false;
  };
  for (const t of tasks) if (visit(t.key)) return true;
  return false;
}

/** Keys reachable by resolving dependencies from the roots (deps-empty tasks). */
export function reachableTasks(tasks: readonly TaskNode[]): Set<string> {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const resolved = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (resolved.has(t.key)) continue;
      if (t.dependsOn.every((d) => byKey.has(d) && resolved.has(d))) { resolved.add(t.key); changed = true; }
    }
  }
  return resolved;
}

/** Validate an agent task graph. Returns every issue (empty ⇒ valid). Pure. */
export function validateTaskGraph(tasks: readonly TaskNode[]): TaskGraphValidation {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const t of tasks) { if (keys.has(t.key)) issues.push(`Duplicate task id "${t.key}"`); keys.add(t.key); }

  if (tasks.length === 0) issues.push("Task graph is empty");
  if (hasTaskGraphCycle(tasks)) issues.push("Task graph contains a cycle");

  for (const t of tasks) {
    for (const dep of t.dependsOn) if (!keys.has(dep)) issues.push(`Task "${t.key}" depends on missing task "${dep}"`);
    if (t.kind === "capability") {
      if (t.capabilityKey === null) issues.push(`Capability task "${t.key}" has no capability`);
      else if (!isKnownCapability(t.capabilityKey)) issues.push(`Task "${t.key}" references unknown capability "${t.capabilityKey}"`);
    }
    if (t.kind === "compensation" && (t.compensatesTaskKey == null || !keys.has(t.compensatesTaskKey))) issues.push(`Compensation task "${t.key}" targets a missing task`);
    if (t.completionCriteria.trim() === "") issues.push(`Task "${t.key}" has no completion criteria`);
    if (t.expectedOutput.trim() === "" && t.kind !== "approval_gate") issues.push(`Task "${t.key}" declares no expected output`);
  }

  // unreachable tasks (deps never resolvable)
  const reachable = reachableTasks(tasks);
  for (const t of tasks) if (!reachable.has(t.key)) issues.push(`Task "${t.key}" is unreachable`);

  // at least one terminal task
  if (!tasks.some((t) => t.kind === "terminal")) issues.push("Task graph has no terminal task");

  // conflicting parallel writes: two parallelizable write-capabilities against the
  // same owning context with no ordering dependency between them.
  const writes = tasks.filter((t) => t.parallelizable && t.capabilityKey !== null && getCapability(t.capabilityKey)?.sideEffect === "write");
  for (let i = 0; i < writes.length; i += 1) {
    for (let j = i + 1; j < writes.length; j += 1) {
      const a = writes[i]!, b = writes[j]!;
      const ctxA = getCapability(a.capabilityKey!)!.owningContext;
      const ctxB = getCapability(b.capabilityKey!)!.owningContext;
      const ordered = a.dependsOn.includes(b.key) || b.dependsOn.includes(a.key);
      if (ctxA === ctxB && !ordered) issues.push(`Conflicting parallel writes to "${ctxA}" (${a.key}, ${b.key})`);
    }
  }

  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

/** Kahn topological order over `dependsOn`; null on a cycle. */
export function topologicalTaskOrder(tasks: readonly TaskNode[]): string[] | null {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const indegree = new Map<string, number>();
  for (const t of tasks) indegree.set(t.key, t.dependsOn.filter((d) => byKey.has(d)).length);
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  const dependents = new Map<string, string[]>();
  for (const t of tasks) for (const d of t.dependsOn) if (byKey.has(d)) dependents.set(d, [...(dependents.get(d) ?? []), t.key]);
  const order: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    order.push(key);
    for (const dep of dependents.get(key) ?? []) { const n = (indegree.get(dep) ?? 0) - 1; indegree.set(dep, n); if (n === 0) queue.push(dep); }
  }
  return order.length === tasks.length ? order : null;
}

/* ---- optimistic task claiming (semantics only; no worker service) ---------- */

export interface ClaimState { claimedBy: string | null; leaseExpiresAt: string | null }

/** A ready/failed task is claimable if unclaimed or its lease has expired. */
export function canClaimTask(status: string, claim: ClaimState, nowIso: string): boolean {
  if (status !== "ready" && status !== "failed") return false;
  if (claim.claimedBy === null) return true;
  if (claim.leaseExpiresAt === null) return false;
  return Date.parse(claim.leaseExpiresAt) <= Date.parse(nowIso);
}

export function claimStamp(nowIso: string, workerId: string, leaseMs: number): { claimedBy: string; claimedAt: string; leaseExpiresAt: string; heartbeatAt: string } {
  const expires = new Date(Date.parse(nowIso) + leaseMs).toISOString();
  return { claimedBy: workerId, claimedAt: nowIso, leaseExpiresAt: expires, heartbeatAt: nowIso };
}
