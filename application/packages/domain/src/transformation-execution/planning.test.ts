/* =============================================================================
 * Planning & Performance domain tests (Phase D · Sprint D5+D6).
 *
 * Timeline lifecycle + variance, milestone lifecycle, KPI evaluation, deterministic
 * progress calculation, and the workspace-health policy — all pure.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { Timeline, TxMilestone } from "@brightloop/schema";
import { calculateVariance, canTransitionTimeline, completeTimeline, daysBetween, isValidTimelineDates, startTimeline, transitionTimeline } from "./timeline.js";
import { completeMilestone, createMilestone, missMilestone } from "./milestone.js";
import { createKpi, evaluateKpi, updateKpi } from "./kpi.js";
import { calculateInitiativeProgress, calculateWorkspaceProgress } from "./progress.js";
import { calculateWorkspaceHealth } from "./health.js";

const T0 = "2026-07-01T00:00:00.000Z";

function timeline(status: Timeline["status"], over: Partial<Timeline> = {}): Timeline {
  return { id: "tl_1", initiativeId: "init_1", workspaceId: "txw", clientId: "cli", startDate: "2026-07-01", targetEndDate: "2026-07-11", actualEndDate: null, status, version: 1, createdAt: T0, ...over };
}

/* ---- Timeline -------------------------------------------------------------- */
describe("timeline engine", () => {
  it("allows only legal transitions", () => {
    expect(canTransitionTimeline("planned", "active")).toBe(true);
    expect(canTransitionTimeline("active", "completed")).toBe(true);
    expect(canTransitionTimeline("planned", "cancelled")).toBe(true);
    expect(canTransitionTimeline("planned", "completed")).toBe(false);
    expect(canTransitionTimeline("completed", "active")).toBe(false);
  });

  it("completing stamps actualEndDate and bumps version", () => {
    const started = startTimeline(timeline("planned"), T0);
    expect(started.ok && started.value.timeline.status).toBe("active");
    const done = completeTimeline(timeline("active"), "2026-07-15T00:00:00.000Z");
    expect(done.ok && done.value.timeline.actualEndDate).toBe("2026-07-15T00:00:00.000Z");
    expect(done.ok && done.value.timeline.version).toBe(2);
  });

  it("rejects an illegal transition", () => {
    expect(transitionTimeline(timeline("completed"), "active", T0).ok).toBe(false);
  });

  it("derives variance in whole days (positive = late)", () => {
    expect(daysBetween("2026-07-01", "2026-07-11")).toBe(10);
    const v = calculateVariance(timeline("completed", { actualEndDate: "2026-07-15" }));
    expect(v).toEqual({ plannedDuration: 10, actualDuration: 14, variance: 4 });
    expect(calculateVariance(timeline("active")).variance).toBeNull();
  });

  it("flags a negative planned duration", () => {
    expect(isValidTimelineDates("2026-07-11", "2026-07-01")).toBe(false);
    expect(isValidTimelineDates("2026-07-01", "2026-07-11")).toBe(true);
  });
});

/* ---- Milestone ------------------------------------------------------------- */
describe("milestone engine", () => {
  const ms = (status: TxMilestone["status"]): TxMilestone => ({ id: "ms_1", initiativeId: "init_1", workspaceId: "txw", clientId: "cli", title: "M", description: null, plannedDate: "2026-07-05", completedDate: null, status, order: 0, version: 1, createdAt: T0 });

  it("creates pending, completes (stamps date), or misses", () => {
    const created = createMilestone({ id: "ms_1", initiativeId: "init_1", workspaceId: "txw", clientId: "cli", title: "M", plannedDate: "2026-07-05", now: T0 });
    expect(created.status).toBe("pending");
    const done = completeMilestone(ms("pending"), "2026-07-06T00:00:00.000Z");
    expect(done.ok && done.value.milestone.status).toBe("completed");
    expect(done.ok && done.value.milestone.completedDate).toBe("2026-07-06T00:00:00.000Z");
    const missed = missMilestone(ms("pending"));
    expect(missed.ok && missed.value.milestone.status).toBe("missed");
  });

  it("rejects transitions from terminal states", () => {
    expect(completeMilestone(ms("missed"), T0).ok).toBe(false);
    expect(missMilestone(ms("completed")).ok).toBe(false);
  });
});

