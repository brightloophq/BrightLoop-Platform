/* =============================================================================
 * Controlled Runtime Driver — contract (Phase C · Sprint C2.1 §1/§9).
 *
 * The typed surface for driving EXACTLY ONE runtime turn. The driver coordinates
 * the existing runtime services + coordinator + provider adapter; it duplicates
 * no stage-transition, retry, routing, grounding, validation, budget, checkpoint,
 * artifact, or lease logic.
 *
 * The result is a plain, safe DTO — no domain entity, no database row, no raw
 * provider content, no key, no prompt.
 * ========================================================================== */

import type { PipelineRunStage, RuntimeRun } from "@brightloop/schema";
import type { StageExecutor } from "@brightloop/domain";

/** The coarse outcome of one driver turn. */
export type DriverOutcome =
  | "completed" // the stage completed AND the run reached its final stage
  | "advanced" // the stage completed and a downstream stage was enqueued
  | "blocked" // the stage cannot run yet (unimplemented dependency)
  | "retried" // the stage failed and was rescheduled for another attempt
  | "failed" // the stage failed terminally (dead-lettered)
  | "cancelled" // the run was cancelled
  | "no_job_available" // the queue had no eligible job (idle — not an error)
  | "provider_disabled" // a reasoning stage needs the live provider, which is off
  | "deadline_exceeded" // the run passed its deadline
  | "budget_exhausted"; // the reasoning budget was exhausted

export type RetryDisposition = "none" | "retry" | "dead_letter";

/** Safe usage telemetry — token counts only, never content. */
export interface DriverUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  estimated: boolean;
}

/**
 * The structured result of one driver turn. Every field is safe to return to an
 * internal operator: no API key, no raw provider response, no prompt, no hidden
 * reasoning, no environment values.
 */
export interface DriverResult {
  executionId: string;
  correlationId: string;
  runId: string | null;
  queueJobId: string | null;
  stage: string | null;
  providerId: string | null;
  modelId: string | null;
  outcome: DriverOutcome;
  artifactIds: string[];
  checkpointId: string | null;
  downstreamJobId: string | null;
  retryDisposition: RetryDisposition | null;
  blockedReason: string | null;
  failureCode: string | null;
  /** Provider latency in ms when a reasoning stage ran; null otherwise. */
  latencyMs: number | null;
  usage: DriverUsage | null;
  validationStatus: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  warnings: string[];
}

/** Whether the queue currently has a turn to run (dry-run eligibility, §1). */
export interface DriverEligibility {
  eligible: boolean;
  reason: string;
  queuedJobs: number;
  leasedJobs: number;
}

/** How a stage maps to an executable implementation (or a stable block). §3. */
export type StageSupport =
  | { kind: "executable"; execute: StageExecutor }
  | { kind: "blocked"; reason: string };

/**
 * Resolves the current stage to an executor or a block. The default registry
 * (in `registry.ts`) makes the reasoning stage executable via the live provider
 * and blocks every stage whose runtime dependency is not yet implemented.
 */
export interface StageExecutorRegistry {
  resolve(stage: PipelineRunStage, run: RuntimeRun): StageSupport;
}
