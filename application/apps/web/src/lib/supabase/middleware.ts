import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "../env";

/** Shape of the batch @supabase/ssr hands to `setAll`. Annotated explicitly
 *  because the cookie-methods union blocks contextual inference. */
type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

export interface SessionResult {
  response: NextResponse;
  /**
   * VERIFIED JWT claims, or null. This is deliberately claims — not a `user`
   * object — because the role lives in the token, not on the user record.
   */
  claims: Record<string, unknown> | null;
}

/**
 * Refreshes the Supabase session on every request and returns its verified JWT
 * claims.
 *
 * Uses getClaims(), NOT getUser(): the custom access token hook injects
 * role/client_id into the TOKEN, while the user record's app_metadata only ever
 * holds {provider, providers}. Middleware gating on the record would let every
 * signed-in user through the role check regardless of their actual role.
 *
 * getClaims() verifies the signature (this project signs ES256) against the
 * project JWKS before returning anything — it is not a bare cookie decode.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });

  // Not configured → fail closed: nobody is authenticated.
  if (!isSupabaseConfigured()) {
    return { response, claims: null };
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

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { response, claims: null };

  return { response, claims: data.claims as unknown as Record<string, unknown> };
}
