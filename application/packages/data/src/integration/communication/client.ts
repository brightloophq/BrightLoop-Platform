/* =============================================================================
 * Communication connectors — shared config, provider binding, request client (F4.3).
 *
 * The generic engine: `callProvider` attaches the right auth header (Bearer for
 * OAuth providers, `Bot` for Discord), drives the transport, and normalizes the
 * response into a `ConnectorResult` using the binding's classifier. A
 * `CommProviderBinding` is the ONLY provider-specific surface — Slack/Teams/Discord
 * are data-driven bindings over this one engine. No secret/token/body leaks into an
 * error. Server-only.
 * ========================================================================== */

import { connectorErr, connectorOk, type ConnectorResult, type OperationOutput, type PollResult } from "@brightloop/domain";
import type { CommErrorClass } from "./errors.js";
import type { CommHttpTransport } from "./transport.js";
import { CommTransportError } from "./transport.js";
import type { OpInput } from "./helpers.js";

/** Shared, non-provider config injected at the composition root. */
export interface CommConfig {
  transport: CommHttpTransport;
  /** Injected clock (ISO) so token-expiry computation is testable. */
  now: () => string;
  /** Default OAuth redirect URI when the caller supplies none. */
  defaultRedirectUri: string;
  timeoutMs?: number;
}

/** App-level OAuth client credentials for one provider (never per-tenant). */
export interface ProviderCreds { clientId: string; clientSecret: string }

export interface CommOAuthEndpoints {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  /** Space-joined scope param name (Slack uses `scope` for bot scopes). */
  scopeParam: string;
  /** Extra fixed authorize-URL params (e.g. Slack `user_scope`). */
  extraAuthParams?: Record<string, string>;
  /** Extra fixed token-endpoint params. */
  extraTokenParams?: Record<string, string>;
  /** Where the access token lives in the token response (default `access_token`). */
  accessTokenPath?: string;
}

export interface CommCallSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  query?: Record<string, string | number | boolean | undefined>;
  jsonBody?: unknown;
  form?: Record<string, string>;
}
export type CommCall = (spec: CommCallSpec) => Promise<ConnectorResult<Record<string, unknown>>>;
export type CommOp = (call: CommCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;
export type CommPoll = (call: CommCall, conn: OpInput, cursor: string | null, limit: number, now: () => string) => Promise<ConnectorResult<PollResult>>;

/** The ONE provider-specific surface. Slack/Teams/Discord each export one. */
export interface CommProviderBinding {
  connectorId: string;
  authStyle: "bearer" | "bot";
  /** OAuth endpoints, or undefined for a non-OAuth (bot-token) provider. */
  oauth?: CommOAuthEndpoints;
  /** A cheap authenticated GET proving connectivity + auth. */
  probeUrl: string;
  /** Classify a response; return null for success. */
  classify: (status: number, body: Record<string, unknown>) => CommErrorClass | null;
  ops: Record<string, CommOp>;
  poll?: CommPoll;
}

const DEFAULT_TIMEOUT = 15_000;

function withQuery(url: string, query?: CommCallSpec["query"]): string {
  if (!query) return url;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `${url}${url.includes("?") ? "&" : "?"}${parts.join("&")}` : url;
}
function parseJson(body: string): Record<string, unknown> {
  if (body.length === 0) return {};
  try { const v = JSON.parse(body); return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }; } catch { return {}; }
}
function formBody(form: Record<string, string>): string {
  return Object.entries(form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
function authHeader(style: "bearer" | "bot", token: string): string {
  return style === "bot" ? `Bot ${token}` : `Bearer ${token}`;
}

/** An authenticated provider call, normalized into a ConnectorResult via the binding. */
export async function callProvider(cfg: CommConfig, binding: CommProviderBinding, token: string | null, spec: CommCallSpec): Promise<ConnectorResult<Record<string, unknown>>> {
  if (token === null || token.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  const headers: Record<string, string> = { authorization: authHeader(binding.authStyle, token), accept: "application/json" };
  let body: string | undefined;
  if (spec.form !== undefined) { headers["content-type"] = "application/x-www-form-urlencoded"; body = formBody(spec.form); }
  else if (spec.jsonBody !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(spec.jsonBody); }
  try {
    const res = await cfg.transport.request({ method: spec.method, url: withQuery(spec.url, spec.query), headers, body, timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    const parsed = parseJson(res.body);
    const err = binding.classify(res.status, parsed);
    if (err === null) return connectorOk(parsed);
    return connectorErr(err.category, `${binding.connectorId} request failed`, err.code);
  } catch (e) {
    if (e instanceof CommTransportError) return connectorErr(e.kind === "timeout" ? "timeout" : "network", "transport error", e.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}

/** A form-encoded token-endpoint call (no auth header) for the OAuth flow. */
export async function callTokenEndpoint(cfg: CommConfig, url: string, form: Record<string, string>, classify: CommProviderBinding["classify"]): Promise<ConnectorResult<Record<string, unknown>>> {
  try {
    const res = await cfg.transport.request({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: formBody(form), timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    const parsed = parseJson(res.body);
    const err = classify(res.status, parsed);
    if (err === null) return connectorOk(parsed);
    return connectorErr(err.category, "token endpoint failed", err.code);
  } catch (e) {
    if (e instanceof CommTransportError) return connectorErr(e.kind === "timeout" ? "timeout" : "network", "transport error", e.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}
