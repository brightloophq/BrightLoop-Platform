import "server-only";

/**
 * Cloudflare Turnstile verification (Decision M — the documented abuse surface on
 * the public signup endpoint).
 *
 * PROVIDER-BEHIND-ENV, like payments/email. When TURNSTILE_SECRET_KEY is unset
 * in dev / preview, verification is a NO-OP so local and staging signup work
 * without provisioning Turnstile. In real PRODUCTION an unset secret fails
 * CLOSED — the public signup uses the service-role client to create auth users
 * and tenant orgs, so it must never run without its bot gate; a misconfiguration
 * is safer rejected than scripted. When the secret IS set, a valid token is
 * REQUIRED and checked against Cloudflare in every environment.
 *
 * The matching public site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY) drives the widget
 * on the signup form; when it's absent the widget renders nothing.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnforced(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(token: string | null): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Production must never accept the public, service-role-backed signup without
    // the bot gate. Unset secret in prod = fail CLOSED; in dev / preview it stays
    // a no-op so signup works without provisioning Turnstile.
    if (process.env.VERCEL_ENV === "production") {
      return { ok: false, reason: "Sign-up is temporarily unavailable. Please try again shortly." };
    }
    return { ok: true }; // not enforced outside production
  }

  if (!token) return { ok: false, reason: "Please complete the anti-bot check." };

  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, reason: "Anti-bot check failed. Please try again." };
  } catch {
    // Fail CLOSED when the check is enforced but unreachable — better to ask the
    // user to retry than to wave a bot through.
    return { ok: false, reason: "Couldn't verify the anti-bot check. Please try again." };
  }
}
