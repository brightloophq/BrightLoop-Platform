/* =============================================================================
 * Provider health model (PDF 27 §14) — PURE.
 *
 * Tracks per-provider health from success/failure outcomes and derives the
 * effective status used by routing: healthy / degraded / unavailable /
 * rate_limited / circuit_open. Pure functions of state + a supplied `now`.
 * ========================================================================== */

import { providerHealthSchema, type ProviderHealth, type HealthStatus, type Circuit } from "@brightloop/schema";

/** consecutive failures at/above this read as `degraded` (before the circuit trips). */
export const DEGRADED_FAILURE_THRESHOLD = 2;

export function newHealth(providerId: string): ProviderHealth {
  return providerHealthSchema.parse({ providerId, status: "healthy", consecutiveFailures: 0 });
}

export function recordSuccess(health: ProviderHealth, now: string): ProviderHealth {
  return { ...health, status: "healthy", lastSuccessAt: now, consecutiveFailures: 0, rateLimitResetAt: null };
}

export function recordFailure(health: ProviderHealth, now: string): ProviderHealth {
  const consecutiveFailures = health.consecutiveFailures + 1;
  return {
    ...health,
    lastFailureAt: now,
    consecutiveFailures,
    status: consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD ? "degraded" : health.status,
  };
}

/** Mark rate-limited until `resetAt`. Routing treats it as ineligible until then. */
export function recordRateLimited(health: ProviderHealth, now: string, resetAt: string): ProviderHealth {
  return { ...health, status: "rate_limited", lastFailureAt: now, rateLimitResetAt: resetAt };
}

/**
 * The effective status for routing at `now`, folding in the circuit and any
 * rate-limit window. `circuit_open` and an unexpired `rate_limited` window make
 * a provider ineligible; `degraded` remains eligible but is ranked lower. Pure.
 */
export function effectiveStatus(health: ProviderHealth, circuit: Circuit | null, now: string): HealthStatus {
  if (circuit && circuit.state === "open") return "circuit_open";
  if (health.status === "rate_limited" && health.rateLimitResetAt && Date.parse(now) < Date.parse(health.rateLimitResetAt)) {
    return "rate_limited";
  }
  if (health.status === "unavailable") return "unavailable";
  return health.consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD ? "degraded" : "healthy";
}

/** Statuses that make a provider INELIGIBLE for selection. */
export function isEligibleStatus(status: HealthStatus): boolean {
  return status === "healthy" || status === "degraded";
}
