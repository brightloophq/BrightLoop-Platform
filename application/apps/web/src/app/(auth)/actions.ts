"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic on purpose (handoff §09.2): never reveal WHICH field was wrong,
    // or an attacker can enumerate valid accounts.
    return { error: "Email or password is incorrect" };
  }

  const role = data.user?.app_metadata?.["role"] as string | undefined;
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
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback` },
  });

  if (error) return { error: "Could not send the link. Try again." };

  // Do NOT reveal whether the address has an account — same enumeration concern.
  return { notice: `If an account exists for ${email}, a sign-in link is on its way.` };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
