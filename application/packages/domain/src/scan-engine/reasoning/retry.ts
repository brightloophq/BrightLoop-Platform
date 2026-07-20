/* =============================================================================
 * Retry & fallback semantics (Sprint 6 §07 · AIS-001 §11 Fail Safely) — PURE.
 *
 * Classifies a failure as retryable vs fatal, decides whether to retry, fall back
 * to the next provider, or stop; handles budget exhaustion, timeout, cancellation,
 * partial output, and resume-from-checkpoint. Bounded by a max-attempt policy.
 * NO background workers, no scheduling — pure decision functions.
 * ========================================================================== */

import type { PartialOutput, ReasoningFailureKind, SelectionResult } from "@brightloop/schema";

export interface RetryPolicy {
  maxAttempts: number; // total attempts allowed (attempt is 0-based)
  allowProviderFallback: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, allowProviderFallback: true };

/** Failure kinds that a retry could plausibly clear. Fatal/budget/cancelled cannot. */
const RETRYABLE_KINDS = new Set<ReasoningFailureKind>(["retryable", "validation", "timeout"]);

export function isRetryableFailure(kind: ReasoningFailureKind): boolean {
  return RETRYABLE_KINDS.has(kind);
}

export type RetryDecision = "retry_same" | "retry_fallback" | "stop";

/**
 * Decide the next move after a failure. A cancelled/fatal/budget-exhausted failure
 * always stops. A validation failure retries the same route (the prompt is tightened,
 * not the provider). A retryable/timeout failure falls back to the next provider when
 * one exists and the policy allows it, else retries the same route. Attempts are capped.
 * Pure.
 */
export function decideRetry(
  kind: ReasoningFailureKind,
  attempt: number,
  selection: SelectionResult | null,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryDecision {
  if (!isRetryableFailure(kind)) return "stop"; // fatal, budget_exhausted, cancelled
  if (attempt + 1 >= policy.maxAttempts) return "stop"; // no attempts left
  if (kind === "validation") return "retry_same"; // re-run the same route with a tighter prompt
  const hasFallback = policy.allowProviderFallback && (selection?.fallbackOrder.length ?? 0) > 0;
  return hasFallback ? "retry_fallback" : "retry_same";
}

/** The next provider id to try, or null when the fallback chain is exhausted. Pure. */
export function nextFallbackProvider(selection: SelectionResult, triedIds: readonly string[]): string | null {
  const tried = new Set(triedIds);
  for (const id of selection.fallbackOrder) if (!tried.has(id)) return id;
  return null;
}

/** Budget is exhausted when spend has reached the ceiling. Pure. */
export function isBudgetExhausted(spentSoFar: number, costCeiling: number): boolean {
  return spentSoFar >= costCeiling;
}

/* ---- partial output + checkpoint resume ----------------------------------- */

/** A partial output is resumable when it produced something but is not complete. Pure. */
export function isResumable(partial: PartialOutput): boolean {
  return !partial.complete && partial.producedIds.length > 0;
}

/**
 * Resume from a checkpoint: the output kinds still required, given what a partial
 * output already produced. Deterministic set difference preserving `required` order.
 */
export function remainingOutputs(partial: PartialOutput, requiredIds: readonly string[]): string[] {
  const done = new Set(partial.producedIds);
  return requiredIds.filter((id) => !done.has(id));
}
