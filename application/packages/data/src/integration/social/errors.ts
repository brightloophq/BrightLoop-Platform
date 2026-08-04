/* =============================================================================
 * Social connectors — error + health classification (F4.7). PURE.
 *
 * Maps a provider response onto the framework's normalized ConnectorFailureCategory
 * and a health reason covering the required states (connected/healthy · disconnected
 * · expired · permission_missing · rate_limited · configuration_error). A generic
 * HTTP-status classifier serves Meta / LinkedIn / X / TikTok (all use HTTP status
 * codes). An optional parsed body refines the short, safe code only — no provider
 * message, body, or secret ever leaks upward.
 * ========================================================================== */

import type { ConnectorFailureCategory, ConnectorHealthLevel } from "@brightloop/schema";

export type SocialHealthReason =
  | "connected" | "disconnected" | "expired" | "permission_missing"
  | "rate_limited" | "configuration_error";

export interface SocialErrorClass { category: ConnectorFailureCategory; code: string; reason: SocialHealthReason }

/**
 * Read a short, safe provider error code from a JSON body WITHOUT leaking a message.
 * Meta: `{ error: { code, type } }`; X/Twitter: `{ errors: [{ code }] }` or
 * `{ status }`/`{ type }`; TikTok: `{ error: { code } }`; LinkedIn: `{ code }` /
 * `{ serviceErrorCode }`. Only the machine code is surfaced, never the text.
 */
function safeErrorCode(body: Record<string, unknown>): string {
  // Meta / TikTok error envelope: { error: { code, ... } }.
  const err = body["error"];
  if (err !== null && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["code"] === "number") return `err_${e["code"] as number}`;
    if (typeof e["code"] === "string") return e["code"] as string;
    if (typeof e["type"] === "string") return e["type"] as string;
  }
  if (typeof err === "string") return err;
  // X/Twitter errors array.
  const errs = body["errors"];
  if (Array.isArray(errs) && errs.length > 0 && errs[0] !== null && typeof errs[0] === "object") {
    const first = errs[0] as Record<string, unknown>;
    if (typeof first["code"] === "number") return `x_${first["code"] as number}`;
    if (typeof first["code"] === "string") return first["code"] as string;
  }
  // LinkedIn error envelopes.
  if (typeof body["serviceErrorCode"] === "number") return `li_${body["serviceErrorCode"] as number}`;
  if (typeof body["code"] === "string") return body["code"] as string;
  return "";
}

/** Generic HTTP-status classification. Returns null for a 2xx success. */
export function classifyHttpStatus(status: number, body: Record<string, unknown> = {}): SocialErrorClass | null {
  if (status >= 200 && status < 300) return null;
  const code = safeErrorCode(body);
  if (status === 401) return { category: "authentication", code: code || "unauthorized", reason: "expired" };
  if (status === 403) return { category: "authorization", code: code || "forbidden", reason: "permission_missing" };
  if (status === 429) return { category: "rate_limited", code: "too_many_requests", reason: "rate_limited" };
  if (status === 400 || status === 422) return { category: "config_invalid", code: code || "bad_request", reason: "configuration_error" };
  if (status === 404) return { category: "validation", code: "not_found", reason: "connected" };
  if (status === 409) return { category: "conflict", code: "conflict", reason: "connected" };
  if (status >= 500) return { category: "provider_unavailable", code: "provider_error", reason: "disconnected" };
  return { category: "unknown", code: `http_${status}`, reason: "connected" };
}

/** Derive a health reason from a normalized failure category (for health probes). */
export function reasonForCategory(category: ConnectorFailureCategory): SocialHealthReason {
  switch (category) {
    case "authentication": return "expired";
    case "authorization": return "permission_missing";
    case "rate_limited":
    case "throttled": return "rate_limited";
    case "config_invalid":
    case "validation": return "configuration_error";
    case "secret_unavailable": return "disconnected";
    default: return "disconnected";
  }
}

/** Map a health reason onto a framework health level. */
export function healthForReason(reason: SocialHealthReason): ConnectorHealthLevel {
  switch (reason) {
    case "connected": return "healthy";
    case "expired":
    case "permission_missing": return "unauthorized";
    case "rate_limited":
    case "configuration_error": return "degraded";
    case "disconnected": return "unavailable";
    default: return "unknown";
  }
}
