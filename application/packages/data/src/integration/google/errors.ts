/* =============================================================================
 * Google connectors — error + health classification (F4.2). PURE.
 *
 * Maps a Google HTTP status (+ optional error body) onto the framework's
 * normalized ConnectorFailureCategory and a health reason covering the seven
 * required states: connected/healthy, disconnected, expired, permission_missing,
 * rate_limited, configuration_error. No secret/body ever leaks upward — only a
 * short safe code + category.
 * ========================================================================== */

import type { ConnectorFailureCategory, ConnectorHealthLevel } from "@brightloop/schema";

export type GoogleHealthReason =
  | "connected" | "disconnected" | "expired" | "permission_missing"
  | "rate_limited" | "configuration_error";

export interface GoogleErrorClass {
  category: ConnectorFailureCategory;
  /** Short, safe provider code (never a body or secret). */
  code: string;
  reason: GoogleHealthReason;
}

/** Extract a short reason string from a Google JSON error body, safely. */
function bodyReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { status?: unknown; errors?: { reason?: unknown }[] } };
    const raw = parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? "";
    return typeof raw === "string" ? raw : String(raw);
  } catch {
    return "";
  }
}

/** Classify a Google HTTP status + body into the normalized taxonomy. Pure. */
export function classifyGoogleError(status: number, body = ""): GoogleErrorClass {
  const reason = bodyReason(body).toLowerCase();
  if (status === 401) {
    // Google returns 401 for an expired or revoked token.
    return { category: "authentication", code: "unauthorized", reason: "expired" };
  }
  if (status === 403) {
    if (reason.includes("ratelimit") || reason.includes("userratelimit") || reason.includes("quota")) {
      return { category: "throttled", code: "rate_limit_exceeded", reason: "rate_limited" };
    }
    return { category: "authorization", code: "insufficient_permission", reason: "permission_missing" };
  }
  if (status === 429) return { category: "rate_limited", code: "too_many_requests", reason: "rate_limited" };
  if (status === 400) return { category: "config_invalid", code: "bad_request", reason: "configuration_error" };
  if (status === 404) return { category: "validation", code: "not_found", reason: "connected" };
  if (status === 409) return { category: "conflict", code: "conflict", reason: "connected" };
  if (status >= 500) return { category: "provider_unavailable", code: "provider_error", reason: "disconnected" };
  return { category: "unknown", code: `http_${status}`, reason: "connected" };
}

/** Map a health probe (ok flag + optional status) to a framework health level + reason. */
export function googleHealth(ok: boolean, status?: number, body = ""): { level: ConnectorHealthLevel; reason: GoogleHealthReason } {
  if (ok) return { level: "healthy", reason: "connected" };
  if (status === undefined) return { level: "unavailable", reason: "disconnected" };
  const c = classifyGoogleError(status, body);
  const level: ConnectorHealthLevel =
    c.reason === "expired" || c.reason === "permission_missing" ? "unauthorized"
      : c.reason === "rate_limited" || c.reason === "configuration_error" ? "degraded"
        : c.reason === "disconnected" ? "unavailable" : "healthy";
  return { level, reason: c.reason };
}
