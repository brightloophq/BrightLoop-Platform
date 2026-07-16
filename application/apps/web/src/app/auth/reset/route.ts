import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Password-recovery landing (Step 3–4).
 *
 * The reset email links here with a PKCE `code`. We exchange it server-side for a
 * recovery session (written to cookies), then send the user to the update-password
 * form. We do NOT route by role — a recovery link's only job is to let the user
 * set a new password.
 *
 * Expired or already-used links have no valid code → we bounce to login with a
 * clear error instead of a broken form.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=recovery_expired`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=recovery_invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=recovery_expired`);
  }

  return NextResponse.redirect(`${origin}/reset-password`);
}
