/* =============================================================================
 * Execution events (Sprint 7 §9) — PURE constructors, runtime-safe.
 *
 * Builders for the provider.* execution event stream — record only, no bus, no
 * persistence this sprint. Each event carries the job id, an optional opaque
 * provider id, a timestamp (`now`), and an optional structured detail. Pure.
 * ========================================================================== */

import { executionEventSchema, type ExecutionEvent, type ExecutionEventType } from "@brightloop/schema";

export function executionEvent(type: ExecutionEventType, jobId: string, now: string, providerId: string | null = null, detail: string | null = null): ExecutionEvent {
  return executionEventSchema.parse({ type, jobId, providerId, at: now, detail });
}

export const executionStarted = (jobId: string, providerId: string, now: string, detail?: string) => executionEvent("provider.execution_started", jobId, now, providerId, detail ?? null);
export const executionSucceeded = (jobId: string, providerId: string, now: string, detail?: string) => executionEvent("provider.execution_succeeded", jobId, now, providerId, detail ?? null);
export const executionFailed = (jobId: string, providerId: string, now: string, detail?: string) => executionEvent("provider.execution_failed", jobId, now, providerId, detail ?? null);
export const executionTimedOut = (jobId: string, providerId: string, now: string, detail?: string) => executionEvent("provider.execution_timed_out", jobId, now, providerId, detail ?? null);
export const executionCancelled = (jobId: string, providerId: string | null, now: string, detail?: string) => executionEvent("provider.execution_cancelled", jobId, now, providerId, detail ?? null);
export const fallbackStarted = (jobId: string, providerId: string, now: string, detail?: string) => executionEvent("provider.fallback_started", jobId, now, providerId, detail ?? null);
export const outputRejected = (jobId: string, providerId: string, now: string, detail?: string) => executionEvent("provider.output_rejected", jobId, now, providerId, detail ?? null);
export const budgetWarning = (jobId: string, providerId: string | null, now: string, detail?: string) => executionEvent("provider.budget_warning", jobId, now, providerId, detail ?? null);
export const budgetExhausted = (jobId: string, providerId: string | null, now: string, detail?: string) => executionEvent("provider.budget_exhausted", jobId, now, providerId, detail ?? null);
