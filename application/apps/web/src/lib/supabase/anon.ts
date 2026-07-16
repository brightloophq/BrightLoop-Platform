import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
import { env, isSupabaseConfigured } from "../env";

/**
 * Cookie-less Supabase client for PUBLIC content.
 *
 * WHY THIS EXISTS (and why it isn't a shortcut):
 *   The cookie-based server client calls `cookies()`, which only exists inside a
 *   request. `generateStaticParams` and static prerendering run at BUILD time,
 *   where there is no request — so a cookie client cannot be used there, and the
 *   build fails collecting page data.
 *
 *   The right resolution is not "make the pages dynamic". It is that public
 *   marketing content is NOT user-scoped: the portfolio and testimonials look
 *   identical to every visitor, signed in or not. There is no session to respect,
 *   so binding one is meaningless.
 *
 * SECURITY:
 *   This uses ONLY the publishable key and never attaches a session, so every
 *   query runs as the `anon` role. That means the RLS publish policy applies in
 *   full — anon can read only publish ∈ {public, featured}. It is strictly LESS
 *   privileged than the session client, not more. It cannot see drafts, and it
 *   cannot see any client-scoped row.
 *
 *   Persisting a session is explicitly disabled — there is no browser here, and
 *   a shared module-level client must never accumulate auth state.
 *
 * DO NOT use this for the portal or admin. Those surfaces are user-scoped and
 * must use the cookie client so RLS sees the caller's role and client_id.
 */
export function createAnonClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createSupabaseClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
