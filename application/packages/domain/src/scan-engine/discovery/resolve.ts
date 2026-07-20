/* =============================================================================
 * Domain resolution (PDF 27 §04) — PURE, no DNS.
 *
 * Splits a host into apex / subdomain / path root / tenant scope by string
 * inspection only — never a DNS lookup. Apex is a NAIVE eTLD+1 (last two labels);
 * multi-part public suffixes (e.g. co.uk) are a documented limitation until a
 * public-suffix list is introduced. Deterministic.
 * ========================================================================== */

import { domainScopeSchema, type DomainScope } from "@brightloop/schema";
import { normalizeUrl } from "./url.js";

/** Naive apex: the last two dot-labels of a host (documented PSL limitation). */
export function apexOf(host: string): string {
  const labels = host.split(".").filter(Boolean);
  return labels.length <= 2 ? host : labels.slice(-2).join(".");
}

/** Resolve a URL's host into scope parts. Returns null for an invalid URL. */
export function resolveDomain(input: string): DomainScope | null {
  const n = normalizeUrl(input);
  if (!n.valid || n.host === null) return null;
  const host = n.host;
  const apex = apexOf(host);
  const subdomain = host === apex ? null : host.slice(0, host.length - apex.length - 1); // strip ".apex"
  const segments = (n.pathname ?? "/").split("/").filter(Boolean);
  const pathRoot = segments.length > 0 ? `/${segments[0]}` : "/";
  return domainScopeSchema.parse({
    host,
    apex,
    subdomain,
    pathRoot,
    tenantScope: subdomain && subdomain !== "www" ? subdomain : null,
  });
}
