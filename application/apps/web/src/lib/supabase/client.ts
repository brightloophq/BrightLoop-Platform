"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@brightloop/db";
import { env, isSupabaseConfigured } from "../env";

/**
 * Browser Supabase client (requirement 6 — separate browser and server clients).
 *
 * Uses ONLY the publishable key. That key is designed to be public: every query
 * it makes runs as the `anon` role, or as the signed-in user once a session
 * cookie exists — so RLS applies to all of it.
 *
 * The secret key is NEVER importable here. It has no NEXT_PUBLIC_ prefix, so
 * Next's bundler cannot inline it into client code even by accident
 * (requirement 7). The absence of that prefix is the enforcement mechanism.
 *
 * Session state is cookie-based and shared with the server client, so SSR and
 * the browser agree on who is signed in (requirement 5).
 */
export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
}
