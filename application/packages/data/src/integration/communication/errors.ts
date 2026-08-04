/* =============================================================================
 * Communication connectors — error + health classification (F4.3). PURE.
 *
 * Maps a provider response onto the framework's normalized ConnectorFailureCategory
 * and a health reason covering the required states (connected/healthy · disconnected
 * · expired · permission_missing · rate_limited · configuration_error). Two forms:
 * a generic HTTP-status classifier (Teams, Discord) and a Slack body-`ok` classifier
 * (Slack returns HTTP 200 with `{ok:false,error}`). No body/secret ever leaks — only
 * a short safe code + category.
 * ========================================================================== */

import type { ConnectorFailureCategory, ConnectorHealthLevel } from "@brightloop/schema";

export type CommHealthReason =
  | "connected" | "disconnected" | "expired" | "permission_missing"
  | "rate_limited" | "configuration_error";

export interface CommErrorClass { category: ConnectorFailureCategory; code: string; reason: CommHealthReason }

/** Generic HTTP-status classification. Returns null for a 2xx success. */
export function classifyHttpStatus(status: number): CommErrorClass | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return { category: "authentication", code: "unauthorized", reason: "expired" };
  if (status === 403) return { category: "authorization", code: "forbidden", reason: "permission_missing" };
  if (status === 429) return { category: "rate_limited", code: "too_many_requests", reason: "rate_limited" };
  if (status === 400) return { category: "config_invalid", code: "bad_request", reason: "configuration_error" };
  if (status === 404) return { category: "validation", code: "not_found", reason: "connected" };
  if (status >= 500) return { category: "provider_unavailable", code: "provider_error", reason: "disconnected" };
  return { category: "unknown", code: `http_${status}`, reason: "connected" };
}

/** Slack classification: HTTP status first, then the body `ok`/`error` envelope. */
export function classifySlack(status: number, body: Record<string, unknown>): CommErrorClass | null {
  const httpErr = classifyHttpStatus(status);
  if (httpErr) return httpErr;
  if (body["ok"] === true) return null;
  const e = typeof body["error"] === "string" ? (body["error"] as string) : "";
  if (/not_authed|invalid_auth|token_revoked|token_expired|account_inactive/.test(e)) return { category: "authentication", code: e || "auth", reason: "expired" };
  if (/missing_scope|not_allowed|no_permission|restricted_action|missing_permission/.test(e)) return { category: "authorization", code: e, reason: "permission_missing" };
  if (/ratelimited|rate_limited/.test(e)) return { category: "rate_limited", code: e, reason: "rate_limited" };
  if (e) return { category: "validation", code: e, reason: "configuration_error" };
  return { category: "unknown", code: "slack_error", reason: "connected" };
}

/** Derive a health reason from a normalized failure category (for health probes). */
export function reasonForCategory(category: ConnectorFailureCategory): CommHealthReason {
  switch (category) {
    case "authentication": return "expired";
    case "authorization": return "permission_missing";
    case "rate_limited":
    case "throttled": return "rate_limited";
    case "config_invalid":
    case "validation": return "configuration_error";
    default: return "disconnected";
  }
}

/** Map a health reason onto a framework health level. */
export function healthForReason(reason: CommHealthReason): ConnectorHealthLevel {
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
