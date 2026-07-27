/* =============================================================================
 * Execution Runtime — failure normalization + retry classification (F3). PURE.
 *
 * Provider errors are normalized into a stable taxonomy with a retryable flag, a
 * SAFE user message (never a stack/response body/secret), a recommended action,
 * and safe diagnostic metadata. No io.
 * ========================================================================== */

import type { RuntimeFailureCategory } from "@brightloop/schema";

/** Categories for which an automatic retry is EVER permitted (transient only). */
export const RETRYABLE_CATEGORIES: readonly RuntimeFailureCategory[] = [
  "timeout", "throttled", "provider_unavailable", "network", "execution_failed",
];
/** Categories that must NEVER be auto-retried (a retry cannot succeed). */
export const NON_RETRYABLE_CATEGORIES: readonly RuntimeFailureCategory[] = [
  "authentication", "authorization", "validation", "unsupported", "conflict",
  "stale_version", "approval_missing", "approval_expired", "package_mismatch", "secret_unavailable",
];

export const isRetryableCategory = (c: RuntimeFailureCategory): boolean => RETRYABLE_CATEGORIES.includes(c);

export interface NormalizedFailure {
  category: RuntimeFailureCategory;
  retryable: boolean;
  /** A short, safe message shown to users (no internal detail). */
  userMessage: string;
  recommendedAction: string;
  /** A safe provider code (short token), never a response body. */
  providerCode: string | null;
}

const SAFE_MESSAGE: Record<RuntimeFailureCategory, string> = {
  authentication: "The runtime rejected the credentials.",
  authorization: "The runtime denied permission for this operation.",
  validation: "The runtime rejected the request as invalid.",
  unsupported: "The runtime does not support this operation.",
  conflict: "The operation conflicted with the runtime's current state.",
  timeout: "The runtime did not respond in time.",
  throttled: "The runtime is rate-limiting requests.",
  provider_unavailable: "The runtime is currently unavailable.",
  network: "The runtime could not be reached.",
  stale_version: "The deployment was based on an out-of-date version.",
  approval_missing: "A required approval is missing.",
  approval_expired: "The approval has expired.",
  package_mismatch: "The deployment package no longer matches what was approved.",
  secret_unavailable: "A required credential reference is unavailable.",
  execution_failed: "The workflow execution failed.",
  unknown: "The operation could not be completed.",
};
const RECOMMENDED: Record<RuntimeFailureCategory, string> = {
  authentication: "Rotate or re-validate the runtime credentials.",
  authorization: "Grant the runtime account the required scope.",
  validation: "Review the workflow definition and redeploy.",
  unsupported: "Use a runtime edition that supports this operation.",
  conflict: "Reconcile the deployment and try again.",
  timeout: "Retry shortly; the runtime may be busy.",
  throttled: "Back off and retry after the rate limit resets.",
  provider_unavailable: "Retry once the runtime is healthy.",
  network: "Check runtime connectivity and retry.",
  stale_version: "Create a fresh deployment from the current package.",
  approval_missing: "Request the required approval first.",
  approval_expired: "Request a new approval for the current package.",
  package_mismatch: "Re-approve the exact current package.",
  secret_unavailable: "Restore or rotate the credential reference.",
  execution_failed: "Inspect the execution logs, then retry if transient.",
  unknown: "Inspect the operation logs for details.",
};

/** Normalize a category (+ optional safe code) into a stable, safe failure. */
export function normalizeFailure(category: RuntimeFailureCategory, providerCode: string | null = null): NormalizedFailure {
  return {
    category,
    retryable: isRetryableCategory(category),
    userMessage: SAFE_MESSAGE[category],
    recommendedAction: RECOMMENDED[category],
    // Only keep a short alphanumeric code; never echo a body.
    providerCode: providerCode && /^[A-Za-z0-9_.:-]{1,40}$/.test(providerCode) ? providerCode : null,
  };
}

/* ---- retry policy (bounded exponential backoff) ---------------------------- */

export interface RuntimeRetryDecision {
  shouldRetry: boolean;
  nextAttempt: number;
  /** Backoff before the next attempt (deterministic; no jitter/random). */
  delayMs: number;
  reason: string;
}

export interface RetryConfig { maxAttempts: number; baseDelayMs?: number; capDelayMs?: number }

/** Decide whether to retry an operation given its failure + attempt count. */
export function decideRuntimeRetry(category: RuntimeFailureCategory, attempt: number, config: RetryConfig): RuntimeRetryDecision {
  const base = config.baseDelayMs ?? 1000;
  const cap = config.capDelayMs ?? 60_000;
  if (!isRetryableCategory(category)) return { shouldRetry: false, nextAttempt: attempt, delayMs: 0, reason: `${category} is not retryable` };
  if (attempt >= config.maxAttempts) return { shouldRetry: false, nextAttempt: attempt, delayMs: 0, reason: "retry budget exhausted" };
  const delayMs = Math.min(base * 2 ** (attempt - 1), cap);
  return { shouldRetry: true, nextAttempt: attempt + 1, delayMs, reason: `retry ${attempt + 1}/${config.maxAttempts} after ${delayMs}ms` };
}
