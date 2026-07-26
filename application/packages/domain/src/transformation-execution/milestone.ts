/* =============================================================================
 * Milestone engine — STATE MACHINE (Phase D · Sprint D5) — PURE.
 *   pending → completed | missed  (both terminal)
 * ========================================================================== */

import type { TransformationActivityType, TxMilestone, TxMilestoneStatus } from "@brightloop/schema";
import type { TransformationWorkspaceEventName } from "./events.js";

export const MILESTONE_TRANSITIONS: Record<TxMilestoneStatus, readonly TxMilestoneStatus[]> = {
  pending: ["completed", "missed"],
  completed: [],
  missed: [],
};
export function canTransitionMilestone(from: TxMilestoneStatus, to: TxMilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from].includes(to);
}

export interface CreateMilestoneInput {
  id: string;
  initiativeId: string;
  workspaceId: string;
  clientId: string | null;
  title: string;
  description?: string | null;
  plannedDate: string;
  order?: number;
  now: string;
}

/** Build a new `pending` milestone (pure). */
export function createMilestone(input: CreateMilestoneInput): TxMilestone {
  return {
    id: input.id,
    initiativeId: input.initiativeId,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    title: input.title.slice(0, 200),
    description: input.description ?? null,
    plannedDate: input.plannedDate,
    completedDate: null,
    status: "pending",
    order: input.order ?? 0,
    version: 1,
    createdAt: input.now,
  };
}

export interface MilestoneTransition {
  milestone: TxMilestone;
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  summary: string;
}
export type MilestoneTransitionOutcome = { ok: true; value: MilestoneTransition } | { ok: false; reason: "illegal_transition" };

/** Complete a milestone (stamps `completedDate = now`). Pure. */
export function completeMilestone(milestone: TxMilestone, now: string): MilestoneTransitionOutcome {
  if (!canTransitionMilestone(milestone.status, "completed")) return { ok: false, reason: "illegal_transition" };
  return {
    ok: true,
    value: {
      milestone: { ...milestone, status: "completed", completedDate: now, version: milestone.version + 1 },
      event: "milestone.completed",
      activityType: "milestone_completed",
      summary: `Milestone "${milestone.title}" completed.`.slice(0, 400),
    },
  };
}

/** Mark a milestone missed. Pure. */
export function missMilestone(milestone: TxMilestone): MilestoneTransitionOutcome {
  if (!canTransitionMilestone(milestone.status, "missed")) return { ok: false, reason: "illegal_transition" };
  return {
    ok: true,
    value: {
      milestone: { ...milestone, status: "missed", version: milestone.version + 1 },
      event: "milestone.missed",
      activityType: "milestone_missed",
      summary: `Milestone "${milestone.title}" missed.`.slice(0, 400),
    },
  };
}
