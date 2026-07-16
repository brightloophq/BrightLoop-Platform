/* =============================================================================
 * Transition guard — service-layer enforcement (layer 2 of 3).
 * Layer 1 = UI (hide/disable). Layer 3 = DB trigger + RLS (packages/db).
 *
 * Every mutation that changes a `status` MUST pass through assertTransition()
 * and record a TransitionRecord in the transition_log.
 * ========================================================================== */

import { can, nextStates, type MachineName } from "@brightloop/schema";
import { TransitionError } from "./errors.js";

/** An audit row for `transition_log` (from, to, actor, reason, at). */
export interface TransitionRecord {
  machine: MachineName;
  entityId: string;
  from: string;
  to: string;
  actorId: string | null;
  reason: string | null;
  at: string;
}

export interface TransitionInput {
  machine: MachineName;
  entityId: string;
  from: string;
  to: string;
  actorId: string | null;
  reason?: string | null;
}

/** A clock, injectable so tests stay deterministic. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();

/**
 * Assert a transition is legal. Throws TransitionError (409) if it is not.
 * Rejecting at the service layer is required — the UI must never be the only gate.
 */
export function assertTransition(machine: MachineName, from: string, to: string): void {
  if (!can(machine, from, to)) {
    throw new TransitionError(machine, from, to);
  }
}

/**
 * Validate a transition and produce the audit record to persist alongside it.
 * Callers write the record to `transition_log` in the same DB transaction as
 * the status change.
 */
export function transition(input: TransitionInput, now: Clock = systemClock): TransitionRecord {
  assertTransition(input.machine, input.from, input.to);
  return {
    machine: input.machine,
    entityId: input.entityId,
    from: input.from,
    to: input.to,
    actorId: input.actorId,
    reason: input.reason ?? null,
    at: now(),
  };
}

/** Legal next states — used by the UI so it never offers an illegal transition. */
export function allowedTransitions(machine: MachineName, from: string): readonly string[] {
  return nextStates(machine, from);
}
