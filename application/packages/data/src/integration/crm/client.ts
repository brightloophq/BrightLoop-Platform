/* =============================================================================
 * CRM connectors — shared config, provider binding, request client (F4.5).
 *
 * The generic engine. A `CrmProviderBinding` is the ONLY provider-specific surface —
 * HubSpot/Salesforce/Pipedrive are data-driven bindings over this one engine.
 * `authorize` resolves a per-call `AuthContext` (base URL + Bearer headers) from the
 * resolved OAuth access token + the installation's non-secret config (Salesforce
 * instance URL, Pipedrive company domain); `callCrm` then attaches those headers,
 * encodes the JSON body, drives the transport, and normalizes the response via the
 * binding's classifier. A separate `callTokenEndpoint` performs the form-encoded
 * OAuth token exchange with no auth header. No secret/token/body ever leaks into an
 * error. Server-only.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult,
  type VerifiedWebhook,
} from "@brightloop/domain";
import type { CrmErrorClass } from "./errors.js";
import type { CrmHttpTransport } from "./transport.js";
import { CrmTransportError } from "./transport.js";
import type { OpInput } from "./helpers.js";

/** Shared, non-provider config injected at the composition root. */
export interface CrmConfig {
  transport: CrmHttpTransport;
  /** Injected clock (ISO) so token-expiry / event stamping is testable. */
  now: () => string;
  /** Default OAuth redirect URI when the caller supplies none. */
  defaultRedirectUri: string;
  timeoutMs?: number;
}

/** App-level OAuth client credentials for one provider (never per-tenant). */
export interface ProviderCreds { clientId: string; clientSecret: string }

export interface CrmOAuthEndpoints {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  /** Space-joined scope param name (default `scope`). */
  scopeParam?: string;
  /**
   * How client credentials are presented at the token endpoint: `body` (default —
   * client_id/client_secret as form params, HubSpot/Salesforce) or `basic` (HTTP
   * Basic `client_id:client_secret`, with only grant params in the body — Pipedrive).
   */
  tokenAuthStyle?: "body" | "basic";
  /** Extra fixed authorize-URL params. */
  extraAuthParams?: Record<string, string>;
  /** Extra fixed token-endpoint params. */
  extraTokenParams?: Record<string, string>;
}

/** The resolved auth for one call: a base URL and the headers to attach. */
export interface AuthContext { baseUrl: string; headers: Record<string, string> }

export interface CrmCallSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Relative to the AuthContext base URL, or absolute when it starts with http. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  jsonBody?: unknown;
}
export type CrmCall = (spec: CrmCallSpec) => Promise<ConnectorResult<Record<string, unknown>>>;
export type CrmOp = (call: CrmCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;
export type CrmPoll = (call: CrmCall, conn: OpInput, cursor: string | null, limit: number, now: () => string) => Promise<ConnectorResult<PollResult>>;

/** Deterministic webhook verify + translate for a provider (no io). */
export interface CrmWebhook {
  verify: (rawBody: string, signature: string | null, signingSecret: string | null) => ConnectorResult<VerifiedWebhook>;
  translate: (rawBody: string, now: () => string) => ConnectorResult<CanonicalConnectorEvent[]>;
}

/** The ONE provider-specific surface. HubSpot/Salesforce/Pipedrive each export one. */
export interface CrmProviderBinding {
  connectorId: string;
  /** OAuth endpoints (all three CRM providers use authorization-code OAuth 2.0). */
  oauth: CrmOAuthEndpoints;
  /** Classify a response; return null for success. */
  classify: (status: number, body: Record<string, unknown>) => CrmErrorClass | null;
  /**
   * Resolve the auth context (base URL + Bearer headers) for a call from the resolved
   * access token + non-secret config. Returns `secret_unavailable` when no token is
   * present and `config_invalid` when a required base-URL config field is missing.
   */
  authorize: (secret: string | null, config: OpInput) => ConnectorResult<AuthContext>;
  /** A cheap authenticated GET (relative path) proving connectivity + auth. */
  probePath: string;
  ops: Record<string, CrmOp>;
  poll?: CrmPoll;
  webhook?: CrmWebhook;
}

const DEFAULT_TIMEOUT = 15_000;

function withQuery(url: string, query?: CrmCallSpec["query"]): string {
  if (!query) return url;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `${url}${url.includes("?") ? "&" : "?"}${parts.join("&")}` : url;
}
function parseJson(body: string): Record<string, unknown> {
  if (body.length === 0) return {};
  try { const v = JSON.parse(body); return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }; } catch { return {}; }
}
export function formEncode(form: Record<string, string>): string {
  return Object.entries(form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
function resolveUrl(baseUrl: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${baseUrl}${path}`;
}

/** An authenticated provider call, normalized into a ConnectorResult via the binding. */
export async function callCrm(cfg: CrmConfig, binding: CrmProviderBinding, auth: AuthContext, spec: CrmCallSpec): Promise<ConnectorResult<Record<string, unknown>>> {
  const headers: Record<string, string> = { ...auth.headers, accept: "application/json" };
  let body: string | undefined;
  if (spec.jsonBody !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(spec.jsonBody); }
  try {
    const res = await cfg.transport.request({ method: spec.method, url: withQuery(resolveUrl(auth.baseUrl, spec.path), spec.query), headers, body, timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    const parsed = parseJson(res.body);
    const err = binding.classify(res.status, parsed);
    if (err === null) return connectorOk(parsed);
    return connectorErr(err.category, `${binding.connectorId} request failed`, err.code);
  } catch (e) {
    if (e instanceof CrmTransportError) return connectorErr(e.kind === "timeout" ? "timeout" : "network", "transport error", e.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}

/** A form-encoded token-endpoint call for the OAuth flow, with optional extra headers (e.g. Basic auth). */
export async function callTokenEndpoint(cfg: CrmConfig, url: string, form: Record<string, string>, classify: CrmProviderBinding["classify"], extraHeaders?: Record<string, string>): Promise<ConnectorResult<Record<string, unknown>>> {
  try {
    const res = await cfg.transport.request({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...(extraHeaders ?? {}) }, body: formEncode(form), timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    const parsed = parseJson(res.body);
    const err = classify(res.status, parsed);
    if (err === null) return connectorOk(parsed);
    return connectorErr(err.category, "token endpoint failed", err.code);
  } catch (e) {
    if (e instanceof CrmTransportError) return connectorErr(e.kind === "timeout" ? "timeout" : "network", "transport error", e.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}
