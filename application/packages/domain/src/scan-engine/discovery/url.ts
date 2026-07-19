/* =============================================================================
 * URL normalization (PDF 27 §04) — PURE, no networking, no dependencies.
 *
 * A dependency-free WHATWG-ish URL parser (regex only — no `URL` global, no DNS,
 * no fetch): lower-cases scheme + host, strips a leading `www.`, drops the
 * default port and a trailing slash, and rejects invalid URLs / unsupported
 * schemes. Deterministic.
 * ========================================================================== */

import { normalizedUrlSchema, type NormalizedUrl } from "@brightloop/schema";

const SUPPORTED_SCHEMES = new Set(["http", "https"]);
const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443 };

// scheme://[userinfo@](host | [ipv6])[:port][path][?query][#frag]
const URL_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(?:([^@/?#]*)@)?(\[[^\]]+\]|[^:/?#]*)(?::(\d+))?([^?#]*)(\?[^#]*)?(#.*)?$/;

export interface ParsedUrl {
  scheme: string;
  userinfo: string;
  host: string;
  port: number | null;
  path: string;
  query: string;
  fragment: string;
}

/** Parse a URL string into parts. Returns null when it is not a valid absolute URL. */
export function parseUrl(input: string): ParsedUrl | null {
  const m = URL_RE.exec(input.trim());
  if (!m) return null;
  return {
    scheme: m[1]!.toLowerCase(),
    userinfo: m[2] ?? "",
    host: (m[3] ?? "").toLowerCase(),
    port: m[4] ? Number(m[4]) : null,
    path: m[5] ?? "",
    query: m[6] ?? "",
    fragment: m[7] ?? "",
  };
}

export function isSupportedScheme(scheme: string): boolean {
  return SUPPORTED_SCHEMES.has(scheme.replace(/:$/, "").toLowerCase());
}

/** Normalize a URL to canonical form. Never throws — invalid input → valid:false. */
export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  const reject = (reason: NormalizedUrl["reason"], scheme: string | null = null): NormalizedUrl =>
    normalizedUrlSchema.parse({ input, valid: false, normalized: null, scheme, host: null, port: null, pathname: null, canonicalRoot: null, reason });

  if (trimmed.length === 0) return reject("empty");
  const p = parseUrl(trimmed);
  if (!p) return reject("invalid_url");
  if (!SUPPORTED_SCHEMES.has(p.scheme)) return reject("unsupported_scheme", p.scheme);

  const host = p.host.replace(/^www\./, "");
  const port = p.port === null || p.port === DEFAULT_PORTS[p.scheme] ? null : p.port;
  const hostPort = port === null ? host : `${host}:${port}`;
  const rawPath = p.path === "" ? "/" : p.path;
  const pathname = rawPath !== "/" && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
  const canonicalRoot = `${p.scheme}://${hostPort}`;
  const normalized = `${canonicalRoot}${pathname === "/" ? "" : pathname}${p.query}`;

  return normalizedUrlSchema.parse({ input, valid: true, normalized, scheme: p.scheme, host, port, pathname, canonicalRoot, reason: null });
}

export function canonicalRoot(input: string): string | null {
  return normalizeUrl(input).canonicalRoot;
}

/** De-duplicate URLs by their normalized form, preserving first order. */
export function dedupeUrls(urls: string[]): { unique: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicates: string[] = [];
  for (const raw of urls) {
    const n = normalizeUrl(raw);
    if (!n.valid || n.normalized === null) continue;
    if (seen.has(n.normalized)) duplicates.push(raw);
    else {
      seen.add(n.normalized);
      unique.push(n.normalized);
    }
  }
  return { unique, duplicates };
}

/** True when two URLs normalize to the same canonical form. */
export function sameNormalized(a: string, b: string): boolean {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  return na.valid && nb.valid && na.normalized === nb.normalized;
}
