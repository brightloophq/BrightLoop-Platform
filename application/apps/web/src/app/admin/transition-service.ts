import "server-only";

import {
  transition,
  TransitionError,
  assertCapability,
  eventForTransition,
  type Actor,
} from "@brightloop/domain";
import type { MachineName } from "@brightloop/schema";
import { getActor } from "@/lib/auth";
import { emitEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

/**
 * The guarded transition service — THE seam every status change goes through.
 *
 * Handoff §03.13: "Put the transition guard on the server: load current status,
 * assert can(machine, current, next), else 409 + machine name + attempted move.
 * Emit a domain event on every legal transition. Store a per-entity transition
 * log (from, to, actor, reason?, at) for auditability."
 *
 * This is layer 2 of the three-layer model, and the only one that can produce the
 * audit trail:
 *   1. UI      — only offers legal moves (allowedTransitions)
 *   2. HERE    — capability check + can() guard + audit write
 *   3. DATABASE— the BEFORE UPDATE trigger rejects an illegal move even for the
 *                service-role key, and RLS decides who may write at all
 *
 * ORDERING MATTERS. The audit record is written BEFORE the status update, not
 * after. If the update then fails, we have an audit row for a transition that
 * did not happen — noisy but harmless, and detectable. If we wrote the audit
 * AFTER and it failed, we would have a silent unlogged state change: the exact
 * thing the log exists to prevent. Given a choice between an over-eager log and
 * an incomplete one, the log must over-report.
 *
 * (Postgres cannot span these in one transaction from PostgREST. A single RPC
 * would be atomic and is the right end state — noted, not yet built.)
 */

export interface TransitionResult {
  ok: boolean;
  error?: string;
  /** 409 for an illegal move, 403 for a capability failure. */
  status?: number;
}

/** Tables whose status column is not literally named `status`. */
const STATUS_COLUMN: Partial<Record<string, string>> = {
  clients: "lifecycle",
  leads: "stage",
};

export interface TransitionInput {
  /** Table to mutate. */
  table: "clients" | "leads" | "projects" | "milestones" | "deliverables" | "invoices" | "quotes" | "proposals" | "contracts";
  /** Which machine governs it — must match the DB trigger's machine argument. */
  machine: MachineName;
  entityId: string;
  /** Target state. The CURRENT state is read from the row, never trusted from the client. */
  to: string;
  /** Capability required, e.g. "projects.update". */
  capability: string;
  /** Optional reason — required by the UI for paused/delayed (handoff §08). */
  reason?: string | null;
  /** Extra columns to set alongside the status (e.g. approved_at). */
  patch?: Record<string, unknown>;
}

export async function performTransition(input: TransitionInput): Promise<TransitionResult> {
  let actor: Actor | null = null;
  try {
    actor = await getActor();
    if (!actor) return { ok: false, error: "Not signed in", status: 401 };

    assertCapability(actor, input.capability);

    const supabase = await createClient();
    const column = STATUS_COLUMN[input.table] ?? "status";

    // Read the CURRENT state from the database. Never accept a `from` supplied by
    // the caller — that would let a stale or forged client dictate which
    // transition is checked, which is the whole point of the guard.
    const { data: row, error: readErr } = await supabase
      .from(input.table)
      .select(`id, ${column}`)
      .eq("id", input.entityId)
      .maybeSingle();

    if (readErr) return { ok: false, error: readErr.message, status: 500 };
    if (!row) return { ok: false, error: "Not found", status: 404 };

    const from = (row as unknown as Record<string, string | undefined>)[column];
    if (!from) return { ok: false, error: `Row has no ${column} value`, status: 500 };
    if (from === input.to) return { ok: true }; // no-op; nothing to guard or log

    // Validates via can() and throws TransitionError (409) on an illegal move.
    const record = transition({
      machine: input.machine,
      entityId: input.entityId,
      from,
      to: input.to,
      actorId: actor.userId,
      reason: input.reason ?? null,
    });

    // Audit first — see the ordering note above.
    const { error: logErr } = await supabase.from("transition_log").insert({
      machine: record.machine,
      entity_type: input.table,
      entity_id: record.entityId,
      from_state: record.from,
      to_state: record.to,
      actor_id: record.actorId,
      reason: record.reason,
      at: record.at,
    });

    if (logErr) {
      // Refuse to make an unaudited state change. A status move we cannot record
      // is worse than a move that does not happen.
      return {
        ok: false,
        error: `Could not write the audit record, so the change was not applied: ${logErr.message}`,
        status: 500,
      };
    }

    const { error: updErr } = await supabase
      .from(input.table)
      .update({ [column]: input.to, ...(input.patch ?? {}) })
      .eq("id", input.entityId);

    if (updErr) {
      // The DB trigger is the backstop. If it fires here, the service-layer guard
      // and the DB's state_transitions table disagree — which means schema drift.
      if (updErr.code === "23514") {
        return {
          ok: false,
          status: 409,
          error: `The database rejected ${input.machine}: ${from} → ${input.to}. Service layer and DB disagree — check state_transitions against packages/schema.`,
        };
      }
      return { ok: false, error: updErr.message, status: 500 };
    }

    // Emit a server-side analytics event for moves worth counting. This is after
    // the update succeeds, and emitEvent never throws — analytics must never
    // block or roll back the business action.
    const eventName = eventForTransition(input.machine, input.to);
    if (eventName) {
      await emitEvent({
        name: eventName,
        actorId: actor.userId,
        clientId: actor.clientId,
        role: actor.role,
        props: { from, to: input.to, machine: input.machine },
      });
    }

    return { ok: true };
  } catch (e) {
    if (e instanceof TransitionError) {
      return { ok: false, status: e.httpStatus, error: e.message };
    }
    return {
      ok: false,
      status: 403,
      error: e instanceof Error ? e.message : "Transition failed",
    };
  }
}
