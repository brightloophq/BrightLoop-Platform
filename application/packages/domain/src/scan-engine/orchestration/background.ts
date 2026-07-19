/* =============================================================================
 * Orchestration · background processing (PDF 27 §14) — PORTS + pure policy.
 *
 * A scan is long-running work: a durable, ordered, inspectable queue of jobs;
 * stateless workers; retry-with-backoff; hard per-stage timeouts; provider
 * fallback; parallel execution where the graph allows. Sprint 1 ships the
 * CONTRACTS and the pure retry/timeout POLICY — no worker, no queue backend.
 * ========================================================================== */

import type { EngineStage } from "@brightloop/schema";
import type { ScanJob, ScanRequest } from "@brightloop/schema";

/** Per-stage execution budget (PDF 27 §14: every stage has a hard ceiling). */
export interface StagePolicy {
  timeoutMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
}

export const DEFAULT_STAGE_POLICY: StagePolicy = { timeoutMs: 120_000, maxAttempts: 3, backoffBaseMs: 1_000 };

/**
 * Exponential backoff with a deterministic ceiling. Pure — no timers, no jitter
 * (jitter is an adapter concern; the domain stays deterministic + testable).
 * Returns the delay before attempt N (1-indexed), or null when attempts exhaust.
 */
export function backoffDelayMs(attempt: number, policy: StagePolicy = DEFAULT_STAGE_POLICY): number | null {
  if (attempt < 1 || attempt > policy.maxAttempts) return null;
  return policy.backoffBaseMs * 2 ** (attempt - 1);
}

/** Whether a failed attempt should retry (transient) or mark the job failed. */
export function shouldRetry(attempt: number, policy: StagePolicy = DEFAULT_STAGE_POLICY): boolean {
  return attempt < policy.maxAttempts;
}

/* ---- ports ---------------------------------------------------------------- */
/** Durable, ordered, inspectable job queue. A worker claims → executes → updates. */
export interface EngineJobQueue {
  enqueue(request: ScanRequest): Promise<ScanJob>;
  claim(): Promise<ScanJob | null>;
  update(job: ScanJob): Promise<ScanJob>;
  get(jobId: string): Promise<ScanJob | null>;
}

/** A stateless worker executes one stage of one job and returns the advanced job. */
export interface EngineWorker {
  execute(job: ScanJob, stage: EngineStage): Promise<ScanJob>;
}
