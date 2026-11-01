/* =============================================================================
 * Recognising a database that is behind the code.
 *
 * Migrations in this repo are applied BY HAND (`supabase db push` — see
 * packages/db/README.md). Nothing in CI pushes them, because CI holds no
 * production credentials. So a deploy can carry code that reads a column the
 * live database does not have yet, and the read fails at request time rather
 * than at build time.
 *
 * That happened: `scan_findings.source` shipped with the app before the
 * migration reached the database, and the Business Scan page — whose findings
 * read was unguarded — stopped loading entirely. The operator saw a dead page
 * and had no way to know a `db push` was all it needed.
 *
 * This turns that class of failure into a sentence someone can act on. It does
 * not paper over the error: the underlying message is always shown too.
 * ========================================================================== */

/**
 * Postgres / PostgREST ways of saying "that does not exist here".
 *
 * Matched on the message rather than the SQLSTATE because the adapters wrap
 * errors as `core-surfaces.<op> failed: <message>` and the code is lost by the
 * time a page sees it. Deliberately narrow — a false positive would tell
 * someone to run a migration that is not the problem.
 */
const MISSING = [
  /column\s+\S+\s+does not exist/i,
  /could not find the '[^']+' column/i,
  /could not find the (?:function|table)\s/i,
  /relation\s+"[^"]+"\s+does not exist/i,
  /type\s+"[^"]+"\s+does not exist/i,
  /function\s+\S+\s+does not exist/i,
];

export function looksLikeSchemaDrift(message: string): boolean {
  return MISSING.some((re) => re.test(message));
}

/** The message for an operator, or null when this is not a schema problem. */
export function schemaDriftHint(message: string): string | null {
  if (!looksLikeSchemaDrift(message)) return null;
  return "This looks like the database being behind the deployed code — a migration in the repository has not been applied yet. Run `supabase db push` against the linked project (see packages/db/README.md), then reload.";
}

/** The readable text of a thrown value, for a message we are about to show. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}
