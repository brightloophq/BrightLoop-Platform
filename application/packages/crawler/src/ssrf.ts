/* =============================================================================
 * Fetch-time SSRF guard (Phase C · Sprint C3 §2) — string + DNS, layered.
 *
 * Every request the crawler makes — the initial URL AND every redirect target —
 * passes through `guardFetchUrl` first. It layers two checks:
 *   1. Phase-A `evaluateSsrf` (pure): scheme, credentials, literal-IP, localhost.
 *   2. Resolved-IP classification (this package): DNS-resolve the host and reject
 *      if any address is private/reserved.
 * Fail-closed: an unparseable URL or an unresolvable host is never fetched.
 * ========================================================================== */

import { evaluateSsrf, parseUrl } from "@brightloop/domain";
import type { DnsResolver } from "./dns.js";
import { guardResolvedHost } from "./dns.js";

export interface FetchGuardVerdict {
  allowed: boolean;
  /** Combined reasons from both layers (string reasons + `dns:<reason>`). */
  reasons: string[];
  addresses: string[];
}

/**
 * Guard a URL for fetching. Runs the pure SSRF check first (cheap, no I/O); only
 * if that passes does it resolve DNS and classify the addresses.
 */
export async function guardFetchUrl(url: string, resolver: DnsResolver): Promise<FetchGuardVerdict> {
  const stringVerdict = evaluateSsrf(url);
  if (!stringVerdict.allowed) {
    return { allowed: false, reasons: stringVerdict.reasons, addresses: [] };
  }

  const parsed = parseUrl(url);
  if (parsed === null || parsed.host === "") {
    return { allowed: false, reasons: ["invalid_url"], addresses: [] };
  }
  // Strip brackets from an IPv6 literal host for resolution.
  const host = parsed.host.replace(/^\[|\]$/g, "");

  const resolved = await guardResolvedHost(host, resolver);
  if (!resolved.allowed) {
    return { allowed: false, reasons: resolved.reasons.map((r) => `dns:${r}`), addresses: resolved.addresses };
  }
  return { allowed: true, reasons: [], addresses: resolved.addresses };
}
