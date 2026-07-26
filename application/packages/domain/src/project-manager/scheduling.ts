/* =============================================================================
 * Scheduling — critical path + timeline (Phase E · Sprint E4) — PURE.
 *
 * A forward/backward pass over the task dependency graph yields each task's
 * earliest start/finish, slack, and whether it sits on the critical path, plus
 * the overall critical-path duration. Cycle-safe: a cyclic graph is reported, not
 * scheduled. Deterministic; no io.
 * ========================================================================== */

export interface SchedulableTask {
  id: string;
  durationDays: number;
  /** Ids of tasks that must finish before this one starts (finish-to-start). */
  dependencyTaskIds: readonly string[];
}

export interface TaskSchedule {
  taskId: string;
  startDay: number;
  finishDay: number;
  slackDays: number;
  onCriticalPath: boolean;
}

export interface ScheduleResult {
  schedules: TaskSchedule[];
  criticalPathDurationDays: number;
  hasCycle: boolean;
}

/** Detect a cycle in the task dependency graph (DFS with a recursion stack). Pure. */
export function hasTaskCycle(tasks: readonly SchedulableTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const visit = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    for (const dep of byId.get(id)?.dependencyTaskIds ?? []) if (byId.has(dep) && visit(dep)) return true;
    stack.delete(id);
    return false;
  };
  return tasks.some((t) => visit(t.id));
}

/**
 * Compute the schedule (CPM). Forward pass sets earliest start = max dependency
 * finish; backward pass sets latest finish = min dependent latest start; slack =
 * latest − earliest; critical path = zero-slack tasks. Returns `hasCycle` (with an
 * empty schedule) when the graph is cyclic. Pure.
 */
export function computeSchedule(tasks: readonly SchedulableTask[]): ScheduleResult {
  if (hasTaskCycle(tasks)) return { schedules: [], criticalPathDurationDays: 0, hasCycle: true };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const validDeps = (t: SchedulableTask): string[] => t.dependencyTaskIds.filter((d) => byId.has(d));

  // Forward pass — earliest start/finish (memoized).
  const earliestFinish = new Map<string, number>();
  const earliestStart = new Map<string, number>();
  const ef = (id: string, guard = new Set<string>()): number => {
    if (earliestFinish.has(id)) return earliestFinish.get(id)!;
    if (guard.has(id)) return 0;
    guard.add(id);
    const t = byId.get(id)!;
    const start = validDeps(t).reduce((mx, d) => Math.max(mx, ef(d, guard)), 0);
    earliestStart.set(id, start);
    const finish = start + Math.max(0, t.durationDays);
    earliestFinish.set(id, finish);
    return finish;
  };
  for (const t of tasks) ef(t.id);
  const projectFinish = tasks.reduce((mx, t) => Math.max(mx, earliestFinish.get(t.id) ?? 0), 0);

  // Backward pass — latest finish/start.
  const dependents = new Map<string, string[]>();
  for (const t of tasks) for (const d of validDeps(t)) dependents.set(d, [...(dependents.get(d) ?? []), t.id]);
  const latestFinish = new Map<string, number>();
  const lf = (id: string, guard = new Set<string>()): number => {
    if (latestFinish.has(id)) return latestFinish.get(id)!;
    if (guard.has(id)) return projectFinish;
    guard.add(id);
    const outs = dependents.get(id) ?? [];
    const value = outs.length === 0 ? projectFinish : outs.reduce((mn, dep) => Math.min(mn, lf(dep, guard) - Math.max(0, byId.get(dep)!.durationDays)), Infinity);
    latestFinish.set(id, value);
    return value;
  };
  for (const t of tasks) lf(t.id);

  const schedules: TaskSchedule[] = tasks.map((t) => {
    const start = earliestStart.get(t.id) ?? 0;
    const finish = earliestFinish.get(t.id) ?? 0;
    const slack = Math.max(0, (latestFinish.get(t.id) ?? projectFinish) - finish);
    return { taskId: t.id, startDay: start, finishDay: finish, slackDays: slack, onCriticalPath: slack === 0 };
  });
  return { schedules, criticalPathDurationDays: projectFinish, hasCycle: false };
}
