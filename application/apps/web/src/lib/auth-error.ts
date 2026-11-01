/* =============================================================================
 * Sign-in errors — say "wrong password" ONLY when it was the password.
 *
 * `signInWithPassword` collapsed every failure into one message: "Email or
 * password is incorrect". That wording exists for a good reason — never reveal
 * WHICH field was wrong, or an attacker can enumerate valid accounts (§09.2) —
 * but it was applied to errors that have nothing to do with credentials. A rate
 * limit, a gateway timeout and an unreachable database were all reported to the
 * owner as a bad password, sending them to reset a password that was fine.
 *
 * Enumeration is the only thing that message protects, and a 429 or a 503 leaks
 * nothing either way: the response is identical whether or not the account
 * exists. So those are reported accurately, and the generic wording is kept for
 * exactly the case it was written for.
 *
 * Pure and unit-tested.
 * ========================================================================== */

export interface SignInError {
  message: string;
  /** Supabase returns an HTTP status on AuthError. */
  status?: number;
  /** Supabase's stable machine code, when present. */
  code?: string;
}

/**
 * The one message for any genuine credential failure.
 *
 * The second sentence is shown for EVERY credential failure — a wrong password
 * on a real account and a sign-in attempt for an address with no account alike —
 * so it confirms nothing about whether the account exists. It is there because
 * an unconfirmed account otherwise fails forever behind "incorrect password",
 * with nothing to suggest what to look at.
 */
export const GENERIC_CREDENTIAL_ERROR =
  "Email or password is incorrect. If the account is new, check whether it still needs confirming from its invitation email.";

function says(message: string, ...needles: string[]): boolean {
  const haystack = message.toLowerCase();
  return needles.some((n) => haystack.includes(n));
}

/**
 * What to show the person trying to sign in.
 *
 * Order matters: rate limiting is checked before anything else because Supabase
 * returns it for repeated attempts — including repeated CORRECT ones — and
 * telling someone their password is wrong at that moment is how a lockout turns
 * into a password reset that was never needed.
 */
export function explainSignInError(error: SignInError): string {
  const { message, status, code } = error;

  if (status === 429 || code === "over_request_rate_limit" || says(message, "rate limit", "too many requests")) {
    return "Too many sign-in attempts. Supabase pauses sign-in for a few minutes after repeated tries — wait, then try again. Your password has not changed.";
  }

  if (
    (typeof status === "number" && status >= 500) ||
    says(message, "gateway timeout", "timed out", "timeout", "service unavailable", "bad gateway")
  ) {
    return "Sign-in couldn't reach the database — it did not respond in time. This is not your password. Check the project's health in the Supabase dashboard and try again in a moment.";
  }

  if (says(message, "fetch failed", "network", "econnrefused", "enotfound", "socket hang up")) {
    return "Sign-in couldn't reach the database at all. This is not your password. Check that the project is running and that this deployment's Supabase URL and key are set.";
  }

  // Everything else — wrong password, unknown address, unconfirmed account — is
  // deliberately indistinguishable.
  return GENERIC_CREDENTIAL_ERROR;
}
