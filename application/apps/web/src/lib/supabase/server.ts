import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, isSupabaseConfigured } from "../env";

/** Shape of the batch @supabase/ssr hands to `setAll`. Annotated explicitly
 *  because the cookie-methods union blocks contextual inference. */
type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

/**
 * Request-scoped Supabase client for Server Components / Route Handlers.
 *
 * IMPORTANT: this uses the ANON key and the caller's session, so every query
 * runs under the user's JWT and is therefore subject to RLS. That is the point —
 * RLS is the authorization boundary. Never swap this for the service-role key to
 * "make a query work"; the service-role key bypasses RLS entirely.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — cookies are read-only there.
          // Middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
