/* =============================================================================
 * Capability + client-scope enforcement — service layer (layer 2 of 3).
 * RLS remains the real boundary (layer 3); these checks fail fast with clear
 * errors and keep illegal calls from reaching the database at all.
 * ========================================================================== */

import { hasCapability, isClientRole, type Role } from "@brightloop/schema";
import { AuthorizationError, ClientScopeError } from "./errors.js";

/** The authenticated actor, as derived from JWT claims (role + client_id). */
export interface Actor {
  userId: string;
  role: Role;
  /** null for internal roles; the org id for client roles. */
  clientId: string | null;
}

/** Throws AuthorizationError (403) if the actor's role lacks the capability. */
export function assertCapability(actor: Actor, capability: string): void {
  if (!hasCapability(actor.role, capability)) {
    throw new AuthorizationError(actor.role, capability);
  }
}

/**
 * Throws ClientScopeError (403) if a client-scoped actor targets a record
 * belonging to a different client org. Internal roles are capability-scoped,
 * not ownership-scoped, so they pass this check.
 */
export function assertOwnClient(actor: Actor, targetClientId: string): void {
  if (!isClientRole(actor.role)) return;
  if (actor.clientId === null || actor.clientId !== targetClientId) {
    throw new ClientScopeError(actor.clientId, targetClientId);
  }
}

/** Capability + ownership in one call, for client-scoped mutations. */
export function assertCanActOnClient(
  actor: Actor,
  capability: string,
  targetClientId: string,
): void {
  assertCapability(actor, capability);
  assertOwnClient(actor, targetClientId);
}

/** Non-throwing variant for UI gating (hide vs disable). */
export function may(actor: Actor, capability: string): boolean {
  return hasCapability(actor.role, capability);
}
