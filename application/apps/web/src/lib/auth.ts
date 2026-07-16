import { redirect } from "next/navigation";
import type { Actor } from "@brightloop/domain";
import { isClientRole } from "@brightloop/schema";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./env";
import { roleFromClaims, clientIdFromClaims, roleAllowedOn, type Surface } from "./surfaces";

/**
 * Resolve the current Actor from the session's JWT claims.
 *
 * The role and client_id come from `app_metadata`, which is stamped by the
 * database auth hook (packages/db 0005) — they are NOT user-writable. A session
 * without a valid role claim resolves to null, and RLS would deny it anyway.
 */
export async function getActor(): Promise<Actor | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = roleFromClaims(user.app_metadata);
  if (!role) return null;

  const clientId = clientIdFromClaims(user.app_metadata);

  // A client role with no client_id claim is malformed — deny rather than guess.
  if (isClientRole(role) && clientId === null) return null;

  return { userId: user.id, role, clientId };
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
    redirect(`/login?next=${encodeURIComponent(surface === "admin" ? "/admin" : "/portal")}`);
  }

  if (!roleAllowedOn(surface, actor.role)) {
    // Do not reveal whether the surface exists — send them to their own surface.
    redirect(isClientRole(actor.role) ? "/portal" : "/admin");
  }

  return actor;
}
