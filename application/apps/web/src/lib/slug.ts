/**
 * Slug helpers.
 *
 * Lives outside the "use server" action file on purpose: Next only permits async
 * function exports from a server-action module, so a plain sync helper there is a
 * build error. Both the server action and the client form need this, so it sits
 * in shared lib.
 */

/** kebab-case slug from a name (handoff §09.2: auto-suggest from name). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    // strip combining diacritics so "Café" → "cafe", not "caf"
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Matches the DB CHECK constraint `portfolio_projects_slug_kebab`. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}
