/**
 * Revalidation policy for public, database-backed pages.
 *
 * WHY THIS EXISTS
 *   Public marketing pages are statically rendered for SEO and speed (handoff
 *   §11.3). But static means "captured at build time" — and the reputation
 *   content behind them now lives in a database that the Reputation CMS edits.
 *   Without revalidation, publishing a case study would never appear on the site:
 *   the homepage, sitemap and case-study pages would serve whatever the database
 *   held at the last deploy, forever. Next also caches on-demand results,
 *   including 404s — so a slug requested before it was published stays 404 even
 *   after it goes live.
 *
 * THE POLICY
 *   Time-based ISR at `PUBLIC_REVALIDATE_SECONDS`. Pages stay static and cached,
 *   but re-render at most this often, so published content appears within one
 *   window without a deploy.
 *
 * WHAT THIS IS NOT
 *   Handoff §11.3 asks for "revalidation ON PUBLISH" — on-demand
 *   `revalidatePath()` / `revalidateTag()` fired by the CMS the moment publish
 *   status changes. That is the correct end state and belongs with the CMS's
 *   publish action, because only the CMS knows when a publish happened. Until
 *   then this window is the honest interim: content is never permanently stale,
 *   but it is not instant either.
 */

/**
 * 5 minutes. Short enough that a publish shows up promptly, long enough to cache.
 *
 * ⚠️ This constant CANNOT be imported into `export const revalidate` — Next.js
 * requires route segment config to be statically analysable, so it must be a
 * literal in each page:
 *
 *     export const revalidate = 300; // 5 min — see lib/revalidate.ts
 *
 * Importing it fails the build with "Next.js can't recognize the exported
 * `config` field". This file is therefore the documented POLICY; the literals
 * are its copies. If you change the window, grep for `export const revalidate`.
 */
export const PUBLIC_REVALIDATE_SECONDS = 300;
