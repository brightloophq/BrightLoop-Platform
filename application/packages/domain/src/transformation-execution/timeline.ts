/* =============================================================================
 * Timeline engine — STATE MACHINE + variance (Phase D · Sprint D5) — PURE.
 *
 *   planned → active → completed
 *   planned | active → cancelled
 * `completed`/`cancelled` are terminal. Variance is DERIVED from the dates, never
 * stored-and-edited. Services validate and return the next aggregate; no io.
 * ========================================================================== */

import type { Timeline, TimelineStatus, TransformationActivityType } from "@brightloop/schema";
import type { TransformationWorkspaceEventName } from "./events.js";

export const TIMELINE_TRANSITIONS: Record<TimelineStatus, readonly TimelineStatus[]> = {
  planned: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionTimeline(from: TimelineStatus, to: TimelineStatus): boolean {
  return TIMELINE_TRANSITIONS[from].includes(to);
}

/** Whole-day difference `b - a` (negative when `b` precedes `a`). Pure. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Derived durations + variance (in whole days). `variance > 0` = late. */
export interface TimelineVariance {
  plannedDuration: number;
  actualDuration: number | null;
  variance: number | null;
}
export function calculateVariance(timeline: Pick<Timeline, "startDate" | "targetEndDate" | "actualEndDate">): TimelineVariance {
  const plannedDuration = daysBetween(timeline.startDate, timeline.targetEndDate);
  const actualDuration = timeline.actualEndDate === null ? null : daysBetween(timeline.startDate, timeline.actualEndDate);
  const variance = actualDuration === null ? null : actualDuration - plannedDuration;
  return { plannedDuration, actualDuration, variance };
}

/** A negative planned duration (target before start) is invalid. */
export function isValidTimelineDates(startDate: string, targetEndDate: string): boolean {
  return daysBetween(startDate, targetEndDate) >= 0;
}

type TimelineTarget = Exclude<TimelineStatus, "planned">;
export interface TimelineTransition {
  timeline: Timeline;
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  summary: string;
}
export type TimelineTransitionOutcome = { ok: true; value: TimelineTransition } | { ok: false; reason: "illegal_transition" };

const DESCRIPTOR: Record<TimelineTarget, { event: TransformationWorkspaceEventName; activityType: TransformationActivityType; verb: string }> = {
  active: { event: "timeline.started", activityType: "timeline_started", verb: "started" },
  completed: { event: "timeline.completed", activityType: "timeline_completed", verb: "completed" },
  cancelled: { event: "timeline.cancelled", activityType: "timeline_cancelled", verb: "cancelled" },
};

/** Transition a timeline. Completing stamps `actualEndDate = now`. Pure. */
export function transitionTimeline(timeline: Timeline, to: TimelineTarget, now: string): TimelineTransitionOutcome {
  if (!canTransitionTimeline(timeline.status, to)) return { ok: false, reason: "illegal_transition" };
  const d = DESCRIPTOR[to];
  return {
    ok: true,
    value: {
      timeline: { ...timeline, status: to, actualEndDate: to === "completed" ? now : timeline.actualEndDate, version: timeline.version + 1 },
      event: d.event,
      activityType: d.activityType,
      summary: `Timeline for initiative ${timeline.initiativeId} ${d.verb}.`.slice(0, 400),
    },
  };
}

export const startTimeline = (t: Timeline, now: string): TimelineTransitionOutcome => transitionTimeline(t, "active", now);
export const completeTimeline = (t: Timeline, now: string): TimelineTransitionOutcome => transitionTimeline(t, "completed", now);
export const cancelTimeline = (t: Timeline, now: string): TimelineTransitionOutcome => transitionTimeline(t, "cancelled", now);
