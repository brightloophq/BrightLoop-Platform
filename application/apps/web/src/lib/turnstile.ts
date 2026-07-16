import "server-only";

/**
 * Cloudflare Turnstile verification (Decision M — the documented abuse surface on
 * the public signup endpoint).
 *
 * PROVIDER-BEHIND-ENV, like payments/email. When TURNSTILE_SECRET_KEY is unset
 * (dev / controlled launch), verification is a NO-OP and signup proceeds — the
 * gate does not block a launch that hasn't provisioned Turnstile yet. When the
 * secret IS set, a valid token is REQUIRED and checked against Cloudflare, so a
 * public opening cannot be scripted for mass account creation.
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
  if (!secret) return { ok: true }; // not enforced

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
