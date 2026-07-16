"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isClientRole, isRole } from "@brightloop/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth server actions (approved Decision C: email/password + magic link at V1;
 * Google/Microsoft/SSO deferred to V2 — deliberately no provider buttons).
 *
 * Sessions are cookie-based and shared with the server client, so SSR and the
 * browser agree on who is signed in.
 */

export interface AuthState {
  error?: string;
  notice?: string;
}

/** Where to send a user after sign-in, based on their role claim. */
function homeForRole(role: string | undefined): string {
  if (!role || !isRole(role)) return "/login?error=norole";
  return isClientRole(role) ? "/portal" : "/admin";
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic on purpose (handoff §09.2): never reveal WHICH field was wrong,
    // or an attacker can enumerate valid accounts.
    return { error: "Email or password is incorrect" };
  }

  // Read the role from the JWT CLAIMS, not from `data.user`. The user record's
  // app_metadata is only {provider, providers} — the custom access token hook
  // injects role/client_id into the TOKEN. Reading the record made this branch
  // fire for a perfectly good owner session while RLS was granting them access.
  const { data: claimsData } = await supabase.auth.getClaims();
  const appMetadata = (claimsData?.claims as Record<string, unknown> | undefined)?.["app_metadata"];
  const role =
    typeof appMetadata === "object" && appMetadata !== null
      ? ((appMetadata as Record<string, unknown>)["role"] as string | undefined)
      : undefined;

  if (!role) {
    // Signed in, but no role claim. Either the account has no `users` row, or
    // the custom_access_token_hook is not registered in the Supabase dashboard.
    // Say so plainly — RLS will deny everything and the app will look broken.
    return {
      error:
        "Signed in, but this account has no role. Either it has no user record, or the custom access token hook is not registered in Supabase.",
    };
  }

  revalidatePath("/", "layout");
  redirect(homeForRole(role));
}

/**
 * The origin this request actually arrived on.
 *
 * Derived from headers rather than an env var: NEXT_PUBLIC_SITE_URL was unset,
 * which made emailRedirectTo a RELATIVE "/auth/callback". Supabase rejects that
 * and silently falls back to the project's site_url — so the magic link landed
 * on "/" with an unhandled ?code=, and clicking it appeared to do nothing.
 *
 * Reading the origin means the link always returns to whichever host you signed
 * in from (localhost in dev, the real host in production) with no env to forget.
 * Supabase still validates the result against its redirect allow-list, so this
 * cannot be used to redirect somewhere unapproved.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Enter a valid email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await requestOrigin()}/auth/callback` },
  });

  if (error) {
    // Distinguish rate limiting. Supabase's BUILT-IN mailer allows only 2 emails
    // per hour, and "Try again" is actively wrong advice for a 429 — retrying
    // fails and the user has no idea why. Tell them what actually happened and
    // what to do instead.
    //
    // This is a dev-mailer constraint, not a bug: Supabase does not intend the
    // built-in SMTP for production. Configuring a real provider (Resend/Postmark)
    // is the Sprint 8 email-integration work and removes this ceiling.
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return {
        error:
          "Email rate limit reached — Supabase's built-in mailer only sends 2 emails per hour. Wait about an hour, or sign in with a password instead.",
      };
    }
    return { error: `Could not send the link: ${error.message}` };
  }

  // Do NOT reveal whether the address has an account — same enumeration concern.
  return { notice: `If an account exists for ${email}, a sign-in link is on its way.` };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
