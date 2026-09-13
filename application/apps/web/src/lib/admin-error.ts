/* =============================================================================
 * Admin load errors — say what actually went wrong.
 *
 * The CMS pages used to append one fixed sentence to every failure: "If this
 * says permission denied, the custom access token hook may not be registered."
 * Useful for exactly one class of error, and actively misleading for the rest —
 * a Gateway Timeout was presented to the owner alongside a theory about JWT
 * roles, sending them to look at auth configuration when the database simply
 * had not answered.
 *
 * Pure and unit-tested. The mapping is deliberately conservative: when nothing
 * matches, say nothing extra rather than guess.
 * ========================================================================== */

export interface AdminLoadError {
  message: string;
  /** PostgREST / Postgres code when one is present. */
  code?: string;
}

/** Postgres `insufficient_privilege` — what a failed RLS check surfaces as. */
const PERMISSION_CODES = new Set(["42501"]);
/** Postgres `query_canceled`, i.e. the statement timeout fired. */
const TIMEOUT_CODES = new Set(["57014"]);
/** PostgREST's expired/invalid JWT codes. */
const AUTH_CODES = new Set(["PGRST301", "PGRST302"]);

function says(message: string, ...needles: string[]): boolean {
  const haystack = message.toLowerCase();
  return needles.some((n) => haystack.includes(n));
}

/**
 * The sentence to show after the raw error, or undefined when we have nothing
 * honest to add.
 *
 * Order matters: a permissions failure is checked before a timeout, because
 * "permission denied" is the specific, actionable one and its wording is
 * unambiguous. Everything unrecognised falls through to undefined — an owner is
 * better served by the raw message alone than by a confident wrong theory.
 */
export function explainAdminLoadError(error: AdminLoadError): string | undefined {
  const { message, code } = error;

  if (
    (code && PERMISSION_CODES.has(code)) ||
    says(message, "permission denied", "row-level security", "violates row level security")
  ) {
    return "That is a permissions refusal. The most likely cause is the custom access token hook not being registered — your sign-in would carry no role, and every policy denies by default.";
  }

  if (
    (code && AUTH_CODES.has(code)) ||
    says(message, "jwt expired", "invalid jwt", "token is expired")
  ) {
    return "Your session has expired. Sign out and back in.";
  }

  if (
    (code && TIMEOUT_CODES.has(code)) ||
    says(message, "gateway timeout", "timeout", "timed out", "504", "canceling statement")
  ) {
    return "The database did not answer in time. This is not a permissions problem. Check the project's health in the Supabase dashboard — a paused project wakes on its first request, so refreshing shortly often clears it.";
  }

  if (says(message, "fetch failed", "network", "econnrefused", "enotfound", "socket hang up")) {
    return "The database could not be reached at all. Check that the project is running and that this deployment's Supabase URL and key are set.";
  }

  return undefined;
}