/* ---- KPI ------------------------------------------------------------------- */
describe("kpi engine", () => {
  it("derives status deterministically (up-is-good)", () => {
    expect(evaluateKpi(100, 100)).toBe("on_track");
    expect(evaluateKpi(100, 80)).toBe("at_risk");
    expect(evaluateKpi(100, 50)).toBe("off_track");
  });

  it("updateKpi re-evaluates status + bumps version", () => {
    const k = createKpi({ id: "kpi_1", workspaceId: "txw", clientId: "cli", name: "Conversions", target: 100, current: 40, now: T0 });
    expect(k.status).toBe("off_track");
    const up = updateKpi(k, 95, "2026-07-10T00:00:00.000Z");
    expect(up.status).toBe("at_risk");
    expect(up.version).toBe(2);
  });
});

/* ---- Progress -------------------------------------------------------------- */
describe("progress engine", () => {
  it("is deterministic and weighted, clamped to [0,100]", () => {
    const full = calculateInitiativeProgress({ approvedReview: true, taskTotal: 4, taskCompleted: 4, dependenciesSatisfied: true, milestoneTotal: 2, milestoneCompleted: 2, timelineCompleted: true });
    expect(full).toBe(100);
    const none = calculateInitiativeProgress({ approvedReview: false, taskTotal: 0, taskCompleted: 0, dependenciesSatisfied: false, milestoneTotal: 0, milestoneCompleted: 0, timelineCompleted: false });
    expect(none).toBe(0);
    // review 20 + tasks 40*0.5=20 = 40
    const partial = calculateInitiativeProgress({ approvedReview: true, taskTotal: 4, taskCompleted: 2, dependenciesSatisfied: false, milestoneTotal: 0, milestoneCompleted: 0, timelineCompleted: false });
    expect(partial).toBe(40);
  });

  it("workspace progress is the mean of initiative progresses", () => {
    expect(calculateWorkspaceProgress([100, 0])).toBe(50);
    expect(calculateWorkspaceProgress([])).toBe(0);
  });
});

/* ---- Workspace health ------------------------------------------------------ */
describe("workspace health policy", () => {
  it("is healthy when all signals are good", () => {
    expect(calculateWorkspaceHealth({ reviewCompletion: 1, taskCompletion: 1, dependencySatisfaction: 1, timelineVarianceDays: -2, kpiStatuses: ["on_track"] }).health).toBe("healthy");
  });
  it("is critical on off-track KPIs, very low task completion, or very late timeline", () => {
    expect(calculateWorkspaceHealth({ reviewCompletion: 1, taskCompletion: 1, dependencySatisfaction: 1, timelineVarianceDays: 0, kpiStatuses: ["off_track"] }).health).toBe("critical");
    expect(calculateWorkspaceHealth({ reviewCompletion: 1, taskCompletion: 0.1, dependencySatisfaction: 1, timelineVarianceDays: 0, kpiStatuses: [] }).health).toBe("critical");
    expect(calculateWorkspaceHealth({ reviewCompletion: 1, taskCompletion: 1, dependencySatisfaction: 1, timelineVarianceDays: 20, kpiStatuses: [] }).health).toBe("critical");
  });
  it("is a warning on moderate signals", () => {
    const r = calculateWorkspaceHealth({ reviewCompletion: 0.4, taskCompletion: 0.5, dependencySatisfaction: 0.8, timelineVarianceDays: 3, kpiStatuses: ["at_risk"] });
    expect(r.health).toBe("warning");
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});
