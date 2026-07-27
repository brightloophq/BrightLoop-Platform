/* =============================================================================
 * Agent lifecycle state machines (Phase E · Sprint E7) — PURE.
 *
 * Guarded, explicit transitions for missions, runs, and tasks. Every transition
 * is validated; illegal jumps are rejected. No io.
 * ========================================================================== */

import type { AgentRunStatus, AgentTaskStatus, MissionStatus } from "@brightloop/schema";

export const MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  draft: ["queued", "cancelled", "archived"],
  queued: ["planning", "cancelled", "timed_out"],
  planning: ["running", "waiting_for_approval", "failed", "cancelled", "timed_out"],
  running: ["waiting_for_approval", "completed", "failed", "cancelled", "timed_out"],
  waiting_for_approval: ["resuming", "running", "cancelled", "failed", "timed_out"],
  resuming: ["running", "failed", "cancelled", "timed_out"],
  completed: ["archived"],
  failed: ["archived", "queued"],
  cancelled: ["archived"],
  timed_out: ["archived"],
  archived: [],
};
export function canTransitionMission(from: MissionStatus, to: MissionStatus): boolean {
  return MISSION_TRANSITIONS[from].includes(to);
}

export const RUN_TRANSITIONS: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  created: ["planning", "executing", "cancelled"],
  planning: ["executing", "failed", "cancelled"],
  executing: ["observing", "paused", "completed", "failed", "cancelled", "timed_out"],
  observing: ["evaluating", "executing", "completed", "failed"],
  evaluating: ["completed", "executing", "failed"],
  paused: ["executing", "cancelled", "timed_out"],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};
export function canTransitionRun(from: AgentRunStatus, to: AgentRunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export const AGENT_TASK_TRANSITIONS: Record<AgentTaskStatus, readonly AgentTaskStatus[]> = {
  pending: ["ready", "skipped"],
  ready: ["claimed", "skipped"],
  claimed: ["running", "ready"],
  running: ["waiting_for_approval", "completed", "failed"],
  waiting_for_approval: ["running", "completed", "failed", "skipped"],
  completed: ["compensating"],
  failed: ["ready", "compensating", "skipped"],
  skipped: [],
  compensating: ["compensated", "failed"],
  compensated: [],
};
export function canTransitionAgentTask(from: AgentTaskStatus, to: AgentTaskStatus): boolean {
  return AGENT_TASK_TRANSITIONS[from].includes(to);
}

/** Terminal mission states — no further work is possible. */
export function isMissionTerminal(status: MissionStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "timed_out" || status === "archived";
}
