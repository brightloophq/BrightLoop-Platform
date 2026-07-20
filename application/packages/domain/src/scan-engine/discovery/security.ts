/* =============================================================================
 * SSRF security contracts (PDF 27 §16) — PURE, no networking, no dependencies.
 *
 * Evaluates a URL against SSRF rules by STRING/REGEX inspection only — never a
 * DNS resolution or a socket. Flags loopback / localhost / RFC1918 private /
 * link-local / unspecified addresses, embedded credentials, and non-http(s)
 * schemes (file://, ftp://, …). Returns a structured verdict. Deterministic.
 *
 * NOTE: a hostname that RESOLVES to a private IP cannot be caught here without
 * DNS — that check belongs to the crawler adapter at fetch time. This layer
 * blocks literal-IP and scheme-based SSRF up front.
 * ========================================================================== */

import { ssrfVerdictSchema, type SsrfVerdict, type SsrfReason } from "@brightloop/schema";
import { parseUrl } from "./url.js";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Reasons(host: string): SsrfReason[] {
  const m = IPV4.exec(host);
  if (!m) return [];
  const a = Number(m[1]);
  const b = Number(m[2]);
  const reasons: SsrfReason[] = [];
  if (a === 127) reasons.push("loopback");
  if (a === 0) reasons.push("unspecified_address");
  if (a === 10) reasons.push("private_rfc1918");
  if (a === 172 && b >= 16 && b <= 31) reasons.push("private_rfc1918");
  if (a === 192 && b === 168) reasons.push("private_rfc1918");
  if (a === 169 && b === 254) reasons.push("link_local");
  return reasons;
}

/** Evaluate a raw URL for SSRF risk. `allowed` is false when any reason fires. */
export function evaluateSsrf(input: string): SsrfVerdict {
  const p = parseUrl(input);
  if (!p) return ssrfVerdictSchema.parse({ url: input, allowed: false, reasons: ["unsupported_scheme"] });

  const reasons: SsrfReason[] = [];
  if (p.scheme === "file") reasons.push("file_scheme");
  else if (p.scheme === "ftp") reasons.push("ftp_scheme");
  else if (p.scheme !== "http" && p.scheme !== "https") reasons.push("unsupported_scheme");

  const host = p.host;
  if (host === "localhost" || host.endsWith(".localhost")) reasons.push("localhost");
  if (host === "::1" || host === "[::1]") reasons.push("loopback");
  reasons.push(...ipv4Reasons(host));
  if (p.userinfo !== "") reasons.push("credentials_in_url");

  const unique = [...new Set(reasons)];
  return ssrfVerdictSchema.parse({ url: input, allowed: unique.length === 0, reasons: unique });
}

export function isSsrfSafe(input: string): boolean {
  return evaluateSsrf(input).allowed;
}
