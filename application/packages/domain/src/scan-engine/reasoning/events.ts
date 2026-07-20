/* =============================================================================
 * Reasoning events (Sprint 6 §10 · AIS-001 §08) — PURE constructors.
 *
 * Pure builders for the reasoning.* event stream — record only, no transport, no
 * bus, no side effects. Each event carries the job id, a timestamp (`now`), and an
 * optional structured detail string. The status→event map lives in job.ts.
 * ========================================================================== */

import { reasoningEventSchema, type ReasoningEvent, type ReasoningEventType } from "@brightloop/schema";

/** Build a validated reasoning event. Pure given `now`. */
export function reasoningEvent(type: ReasoningEventType, jobId: string, now: string, detail: string | null = null): ReasoningEvent {
  return reasoningEventSchema.parse({ type, jobId, at: now, detail });
}

export const jobCreated = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.job_created", jobId, now, detail ?? null);
export const planned = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.planned", jobId, now, detail ?? null);
export const routed = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.routed", jobId, now, detail ?? null);
export const started = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.started", jobId, now, detail ?? null);
export const validationFailed = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.validation_failed", jobId, now, detail ?? null);
export const retried = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.retried", jobId, now, detail ?? null);
export const fallbackSelected = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.fallback_selected", jobId, now, detail ?? null);
export const completed = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.completed", jobId, now, detail ?? null);
export const failed = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.failed", jobId, now, detail ?? null);
export const cancelled = (jobId: string, now: string, detail?: string) => reasoningEvent("reasoning.cancelled", jobId, now, detail ?? null);

/** Map a job-status transition to its canonical event type, when one exists. Pure. */
export const JOB_EVENT_FOR: Record<string, ReasoningEventType> = {
  plan: "reasoning.planned",
  route: "reasoning.routed",
  start: "reasoning.started",
  retry: "reasoning.retried",
  complete: "reasoning.completed",
  fail: "reasoning.failed",
  cancel: "reasoning.cancelled",
};
