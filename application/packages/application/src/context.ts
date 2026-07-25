/* =============================================================================
 * Application context + authorization (Phase C · Sprint C1).
 *
 * A use-case receives an `AppContext` and its typed input, and nothing else. It
 * never sees a request, a cookie, a Supabase client, or a repository — the
 * ROUTE builds the context and the use-case orchestrates runtime services.
 *
 * Authorization is enforced HERE, before any runtime call, using the domain's
 * canonical capability matrix (`may` / `hasCapability`) as the single source of
 * truth — but the thrown error is an APPLICATION error, so the boundary speaks
 * one error vocabulary. The runtime tables are internal-only (RLS), so this is a
 * fast, clear pre-check in front of RLS, never a replacement for it.
 * ========================================================================== */

import type { Actor, Clock, RuntimeIdGen, RuntimeServices, TransformationExecutionRepositories } from "@brightloop/domain";
import { may } from "@brightloop/domain";
import { isClientRole } from "@brightloop/schema";
import { ForbiddenError, RuntimeUnavailableError } from "./errors.js";

/** Capability required to create / cancel / retry a scan (internal authority). */
export const SCAN_WRITE_CAP = "transformation.scan.write";
/** Capability required to read a scan and its outputs (internal authority). */
export const SCAN_READ_CAP = "transformation.read";

/** Phase D · capability to seed / write a transformation workspace (internal). */
export const TRANSFORMATION_WRITE_CAP = "transformation.write";
/** Phase D · capability to read a transformation workspace (internal). */
export const TRANSFORMATION_READ_CAP = "transformation.read";
/** Phase D · capability to read initiatives (internal). */
export const INITIATIVE_READ_CAP = "initiative.read";

/**
 * Everything a use-case needs. The runtime `services` are already bound to the
 * caller's RLS-scoped session by the route; `ids`/`clock` are injected so the
 * application layer owns no ambient nondeterminism.
 */
export interface AppContext {
  services: RuntimeServices;
  actor: Actor;
  ids: RuntimeIdGen;
  clock: Clock;
  /**
   * Phase D · Transformation Execution repositories, bound to the caller's
   * RLS-scoped session by the route. Optional so pre-Phase-D contexts (and every
   * scan use-case) are unaffected; Phase D use-cases require it via
   * `requireExecution`.
   */
  execution?: TransformationExecutionRepositories;
}

/** Assert the Phase D repositories are wired, or fail with a clean 503. */
export function requireExecution(ctx: AppContext): TransformationExecutionRepositories {
  if (ctx.execution === undefined) {
    throw new RuntimeUnavailableError("The transformation execution store is not available");
  }
  return ctx.execution;
}

/**
 * Capability + ownership in one call.
 *
 * Capability comes from the domain matrix. Ownership: a client-scoped actor may
 * only touch its own org's runs; internal actors are capability-scoped, not
 * ownership-scoped, so they pass the ownership half (mirrors
 * `domain/assertOwnClient`). A mismatch throws `ForbiddenError` — never a
 * domain `AuthorizationError`, so nothing below the boundary leaks upward.
 */
export function authorize(actor: Actor, capability: string, targetClientId: string | null): void {
  if (!may(actor, capability)) {
    throw new ForbiddenError();
  }
  if (isClientRole(actor.role)) {
    if (actor.clientId === null || targetClientId === null || actor.clientId !== targetClientId) {
      throw new ForbiddenError();
    }
  }
}
