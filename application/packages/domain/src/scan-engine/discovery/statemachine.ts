/* =============================================================================
 * Discovery state machine + checkpoint/resume + retry (PDF 27 §14) — PURE.
 *
 * States: pending → running → (paused ⇄ running) → completed | failed |
 * cancelled. Every transition is a pure function of (state, event). Checkpoints
 * are resumable: a resume replays only the PENDING targets. Retry policy is a
 * pure predicate over attempt + error code. Deterministic; `now` is supplied.
 * ========================================================================== */

import {
  discoveryCheckpointSchema,
  type DiscoveryState,
  type DiscoveryEvent,
  type DiscoveryCheckpoint,
  type DiscoveryRetryPolicy,
} from "@brightloop/schema";

/** Legal transitions per (state → event). Anything else is rejected. */
const TRANSITIONS: Record<DiscoveryState, Partial<Record<DiscoveryEvent, DiscoveryState>>> = {
  pending: { start: "running", cancel: "cancelled" },
  running: { pause: "paused", complete: "completed", fail: "failed", cancel: "cancelled" },
  paused: { resume: "running", fail: "failed", cancel: "cancelled" },
  completed: {},
  failed: {},
  cancelled: {},
};

export function isTerminal(state: DiscoveryState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}

/** The state after applying `event`, or null if the transition is illegal. */
export function nextState(state: DiscoveryState, event: DiscoveryEvent): DiscoveryState | null {
  return TRANSITIONS[state][event] ?? null;
}

export function canTransition(state: DiscoveryState, event: DiscoveryEvent): boolean {
  return nextState(state, event) !== null;
}

/** A fresh checkpoint for a session with its planned target ids (all pending). */
export function newCheckpoint(sessionId: string, targetIds: string[], now: string): DiscoveryCheckpoint {
  return discoveryCheckpointSchema.parse({ sessionId, state: "pending", completedTargetIds: [], pendingTargetIds: targetIds, attempt: 0, updatedAt: now });
}

/** Apply an event to a checkpoint. Illegal transitions return the checkpoint unchanged. */
export function applyEvent(checkpoint: DiscoveryCheckpoint, event: DiscoveryEvent, now: string, error?: string): DiscoveryCheckpoint {
  const to = nextState(checkpoint.state, event);
  if (to === null) return checkpoint;
  return discoveryCheckpointSchema.parse({ ...checkpoint, state: to, updatedAt: now, lastError: event === "fail" ? (error ?? checkpoint.lastError) : checkpoint.lastError });
}

/** Mark a target completed (moves it from pending → completed). Pure. */
export function completeTarget(checkpoint: DiscoveryCheckpoint, targetId: string, now: string): DiscoveryCheckpoint {
  if (!checkpoint.pendingTargetIds.includes(targetId)) return checkpoint;
  return discoveryCheckpointSchema.parse({
    ...checkpoint,
    completedTargetIds: [...checkpoint.completedTargetIds, targetId],
    pendingTargetIds: checkpoint.pendingTargetIds.filter((id) => id !== targetId),
    updatedAt: now,
  });
}

/**
 * Resume a paused/failed checkpoint: transition back to running and bump the
 * attempt. Only the PENDING targets remain — completed work is never repeated.
 * Returns the checkpoint unchanged if it is terminal-complete or cannot resume.
 */
export function resume(checkpoint: DiscoveryCheckpoint, now: string): DiscoveryCheckpoint {
  if (checkpoint.state !== "paused" && checkpoint.state !== "failed") return checkpoint;
  return discoveryCheckpointSchema.parse({ ...checkpoint, state: "running", attempt: checkpoint.attempt + 1, updatedAt: now });
}

/* ---- retry policy (pure) -------------------------------------------------- */
export function isFatal(errorCode: string, policy: DiscoveryRetryPolicy): boolean {
  return policy.fatalCodes.includes(errorCode);
}

/** Retry iff not fatal and attempts remain. */
export function shouldRetry(attempt: number, errorCode: string, policy: DiscoveryRetryPolicy): boolean {
  return !isFatal(errorCode, policy) && attempt < policy.maxRetries;
}

/** Exponential backoff for attempt N (1-indexed), or null once exhausted. Deterministic. */
export function backoffMs(attempt: number, policy: DiscoveryRetryPolicy): number | null {
  if (attempt < 1 || attempt > policy.maxRetries) return null;
  return policy.backoffBaseMs * 2 ** (attempt - 1);
}
