/* =============================================================================
 * Commerce connectors — shared config, provider binding, request client (F4.4).
 *
 * The generic engine. A `CommerceProviderBinding` is the ONLY provider-specific
 * surface — Shopify/Stripe/PayPal are data-driven bindings over this one engine.
 * `authorize` resolves a per-call `AuthContext` (base URL + headers), performing a
 * token exchange where required (PayPal client-credentials); `callCommerce` then
 * attaches those headers, encodes the body per the binding's `bodyStyle`, drives
 * the transport, and normalizes the response via the binding's classifier. No
 * secret/token/body ever leaks into an error. Server-only.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult,
  type VerifiedWebhook,
} from "@brightloop/domain";
import type { CommerceErrorClass } from "./errors.js";
import type { CommerceHttpTransport } from "./transport.js";
import { CommerceTransportError } from "./transport.js";
import type { OpInput } from "./helpers.js";

/** Shared, non-provider config injected at the composition root. */
export interface CommerceConfig {
  transport: CommerceHttpTransport;
  /** Injected clock (ISO) so token-expiry / event stamping is testable. */
  now: () => string;
  timeoutMs?: number;
}

/** The resolved auth for one call: a base URL and the headers to attach. */
export interface AuthContext { baseUrl: string; headers: Record<string, string> }

export interface CommerceCallSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Relative to the AuthContext base URL, or absolute when it starts with http. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  jsonBody?: unknown;
  /** Form-encoded body (Stripe). Values are stringified + URL-encoded. */
  formBody?: Record<string, string | number | boolean | undefined>;
}
export type CommerceCall = (spec: CommerceCallSpec) => Promise<ConnectorResult<Record<string, unknown>>>;
export type CommerceOp = (call: CommerceCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;
export type CommercePoll = (call: CommerceCall, conn: OpInput, cursor: string | null, limit: number, now: () => string) => Promise<ConnectorResult<PollResult>>;

/** Deterministic webhook verify + translate for a provider (no io). */
export interface CommerceWebhook {
  verify: (rawBody: string, signature: string | null, signingSecret: string | null) => ConnectorResult<VerifiedWebhook>;
  translate: (rawBody: string, now: () => string) => ConnectorResult<CanonicalConnectorEvent[]>;
}

/** The ONE provider-specific surface. Shopify/Stripe/PayPal each export one. */
export interface CommerceProviderBinding {
  connectorId: string;
  /** How request bodies are encoded for this provider. */
  bodyStyle: "json" | "form";
  /** Classify a response; return null for success. */
  classify: (status: number, body: Record<string, unknown>) => CommerceErrorClass | null;
  /**
   * Resolve the auth context (base URL + headers) for a call. May perform a token
   * exchange (PayPal). Returns `secret_unavailable` when no credential is present.
   */
  authorize: (cfg: CommerceConfig, secret: string | null, config: OpInput) => Promise<ConnectorResult<AuthContext>>;
  /**
   * A cheap authenticated GET (relative path) proving connectivity + auth, or the
   * empty string when a successful `authorize` already proves it (PayPal token mint).
   */
  probePath: string;
  ops: Record<string, CommerceOp>;
  poll?: CommercePoll;
  webhook?: CommerceWebhook;
}

const DEFAULT_TIMEOUT = 15_000;

function withQuery(url: string, query?: CommerceCallSpec["query"]): string {
  if (!query) return url;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `${url}${url.includes("?") ? "&" : "?"}${parts.join("&")}` : url;
}
function parseJson(body: string): Record<string, unknown> {
  if (body.length === 0) return {};
  try { const v = JSON.parse(body); return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }; } catch { return {}; }
}
export function formEncode(form: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(form)) if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.join("&");
}
function resolveUrl(baseUrl: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${baseUrl}${path}`;
}

/** An authenticated provider call, normalized into a ConnectorResult via the binding. */
export async function callCommerce(cfg: CommerceConfig, binding: CommerceProviderBinding, auth: AuthContext, spec: CommerceCallSpec): Promise<ConnectorResult<Record<string, unknown>>> {
  const headers: Record<string, string> = { ...auth.headers, accept: "application/json" };
  let body: string | undefined;
  if (spec.formBody !== undefined) { headers["content-type"] = "application/x-www-form-urlencoded"; body = formEncode(spec.formBody); }
  else if (spec.jsonBody !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(spec.jsonBody); }
  try {
    const res = await cfg.transport.request({ method: spec.method, url: withQuery(resolveUrl(auth.baseUrl, spec.path), spec.query), headers, body, timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    const parsed = parseJson(res.body);
    const err = binding.classify(res.status, parsed);
    if (err === null) return connectorOk(parsed);
    return connectorErr(err.category, `${binding.connectorId} request failed`, err.code);
  } catch (e) {
    if (e instanceof CommerceTransportError) return connectorErr(e.kind === "timeout" ? "timeout" : "network", "transport error", e.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}

/**
 * An unauthenticated call used by an `authorize` implementation itself (e.g. the
 * PayPal client-credentials token exchange). Attaches only the given headers.
 */
export async function callRaw(cfg: CommerceConfig, binding: CommerceProviderBinding, url: string, spec: { method: "GET" | "POST"; headers: Record<string, string>; formBody?: Record<string, string | number | boolean | undefined>; jsonBody?: unknown }): Promise<ConnectorResult<Record<string, unknown>>> {
  const headers: Record<string, string> = { ...spec.headers, accept: "application/json" };
  let body: string | undefined;
  if (spec.formBody !== undefined) { headers["content-type"] = "application/x-www-form-urlencoded"; body = formEncode(spec.formBody); }
  else if (spec.jsonBody !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(spec.jsonBody); }
  try {
    const res = await cfg.transport.request({ method: spec.method, url, headers, body, timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT });
    const parsed = parseJson(res.body);
    const err = binding.classify(res.status, parsed);
    if (err === null) return connectorOk(parsed);
    return connectorErr(err.category, `${binding.connectorId} auth failed`, err.code);
  } catch (e) {
    if (e instanceof CommerceTransportError) return connectorErr(e.kind === "timeout" ? "timeout" : "network", "transport error", e.kind);
    return connectorErr("unknown", "unexpected transport failure", null);
  }
}
