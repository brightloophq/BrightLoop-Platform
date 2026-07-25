/* =============================================================================
 * Initiative Lifecycle — STATE MACHINE + pure transition services (Phase D · D2).
 *
 * A deterministic, forward-only lifecycle:
 *   seeded → planned → active → completed → archived
 * Nothing else is legal (no skips, no reversals, `archived` is terminal). The
 * transition services are PURE: they validate the move and produce the next
 * aggregate + the event/activity descriptor. They never write, never call io, and
 * bump the optimistic-concurrency `version` so the repository can guard the save.
 * ========================================================================== */

import type { Initiative, InitiativeExecutionStatus, TransformationActivityType } from "@brightloop/schema";
import type { TransformationWorkspaceEventName } from "./events.js";

/** The legal forward transitions. Anything not listed is rejected. */
export const INITIATIVE_TRANSITIONS: Record<InitiativeExecutionStatus, readonly InitiativeExecutionStatus[]> = {
  seeded: ["planned"],
  planned: ["active"],
  active: ["completed"],
  completed: ["archived"],
  archived: [],
};

/** Is `from → to` a legal initiative transition? */
export function canTransitionInitiative(from: InitiativeExecutionStatus, to: InitiativeExecutionStatus): boolean {
  return INITIATIVE_TRANSITIONS[from].includes(to);
}

/** What a legal transition produces — the next aggregate + audit descriptors. */
export interface InitiativeTransition {
  /** The next initiative: target status, `version + 1`. */
  initiative: Initiative;
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  summary: string;
}

export type InitiativeTransitionOutcome =
  | { ok: true; value: InitiativeTransition }
  | { ok: false; reason: "illegal_transition" };

/** A lifecycle transition target — every status except the initial `seeded`. */
export type InitiativeLifecycleTarget = Exclude<InitiativeExecutionStatus, "seeded">;

export interface InitiativeTransitionDescriptor {
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  verb: string;
}

/** Descriptors per target status. `seeded` is never a transition target. */
const DESCRIPTOR: Record<InitiativeLifecycleTarget, InitiativeTransitionDescriptor> = {
  planned: { event: "initiative.planned", activityType: "initiative_planned", verb: "planned" },
  active: { event: "initiative.activated", activityType: "initiative_activated", verb: "activated" },
  completed: { event: "initiative.completed", activityType: "initiative_completed", verb: "completed" },
  archived: { event: "initiative.archived", activityType: "initiative_archived", verb: "archived" },
};

/** The event / activity / verb descriptors for a lifecycle target. */
export function describeInitiativeTarget(to: InitiativeLifecycleTarget): InitiativeTransitionDescriptor {
  return DESCRIPTOR[to];
}

/**
 * Attempt a lifecycle transition. Pure — returns the next aggregate + descriptors
 * on success, or an `illegal_transition` outcome the application maps to a 409.
 */
export function transitionInitiative(initiative: Initiative, to: InitiativeExecutionStatus): InitiativeTransitionOutcome {
  if (to === "seeded" || !canTransitionInitiative(initiative.executionStatus, to)) {
    return { ok: false, reason: "illegal_transition" };
  }
  const d = DESCRIPTOR[to];
  return {
    ok: true,
    value: {
      initiative: { ...initiative, executionStatus: to, version: initiative.version + 1 },
      event: d.event,
      activityType: d.activityType,
      summary: `Initiative "${initiative.title}" ${d.verb}.`.slice(0, 400),
    },
  };
}

/** Convenience transition services (each a pure `transitionInitiative` at a target). */
export const planInitiative = (initiative: Initiative): InitiativeTransitionOutcome => transitionInitiative(initiative, "planned");
export const activateInitiative = (initiative: Initiative): InitiativeTransitionOutcome => transitionInitiative(initiative, "active");
export const completeInitiative = (initiative: Initiative): InitiativeTransitionOutcome => transitionInitiative(initiative, "completed");
export const archiveInitiative = (initiative: Initiative): InitiativeTransitionOutcome => transitionInitiative(initiative, "archived");
