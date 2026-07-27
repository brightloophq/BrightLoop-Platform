import { redirect } from "next/navigation";
import type { Actor } from "@brightloop/domain";
import { isClientRole } from "@brightloop/schema";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./env";
import { roleFromClaims, clientIdFromClaims, roleAllowedOn, SURFACE_PREFIX, type Surface } from "./surfaces";

/**
 * Resolve the current Actor from the session's JWT CLAIMS.
 *
 * ██ WHY getClaims() AND NOT getUser() ██
 *   `getUser()` (and the `user` object from signIn) returns the GoTrue USER
 *   RECORD, whose `app_metadata` is only `{provider, providers}`. The custom
 *   access token hook injects `role` and `client_id` into the JWT — NOT into that
 *   record. Reading `user.app_metadata.role` therefore always came back
 *   undefined, and the app declared "this account has no role" while RLS was
 *   happily granting owner access off the very same session. The two disagreed
 *   because they were reading different objects.
 *
 *   `getClaims()` returns the claims from the access token — the same thing
 *   Postgres sees in `auth.jwt()`. That makes the app's view of a session and
 *   RLS's view identical by construction, which is the only way they cannot
 *   drift.
 *
 * ██ IS IT SAFE? ██
 *   Yes. getClaims() VERIFIES the token: this project signs with ES256, so the
 *   signature is checked against the project's public JWKS before any claim is
 *   trusted. It is not `getSession()`, which merely decodes whatever is in the
 *   cookie. A forged or tampered token fails verification and resolves to null.
 */
export async function getActor(): Promise<Actor | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;
  const userId = typeof claims["sub"] === "string" ? claims["sub"] : null;
  if (!userId) return null;

  // The hook merges role/client_id into app_metadata inside the token.
  const appMetadata = claims["app_metadata"];
  const role = roleFromClaims(appMetadata);
  if (!role) return null;

  const clientId = clientIdFromClaims(appMetadata);

  // A client role with no client_id claim is malformed — deny rather than guess.
  if (isClientRole(role) && clientId === null) return null;

  return { userId, role, clientId };
}

/**
 * Server-side surface guard. Call at the top of every protected layout.
 *
 * This runs in the Server Component tree, so it cannot be skipped by a client
 * that ignores middleware. It is the second of three checks (middleware →
 * layout → RLS), not the only one.
 */
export async function requireSurface(surface: Exclude<Surface, "public">): Promise<Actor> {
  const actor = await getActor();

  if (!actor) {
    redirect(`/login?next=${encodeURIComponent(SURFACE_PREFIX[surface])}`);
  }

  if (!roleAllowedOn(surface, actor.role)) {
    // Do not reveal whether the surface exists — send them to their own home
    // surface (the client product experience for client roles, admin otherwise).
    redirect(isClientRole(actor.role) ? "/workspace" : "/admin");
  }

  return actor;
}
