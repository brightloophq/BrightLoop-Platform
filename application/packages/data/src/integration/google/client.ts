/* =============================================================================
 * Google connectors — shared config + authenticated request client (F4.2).
 *
 * `callGoogle` is the one authenticated JSON call every operation goes through:
 * it attaches the Bearer access token, drives the transport, and normalizes the
 * response into a `ConnectorResult` using the pure error classifier. No secret,
 * token, or raw body ever leaks into an error. Server-only.
 * ========================================================================== */

import { connectorErr, connectorOk, type ConnectorResult } from "@brightloop/domain";
import { classifyGoogleError } from "./errors.js";
import type { GoogleHttpTransport } from "./transport.js";
import { GoogleTransportError } from "./transport.js";

/** App-level (not per-tenant) Google OAuth client config + injected transport/clock. */
export interface GoogleAdapterConfig {
  clientId: string;
  clientSecret: string;
  /** Default redirect URI when the caller does not supply one. */
  defaultRedirectUri: string;
  transport: GoogleHttpTransport;
  /** Injected clock (ISO) so token-expiry computation is testable. */
  now: () => string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 15_000;

export interface GoogleCallSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  query?: Record<string, string | number | boolean | undefined>;
  jsonBody?: unknown;
}

function withQuery(url: string, query?: GoogleCallSpec["query"]): string {
  if (!query) return url;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length > 0 ? `${url}?${parts.join("&")}` : url;
}

function parseJson(body: string): Record<string, unknown> {
  if (body.length === 0) return {};
  try {
    const v = JSON.parse(body);
    return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return {};
  }
}

/** An authenticated Google JSON call, normalized into a ConnectorResult. */
export async function callGoogle(cfg: GoogleAdapterConfig, accessToken: string | null, spec: GoogleCallSpec): Promise<ConnectorResult<Record<string, unknown>>> {
  if (accessToken === null || accessToken.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}`, accept: "application/json" };
  let body: string | undefined;
  if (spec.jsonBody !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(spec.jsonBody); }
  try {
    const res = await cfg.transport.request({ method: spec.method, url: withQuery(spec.url, spec.query), headers, body, timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    if (res.status >= 200 && res.status < 300) return connectorOk(parseJson(res.body));
    const c = classifyGoogleError(res.status, res.body);
    return connectorErr(c.category, `google request failed (${res.status})`, c.code);
  } catch (err) {
    if (err instanceof GoogleTransportError) return connectorErr(err.kind === "timeout" ? "timeout" : "network", "transport error", err.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}

/** A form-encoded token-endpoint call (no bearer). Used only by the OAuth flow. */
export async function callGoogleForm(cfg: GoogleAdapterConfig, url: string, form: Record<string, string>): Promise<ConnectorResult<Record<string, unknown>>> {
  const params: string[] = [];
  for (const [k, v] of Object.entries(form)) params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  try {
    const res = await cfg.transport.request({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: params.join("&"), timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    if (res.status >= 200 && res.status < 300) return connectorOk(parseJson(res.body));
    const c = classifyGoogleError(res.status, res.body);
    return connectorErr(c.category, `google token endpoint failed (${res.status})`, c.code);
  } catch (err) {
    if (err instanceof GoogleTransportError) return connectorErr(err.kind === "timeout" ? "timeout" : "network", "transport error", err.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}
