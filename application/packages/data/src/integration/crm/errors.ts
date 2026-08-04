/* =============================================================================
 * CRM connectors — error + health classification (F4.5). PURE.
 *
 * Maps a provider response onto the framework's normalized ConnectorFailureCategory
 * and a health reason covering the required states (connected/healthy · disconnected
 * · expired · permission_missing · rate_limited · configuration_error). A generic
 * HTTP-status classifier serves HubSpot/Salesforce/Pipedrive (all three use HTTP
 * status codes). An optional parsed body refines the short, safe code only — no
 * provider message, body, or secret ever leaks upward.
 * ========================================================================== */

import type { ConnectorFailureCategory, ConnectorHealthLevel } from "@brightloop/schema";

export type CrmHealthReason =
  | "connected" | "disconnected" | "expired" | "permission_missing"
  | "rate_limited" | "configuration_error";

export interface CrmErrorClass { category: ConnectorFailureCategory; code: string; reason: CrmHealthReason }

/**
 * Read a short, safe provider error code from a JSON body WITHOUT leaking a message.
 * HubSpot: `{ category, errorType }`; Salesforce: `[{ errorCode }]`; Pipedrive:
 * `{ error_info | errorCode }`. Only the machine code is surfaced, never the text.
 */
function safeErrorCode(body: Record<string, unknown>): string {
  if (typeof body["category"] === "string") return body["category"] as string;
  if (typeof body["errorType"] === "string") return body["errorType"] as string;
  if (typeof body["errorCode"] === "string") return body["errorCode"] as string;
  const arr = body["value"];
  if (Array.isArray(arr) && arr.length > 0 && arr[0] !== null && typeof arr[0] === "object") {
    const first = arr[0] as Record<string, unknown>;
    if (typeof first["errorCode"] === "string") return first["errorCode"] as string;
  }
  return "";
}

/** Generic HTTP-status classification. Returns null for a 2xx success. */
export function classifyHttpStatus(status: number, body: Record<string, unknown> = {}): CrmErrorClass | null {
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
export function reasonForCategory(category: ConnectorFailureCategory): CrmHealthReason {
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
export function healthForReason(reason: CrmHealthReason): ConnectorHealthLevel {
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
