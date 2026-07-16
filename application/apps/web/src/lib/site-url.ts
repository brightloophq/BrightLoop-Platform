/**
 * The base URL for Supabase auth redirect links (magic link + password recovery).
 *
 * ONE place builds redirect URLs — never hardcoded across files. Resolution order:
 *   1. The request's OWN origin, but ONLY if it is allow-listed (this makes
 *      localhost dev and production both work with no env var to remember, while
 *      a spoofed Origin/Host header can never redirect an email to an unapproved
 *      host).
 *   2. The validated `NEXT_PUBLIC_SITE_URL` env var (must be a well-formed URL).
 *   3. A fail-safe, allow-listed production fallback.
 *
 * Supabase's own redirect allow-list is the second line of defence; this is the
 * first. No production magic link or recovery email can point at localhost.
 */

/** Production fallback — used when nothing trustworthy is available. */
const FALLBACK_SITE_URL = "https://bright-loop-platform.vercel.app";
/** Local development origin (kept working per requirements). */
const DEV_ORIGIN = "http://localhost:3000";

const stripTrailingSlash = (u: string) => u.replace(/\/+$/, "");

/** The configured production URL, if it is a well-formed http(s) URL. */
function configuredSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return stripTrailingSlash(url.origin);
  } catch {
    return null;
  }
}

/** Origins we trust as redirect targets: the configured prod URL, the hard
 *  fallback, and localhost for development. */
function allowList(): Set<string> {
  return new Set([configuredSiteUrl() ?? FALLBACK_SITE_URL, FALLBACK_SITE_URL, DEV_ORIGIN]);
}

/**
 * Resolve the base origin for an auth redirect. Pass the request's origin (from
 * headers) — it is honoured only if allow-listed; otherwise we fall back to the
 * validated env var, then the production fallback. Never returns an untrusted
 * origin, so it fails safe.
 */
export function resolveSiteUrl(requestOrigin?: string | null): string {
  const origin = requestOrigin ? stripTrailingSlash(requestOrigin) : null;
  if (origin && allowList().has(origin)) return origin;
  return configuredSiteUrl() ?? FALLBACK_SITE_URL;
}
