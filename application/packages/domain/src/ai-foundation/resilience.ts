/* =============================================================================
 * Retry + failover policy (Phase E · Sprint E1) — PURE.
 *
 * Pure decisions only — the application owns the io loop and the clock. `retry.ts`
 * says whether/when to retry; `failover` resolves the provider order. Deterministic.
 * ========================================================================== */

import type { AiProviderKind } from "@brightloop/schema";
import type { AiFailureReason } from "./provider.js";

/** Failure reasons worth retrying on the SAME provider. */
const RETRYABLE: ReadonlySet<AiFailureReason> = new Set<AiFailureReason>(["network", "timeout", "rate_limit", "provider_unavailable"]);

export interface AiRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: AiRetryPolicy = { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 5_000 };

export function isRetryable(reason: AiFailureReason): boolean {
  return RETRYABLE.has(reason);
}

/**
 * Given a zero-based attempt index, the exponential-backoff delay before the NEXT
 * attempt (deterministic — no jitter, so tests are stable). Pure.
 */
export function aiBackoffDelayMs(attempt: number, policy: AiRetryPolicy = DEFAULT_RETRY): number {
  const raw = policy.baseDelayMs * 2 ** Math.max(0, attempt);
  return Math.min(raw, policy.maxDelayMs);
}

/** Should we retry after `attempt` failures with `reason`? Pure. */
export function aiShouldRetry(reason: AiFailureReason, attempt: number, policy: AiRetryPolicy = DEFAULT_RETRY): boolean {
  return isRetryable(reason) && attempt + 1 < policy.maxAttempts;
}

/** The default failover order (Claude → OpenAI → Google). Configurable per call. */
export const DEFAULT_FAILOVER: readonly AiProviderKind[] = ["anthropic", "openai", "google"];

/**
 * Resolve the ordered provider chain to try: the preferred provider first (if
 * given and available), then the remaining configured providers in failover order.
 * De-duplicated; only providers present in `available` are kept. Pure.
 */
export function resolveProviderChain(
  preferred: AiProviderKind | null,
  available: readonly AiProviderKind[],
  order: readonly AiProviderKind[] = DEFAULT_FAILOVER,
): AiProviderKind[] {
  const availableSet = new Set(available);
  const chain: AiProviderKind[] = [];
  const push = (k: AiProviderKind): void => { if (availableSet.has(k) && !chain.includes(k)) chain.push(k); };
  if (preferred !== null) push(preferred);
  for (const k of order) push(k);
  return chain;
}
