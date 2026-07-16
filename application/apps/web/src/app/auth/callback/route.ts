import { NextResponse, type NextRequest } from "next/server";
import { isClientRole, isRole } from "@brightloop/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link / OAuth callback.
 *
 * Supabase redirects here with a `code`; we exchange it for a session, which the
 * server client writes into cookies. From there SSR and the browser agree on who
 * is signed in.
 *
 * Routes by ROLE CLAIM, not by a `next` parameter the caller controls — an
 * open redirect here would let a crafted link bounce a signed-in user anywhere.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const role = data.user?.app_metadata?.["role"] as string | undefined;

  // Signed in with no role claim → RLS denies everything. Send them back with an
  // explanation rather than into a surface that will look broken.
  if (!role || !isRole(role)) {
    return NextResponse.redirect(`${origin}/login?error=norole`);
  }

  return NextResponse.redirect(`${origin}${isClientRole(role) ? "/portal" : "/admin"}`);
}
