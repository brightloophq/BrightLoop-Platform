import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "../env";
import type { User } from "@supabase/supabase-js";

/** Shape of the batch @supabase/ssr hands to `setAll`. Annotated explicitly
 *  because the cookie-methods union blocks contextual inference. */
type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

export interface SessionResult {
  response: NextResponse;
  user: User | null;
}

/**
 * Refreshes the Supabase session on every request and returns the authenticated
 * user (or null). Uses getUser() — NOT getSession() — because getUser()
 * revalidates the token with the auth server rather than trusting a cookie.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });

  // Not configured (Sprint 0) → fail closed: nobody is authenticated.
  if (!isSupabaseConfigured()) {
    return { response, user: null };
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
