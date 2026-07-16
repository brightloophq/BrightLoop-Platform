"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isClientRole, isRole } from "@brightloop/schema";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteUrl } from "@/lib/site-url";
import { emitEvent } from "@/lib/analytics";

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
 * The base URL for auth redirect links (magic link + password recovery).
 *
 * Reads the request's origin from headers and hands it to resolveSiteUrl, which
 * honours it ONLY if allow-listed (localhost in dev, the production URL in prod)
 * and otherwise falls back to the validated NEXT_PUBLIC_SITE_URL, then a safe
 * production default. A spoofed Origin/Host header can never point an email at an
 * unapproved host, and a production email can never redirect to localhost.
 */
async function redirectBase(): Promise<string> {
  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host")
      ? `${h.get("x-forwarded-proto") ?? (h.get("host")!.startsWith("localhost") ? "http" : "https")}://${h.get("host")}`
      : null);
  return resolveSiteUrl(origin);
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
    options: { emailRedirectTo: `${await redirectBase()}/auth/callback` },
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

/**
 * Step 1–2 of recovery: email a password-reset link.
 *
 * The link returns to `${redirectBase()}/auth/reset` (production in prod, never
 * localhost). We never reveal whether the address has an account — same
 * enumeration concern as the magic link.
 */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Enter your email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await redirectBase()}/auth/reset`,
  });

  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return {
        error:
          "Email rate limit reached — Supabase's built-in mailer only sends 2 emails per hour. Please wait about an hour and try again.",
      };
    }
    // Don't leak provider errors that could confirm an account exists.
    return { notice: `If an account exists for ${email}, a reset link is on its way.` };
  }

  return { notice: `If an account exists for ${email}, a reset link is on its way.` };
}

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[0-9]).{8,}$/i;

/**
 * Step 5–7 of recovery: set a new password using the recovery session, then sign
 * out and route to login. Requires a valid recovery session (established by the
 * /auth/reset route's code exchange) — updateUser fails without one, which is how
 * expired/reused links are handled.
 *
 * This ONLY changes the password. It never touches role/app_metadata, so the
 * account's authorization is unchanged — the custom access token hook re-derives
 * the role from the users table at the next sign-in.
 */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) return { error: "Enter and confirm your new password" };
  if (password !== confirm) return { error: "The two passwords don't match" };
  if (!PASSWORD_RULE.test(password)) {
    return { error: "Password must be at least 8 characters with a letter and a number" };
  }

  const supabase = await createClient();

  // A recovery session must exist (from the /auth/reset code exchange). If the
  // link was expired or already used, there is none → clear, honest error.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return {
      error: "Your reset link has expired or was already used. Request a new one from Forgot password.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `Couldn't update your password: ${error.message}` };
  }

  // Audit-log the recovery (non-PII: actor id + source), best-effort.
  try {
    const sub = (claimsData.claims as Record<string, unknown>)["sub"];
    await emitEvent({ name: "auth.password_recovered", actorId: typeof sub === "string" ? sub : null, source: "server" });
  } catch {
    /* auth must not fail because analytics did */
  }

  // Sign out so the recovery session can't linger; the user re-authenticates with
  // their new password.
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?notice=password_updated");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
