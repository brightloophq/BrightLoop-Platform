/* =============================================================================
 * Recognising a page that outlived the build it came from.
 *
 * Next.js gives every Server Action an id derived from the build. The id lives
 * in the client bundle; the server only knows the ids of the build it is
 * currently running. Deploy while someone has an admin page open and their tab
 * keeps calling an id that no longer exists, so the action 404s with:
 *
 *   Server Action "40e24abf…" was not found on the server.
 *
 * Nothing is broken and nothing was lost — the tab is simply older than the
 * server. Reloading fixes it completely.
 *
 * That message is written for whoever deployed the app, not for the person
 * holding the mouse, and our handlers showed it verbatim: an admin trying to
 * upload a photograph was told about a hash and sent to nextjs.org. This turns
 * it into the one sentence that actually resolves it.
 * ========================================================================== */

/**
 * Next's own wording for a missing action id.
 *
 * Deliberately narrow, and matched on both halves. "Was not found on the
 * server" alone would also catch a genuine 404 from something else, and telling
 * someone to reload when reloading will not help is worse than saying nothing.
 */
const STALE_ACTION = /server action\b[\s\S]*\bwas not found on the server/i;

export function looksLikeStaleDeployment(message: string): boolean {
  return STALE_ACTION.test(message);
}

/**
 * What to show instead, or null when this is not a stale-build problem.
 *
 * It says nothing was lost on purpose. The instinct on seeing an error mid-form
 * is that the work is gone, and here it is still sitting in the page.
 */
export function staleDeploymentHint(message: string): string | null {
  if (!looksLikeStaleDeployment(message)) return null;
  return "This page was loaded before the site was last updated, so it is out of date. Reload the page and try again — nothing you have typed here has been saved or lost yet.";
}

/** The message to show a person for a thrown value, stale build or not. */
export function actionErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return staleDeploymentHint(raw) ?? (raw || fallback);
}
