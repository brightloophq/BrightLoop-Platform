/* =============================================================================
 * AI Project Manager domain tests (Phase E · Sprint E4).
 *
 * Planning lifecycle, CPM scheduling (critical path + slack + cycles), the
 * validation pipeline, and resource estimation — all pure.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { buildInitiativePlan, buildKpiPlan, buildMilestonePlan, buildPlanningSession, buildTaskPlan, canTransitionPlanning } from "./session.js";
import { computeSchedule, hasTaskCycle, type SchedulableTask } from "./scheduling.js";
import { estimateResources, validateExecutionPlan } from "./validation.js";
import type { InitiativePlan, KpiPlan, MilestonePlan, TaskPlan } from "@brightloop/schema";

const T0 = "2026-07-27T00:00:00.000Z";

describe("planning lifecycle", () => {
  it("enforces the state machine", () => {
    expect(canTransitionPlanning("draft", "planning")).toBe(true);
    expect(canTransitionPlanning("planning", "planned")).toBe(true);
    expect(canTransitionPlanning("planned", "approved")).toBe(true);
    expect(canTransitionPlanning("approved", "planning")).toBe(false);
  });
  it("builds a draft session", () => {
    const s = buildPlanningSession({ id: "ps_1", workspaceId: "w", clientId: "c", strategySessionId: "ss", title: "Plan", requestedByUserId: "u", now: T0 });
    expect(s.status).toBe("draft");
  });
});

describe("CPM scheduling", () => {
  // a(2) → b(3) → d(2) ; a(2) → c(1) ; d and c converge nowhere. Critical path a→b→d = 7.
  const tasks: SchedulableTask[] = [
    { id: "a", durationDays: 2, dependencyTaskIds: [] },
    { id: "b", durationDays: 3, dependencyTaskIds: ["a"] },
    { id: "c", durationDays: 1, dependencyTaskIds: ["a"] },
    { id: "d", durationDays: 2, dependencyTaskIds: ["b"] },
  ];
  it("computes critical path, finish days, and slack", () => {
    const r = computeSchedule(tasks);
    expect(r.hasCycle).toBe(false);
    expect(r.criticalPathDurationDays).toBe(7);
    const byId = new Map(r.schedules.map((s) => [s.taskId, s]));
    expect(byId.get("a")!.onCriticalPath).toBe(true);
    expect(byId.get("b")!.onCriticalPath).toBe(true);
    expect(byId.get("d")!.finishDay).toBe(7);
    expect(byId.get("c")!.onCriticalPath).toBe(false); // c has slack
    expect(byId.get("c")!.slackDays).toBeGreaterThan(0);
  });
  it("detects cycles", () => {
    const cyclic: SchedulableTask[] = [{ id: "x", durationDays: 1, dependencyTaskIds: ["y"] }, { id: "y", durationDays: 1, dependencyTaskIds: ["x"] }];
    expect(hasTaskCycle(cyclic)).toBe(true);
    expect(computeSchedule(cyclic).hasCycle).toBe(true);
  });
});

describe("validation pipeline", () => {
  const init = (id: string): InitiativePlan => buildInitiativePlan({ id, planningSessionId: "ps", workspaceId: "w", clientId: "c", title: `Init ${id}`, order: 0, now: T0 });
  const task = (id: string, initiativePlanId: string, over: Partial<TaskPlan> = {}): TaskPlan => ({ ...buildTaskPlan({ id, initiativePlanId, planningSessionId: "ps", workspaceId: "w", clientId: "c", title: `Task ${id}`, owner: "u", order: 0, now: T0 }), ...over });
  const milestone = (id: string, initiativePlanId: string): MilestonePlan => buildMilestonePlan({ id, initiativePlanId, planningSessionId: "ps", workspaceId: "w", clientId: "c", title: `M ${id}`, order: 0, now: T0 });
  const kpi = (): KpiPlan => buildKpiPlan({ id: "k1", planningSessionId: "ps", workspaceId: "w", clientId: "c", name: "Conversions", formula: "won/total", target: 100, now: T0 });

  it("passes a well-formed plan", () => {
    const r = validateExecutionPlan({ initiatives: [init("i1")], tasks: [task("t1", "i1")], milestones: [milestone("m1", "i1")], kpis: [kpi()] });
    expect(r.ok).toBe(true);
  });
  it("flags cycles, orphans, unassigned, missing milestones, and no KPIs", () => {
    const r = validateExecutionPlan({
      initiatives: [init("i1")],
      tasks: [task("t1", "i1", { owner: null, dependencyTaskIds: ["t2"] }), task("t2", "i1", { dependencyTaskIds: ["t1"] }), task("t3", "iX")],
      milestones: [],
      kpis: [],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => /cycle/i.test(i))).toBe(true);
    expect(r.issues.some((i) => /Unassigned/i.test(i))).toBe(true);
    expect(r.issues.some((i) => /Orphan/i.test(i))).toBe(true);
    expect(r.issues.some((i) => /no milestone/i.test(i))).toBe(true);
    expect(r.issues.some((i) => /no KPIs/i.test(i))).toBe(true);
  });
});

describe("resource estimation", () => {
  it("scales people + duration with task effort", () => {
    const light = estimateResources([{ effort: "low", estimatedDurationDays: 1 }]);
    expect(light.complexity).toBe("low");
    const heavy = estimateResources([{ effort: "high", estimatedDurationDays: 10 }, { effort: "high", estimatedDurationDays: 8 }, { effort: "medium", estimatedDurationDays: 3 }]);
    expect(heavy.people).toBeGreaterThanOrEqual(1);
    expect(heavy.complexity).toBe("high");
    expect(heavy.durationDays).toBeGreaterThan(light.durationDays);
  });
});
