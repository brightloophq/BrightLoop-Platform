/* =============================================================================
 * Finance connectors — error + health classification (F4.6). PURE.
 *
 * Maps a provider response onto the framework's normalized ConnectorFailureCategory
 * and a health reason covering the required states (connected/healthy · disconnected
 * · expired · permission_missing · rate_limited · configuration_error). A generic
 * HTTP-status classifier serves QuickBooks Online + Xero (both use HTTP status codes).
 * An optional parsed body refines the short, safe code only — no provider message,
 * body, or secret ever leaks upward.
 * ========================================================================== */

import type { ConnectorFailureCategory, ConnectorHealthLevel } from "@brightloop/schema";

export type FinanceHealthReason =
  | "connected" | "disconnected" | "expired" | "permission_missing"
  | "rate_limited" | "configuration_error";

export interface FinanceErrorClass { category: ConnectorFailureCategory; code: string; reason: FinanceHealthReason }

/**
 * Read a short, safe provider error code from a JSON body WITHOUT leaking a message.
 * QuickBooks: `{ Fault: { Error: [{ code }], type } }`; Xero: `{ Type }` /
 * `{ ErrorNumber }`. Only the machine code is surfaced, never the text.
 */
function safeErrorCode(body: Record<string, unknown>): string {
  // QuickBooks fault envelope.
  const fault = body["Fault"];
  if (fault !== null && typeof fault === "object") {
    const f = fault as Record<string, unknown>;
    const errs = f["Error"];
    if (Array.isArray(errs) && errs.length > 0 && errs[0] !== null && typeof errs[0] === "object") {
      const first = errs[0] as Record<string, unknown>;
      if (typeof first["code"] === "string") return first["code"] as string;
    }
    if (typeof f["type"] === "string") return f["type"] as string;
  }
  // Xero error envelopes.
  if (typeof body["Type"] === "string") return body["Type"] as string;
  if (typeof body["ErrorNumber"] === "number") return `xero_${body["ErrorNumber"] as number}`;
  // Generic OAuth error field.
  if (typeof body["error"] === "string") return body["error"] as string;
  return "";
}

/** Generic HTTP-status classification. Returns null for a 2xx success. */
export function classifyHttpStatus(status: number, body: Record<string, unknown> = {}): FinanceErrorClass | null {
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
export function reasonForCategory(category: ConnectorFailureCategory): FinanceHealthReason {
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
export function healthForReason(reason: FinanceHealthReason): ConnectorHealthLevel {
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
