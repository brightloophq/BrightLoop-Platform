import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
import { env } from "../env";

/**
 * Service-role Supabase client — BYPASSES RLS.
 *
 * ██ USE THIS ALMOST NOWHERE ██
 *   It exists for exactly one legitimate case: a VERIFIED webhook from an
 *   external system that has no user session (n8n callbacks, Stripe webhooks).
 *   Those are the app's authoritative-external-truth boundary, and they must
 *   write state that no signed-in user is present to authorise.
 *
 * ██ NON-NEGOTIABLE RULES ██
 *   * Only import from a route handler that has ALREADY verified the request's
 *     HMAC / provider signature. Never behind a plain user action.
 *   * `server-only` guarantees it can never enter a client bundle.
 *   * It reads SUPABASE_SECRET_KEY, which has no NEXT_PUBLIC_ prefix — the same
 *     key nothing else in the app touches.
 *   * The state-transition trigger still fires on its writes, so even this
 *     cannot drive an illegal status move. RLS is bypassed; the machine guard
 *     is not.
 */
export function createServiceRoleClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not set — service-role client unavailable.");
  }
  return createSupabaseClient<Database>(env.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
