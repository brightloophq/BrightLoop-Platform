/* =============================================================================
 * Safe page fetcher (Phase C · Sprint C3 §5) — redirects + limits, SSRF-checked.
 *
 * Drives a single page's fetch: it re-runs the SSRF guard on the initial URL AND
 * on EVERY redirect target, caps the redirect count, enforces the content-type
 * allowlist and the byte cap, and classifies transport failures. It never sends
 * cookies or credentials and never follows a redirect to a private/reserved host.
 *
 * The transport does one hop; this module owns the chain and the policy.
 * ========================================================================== */

import type { CrawlerConfig } from "./config.js";
import type { DnsResolver } from "./dns.js";
import { guardFetchUrl } from "./ssrf.js";
import type { HttpTransport } from "./transport.js";

export type PageFetchOutcome = "ok" | "excluded" | "failed";

export interface PageFetch {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  contentType: string | null;
  bytes: number;
  durationMs: number;
  redirects: number;
  truncated: boolean;
  lastModified: string | null;
  /** Decoded HTML on a successful text/html 2xx; null otherwise. */
  body: string | null;
  outcome: PageFetchOutcome;
  /** Exclusion/failure reason (content_type / too_large / status:<n> / redirect_limit / ssrf:* / timeout / dns / tls / connect). */
  reason: string | null;
}

export interface FetchDeps {
  transport: HttpTransport;
  resolver: DnsResolver;
  config: CrawlerConfig;
}

/** Accepted page content types (no JS execution, so HTML/XHTML only). */
export function isHtmlContentType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const base = contentType.split(";")[0]!.trim().toLowerCase();
  return base === "text/html" || base === "application/xhtml+xml";
}

function resolveRedirect(location: string, base: string): string | null {
  try {
    return new URL(location, base).toString();
  } catch {
    return null;
  }
}

/** Fetch one page, following (and re-checking) redirects up to the configured cap. */
export async function fetchPage(initialUrl: string, deps: FetchDeps): Promise<PageFetch> {
  const base: Omit<PageFetch, "outcome" | "reason"> = {
    requestedUrl: initialUrl,
    finalUrl: initialUrl,
    status: null,
    contentType: null,
    bytes: 0,
    durationMs: 0,
    redirects: 0,
    truncated: false,
    lastModified: null,
    body: null,
  };

  let currentUrl = initialUrl;
  let redirects = 0;
  let totalDuration = 0;

  for (;;) {
    const guard = await guardFetchUrl(currentUrl, deps.resolver);
    if (!guard.allowed) {
      return { ...base, finalUrl: currentUrl, redirects, durationMs: totalDuration, outcome: "failed", reason: `ssrf:${guard.reasons.join(",")}` };
    }

    const result = await deps.transport.fetch({
      url: currentUrl,
      headers: { "user-agent": deps.config.userAgent, accept: "text/html,application/xhtml+xml" },
      timeoutMs: deps.config.timeoutMs,
      maxBytes: deps.config.maxResponseBytes,
    });

    if (!result.ok) {
      return { ...base, finalUrl: currentUrl, redirects, durationMs: totalDuration, outcome: "failed", reason: result.error.kind };
    }
    const res = result.response;
    totalDuration += res.durationMs;

    // Redirect: bounded, and every target re-guarded on the next iteration.
    if (res.status >= 300 && res.status < 400 && res.redirectLocation !== null) {
      if (redirects >= deps.config.maxRedirects) {
        return { ...base, finalUrl: currentUrl, status: res.status, redirects, durationMs: totalDuration, outcome: "failed", reason: "redirect_limit" };
      }
      const next = resolveRedirect(res.redirectLocation, currentUrl);
      if (next === null) {
        return { ...base, finalUrl: currentUrl, status: res.status, redirects, durationMs: totalDuration, outcome: "failed", reason: "invalid_redirect" };
      }
      redirects += 1;
      currentUrl = next;
      continue;
    }

    const common = {
      ...base,
      finalUrl: currentUrl,
      status: res.status,
      contentType: res.contentType,
      bytes: res.bytes,
      durationMs: totalDuration,
      redirects,
      truncated: res.truncated,
      lastModified: res.headers["last-modified"] ?? null,
    };

    if (res.status < 200 || res.status >= 300) {
      return { ...common, outcome: "failed", reason: `status:${res.status}` };
    }
    if (!isHtmlContentType(res.contentType)) {
      return { ...common, outcome: "excluded", reason: "content_type" };
    }
    return { ...common, body: res.body, outcome: "ok", reason: res.truncated ? "truncated" : null };
  }
}
