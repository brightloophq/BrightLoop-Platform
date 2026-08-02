/* =============================================================================
 * Integration Platform — OAuth abstraction (F4.1). PURE.
 *
 * The domain owns the vendor-neutral parts of an OAuth2 flow: minting + verifying
 * the CSRF state token, normalizing scopes, and expiry math. The actual
 * authorization-URL construction, code exchange, and cryptographic PKCE challenge
 * belong to the adapter (which may use node:crypto in the data layer). This module
 * is Node-free: no `crypto`, no `URL`, no clock — `now` is passed in.
 * ========================================================================== */

/**
 * Compose an opaque, deterministic state token from the grant's natural identity.
 * The `nonce` is supplied by the caller (never generated here) so this stays pure
 * and testable; the caller sources it from a request-scoped id generator.
 */
export function buildOAuthState(connectorInstallationId: string, nonce: string): string {
  return `st_${connectorInstallationId}_${nonce}`;
}

/** Verify a returned state token matches the one bound to the grant. Constant work. */
export function verifyOAuthState(expected: string, returned: string): boolean {
  if (expected.length === 0 || returned.length === 0) return false;
  return expected === returned;
}

/** Normalize + dedupe a scope list deterministically (sorted, trimmed, unique). */
export function normalizeScopes(scopes: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const s of scopes) {
    const t = s.trim();
    if (t.length > 0) seen.add(t);
  }
  return Array.from(seen).sort();
}

/** Whether an ISO expiry has passed relative to `now` (both ISO strings). */
export function isTokenExpired(expiresAt: string | null, now: string): boolean {
  if (expiresAt === null) return false;
  const exp = Date.parse(expiresAt);
  const cur = Date.parse(now);
  if (Number.isNaN(exp) || Number.isNaN(cur)) return false;
  return cur >= exp;
}

/** Whether the granted scopes cover every requested scope. */
export function scopesSatisfied(requested: readonly string[], granted: readonly string[]): boolean {
  const have = new Set(granted);
  return requested.every((s) => have.has(s));
}
