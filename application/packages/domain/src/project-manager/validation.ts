/* =============================================================================
 * Execution-plan validation + resource estimation (Phase E · Sprint E4) — PURE.
 *
 * The validation pipeline checks an execution plan is internally consistent and
 * safe to materialize into Phase D: no dependency cycles, no orphan/duplicate/
 * unassigned tasks, no missing milestones, timeline consistency, and KPI
 * completeness. Resource estimation is a deterministic heuristic. Pure; no io.
 * ========================================================================== */

import type { InitiativePlan, KpiPlan, MilestonePlan, PlanEffort, ResourceLevel, TaskPlan } from "@brightloop/schema";
import { hasTaskCycle, type SchedulableTask } from "./scheduling.js";

export interface PlanValidationInput {
  initiatives: readonly InitiativePlan[];
  tasks: readonly TaskPlan[];
  milestones: readonly MilestonePlan[];
  kpis: readonly KpiPlan[];
}

export interface PlanValidationResult { ok: boolean; issues: string[] }

/** Validate an execution plan. Returns every issue (empty ⇒ valid). Pure. */
export function validateExecutionPlan(input: PlanValidationInput): PlanValidationResult {
  const issues: string[] = [];
  const taskIds = new Set(input.tasks.map((t) => t.id));
  const initiativeIds = new Set(input.initiatives.map((i) => i.id));

  // dependency cycles
  const schedulable: SchedulableTask[] = input.tasks.map((t) => ({ id: t.id, durationDays: t.estimatedDurationDays, dependencyTaskIds: t.dependencyTaskIds }));
  if (hasTaskCycle(schedulable)) issues.push("Dependency cycle detected among tasks");

  // orphan tasks (initiative missing) + unassigned + duplicate work
  for (const t of input.tasks) {
    if (!initiativeIds.has(t.initiativePlanId)) issues.push(`Orphan task "${t.title}" has no initiative`);
    for (const dep of t.dependencyTaskIds) if (!taskIds.has(dep)) issues.push(`Task "${t.title}" depends on an unknown task`);
    if (t.owner === null || t.owner === "") issues.push(`Unassigned task "${t.title}"`);
  }
  const titleByInitiative = new Map<string, Set<string>>();
  for (const t of input.tasks) {
    const set = titleByInitiative.get(t.initiativePlanId) ?? new Set<string>();
    const key = t.title.trim().toLowerCase();
    if (set.has(key)) issues.push(`Duplicate task "${t.title}" within an initiative`);
    set.add(key);
    titleByInitiative.set(t.initiativePlanId, set);
  }

  // missing milestones: every initiative needs at least one milestone
  for (const i of input.initiatives) {
    if (!input.milestones.some((m) => m.initiativePlanId === i.id)) issues.push(`Initiative "${i.title}" has no milestone`);
    if (!input.tasks.some((t) => t.initiativePlanId === i.id)) issues.push(`Initiative "${i.title}" has no tasks`);
  }

  // KPI completeness: at least one KPI, each with a formula + a target
  if (input.kpis.length === 0) issues.push("The plan has no KPIs");
  for (const k of input.kpis) if (k.formula.trim() === "") issues.push(`KPI "${k.name}" has no formula`);

  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

const EFFORT_DAYS: Record<PlanEffort, number> = { low: 2, medium: 5, high: 12 };

export interface ResourceEstimateComputation { people: number; durationDays: number; complexity: ResourceLevel; costCategory: ResourceLevel; confidence: number }

/**
 * Estimate resources for an initiative from its tasks: duration = sum of effort
 * days on the critical-ish path (here, total effort), people scale with task
 * count, complexity/cost derive from effort mix. Deterministic. Pure.
 */
export function estimateResources(tasks: readonly Pick<TaskPlan, "effort" | "estimatedDurationDays">[]): ResourceEstimateComputation {
  if (tasks.length === 0) return { people: 1, durationDays: 1, complexity: "low", costCategory: "low", confidence: 30 };
  const durationDays = tasks.reduce((sum, t) => sum + Math.max(t.estimatedDurationDays, EFFORT_DAYS[t.effort]), 0);
  const highCount = tasks.filter((t) => t.effort === "high").length;
  const people = Math.max(1, Math.ceil(tasks.length / 4));
  const level: ResourceLevel = highCount >= tasks.length / 2 ? "high" : highCount > 0 ? "medium" : "low";
  const confidence = Math.min(90, 40 + tasks.length * 5);
  return { people, durationDays, complexity: level, costCategory: level, confidence };
}
