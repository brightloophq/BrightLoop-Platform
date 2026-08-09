/* =============================================================================
 * Runtime service support (Phase B · Sprint 13C) — shared plumbing.
 *
 * Ids, DETERMINISTIC idempotency keys, event names, and the small dependency
 * shapes every runtime service builds on.
 *
 * THE IDEMPOTENCY KEYS ARE THE DEDUPLICATION MECHANISM. They are derived from
 * the natural identity of the work — never from a clock, a counter, or a random
 * id — so a retry after a crash recomputes the SAME key, the repository replays
 * instead of inserting, and already-completed work cannot execute twice. Every
 * `*Key` helper below must stay a pure function of its arguments.
 * ========================================================================== */

import type { Clock } from "../../guard.js";
import type { RuntimeErr, RuntimeResult } from "../results.js";

/** Prefixed id generator, injected (the domain package owns no randomness). */
export type RuntimeIdGen = (prefix: string) => string;

/** What every runtime service needs beyond its repositories. */
export interface RuntimeServiceContext {
  ids: RuntimeIdGen;
  clock: Clock;
  /** Recorded as `created_by` / event actor. Null for system-initiated work. */
  actorId?: string | null;
}

/* ---- deterministic idempotency keys ----------------------------------------- */
/**
 * A run is identified by its scan. Re-issuing "start a run for this scan"
 * replays the existing run rather than forking a second one.
 */
export const runKey = (scanId: string): string => `run:${scanId}`;

/** A stage transition is identified by run + stage + attempt. */
export const stageKey = (runId: string, stage: string, attempt: number): string => `stage:${runId}:${stage}:${attempt}`;

/** A checkpoint is identified by run + stage + attempt. */
export const checkpointKey = (runId: string, stage: string, attempt: number): string => `ckpt:${runId}:${stage}:${attempt}`;

/**
 * An artifact is identified by run + kind + version. Re-persisting the same
 * version replays; changing its content under the same version is a CONFLICT,
 * which is what keeps artifacts immutable.
 */
export const artifactKey = (runId: string, kind: string, version: number): string => `art:${runId}:${kind}:${version}`;

/** A reasoning job is identified by run + stage + task type. */
export const reasoningKey = (runId: string, stage: string, taskType: string): string => `rj:${runId}:${stage}:${taskType}`;

/** A provider attempt is identified by job + attempt number. */
export const providerAttemptKey = (reasoningJobId: string, attempt: number): string => `pa:${reasoningJobId}:${attempt}`;

/** A queue job is identified by the work it represents, so enqueue is idempotent. */
export const queueKey = (jobType: string, runId: string, stage: string): string => `q:${jobType}:${runId}:${stage}`;

/** Derived records are identified by run + kind + version. */
export const derivedKey = (kind: string, runId: string, ref: string, version: number): string => `${kind}:${runId}:${ref}:${version}`;

/* ---- runtime event names ----------------------------------------------------- */
/**
 * The append-only event vocabulary. Payloads carry structured references only —
 * never chain-of-thought, raw provider content, or secrets.
 */
export const RUNTIME_EVENTS = {
  runCreated: "runtime.run.created",
  runStarted: "runtime.run.started",
  runCompleted: "runtime.run.completed",
  runFailed: "runtime.run.failed",
  runCancelled: "runtime.run.cancelled",
  runResumed: "runtime.run.resumed",
  stageStarted: "runtime.stage.started",
  stageCompleted: "runtime.stage.completed",
  stageFailed: "runtime.stage.failed",
  stageSkipped: "runtime.stage.skipped",
  stageBlocked: "runtime.stage.blocked",
  checkpointSaved: "runtime.checkpoint.saved",
  checkpointInvalidated: "runtime.checkpoint.invalidated",
  artifactPersisted: "runtime.artifact.persisted",
  reasoningCreated: "runtime.reasoning.created",
  reasoningCompleted: "runtime.reasoning.completed",
  reasoningFailed: "runtime.reasoning.failed",
  providerAttempted: "runtime.provider.attempted",
  /** A provider-attempt row could not be persisted — never silently swallowed. */
  providerAttemptPersistFailed: "runtime.provider.attempt_persist_failed",
  jobEnqueued: "runtime.queue.enqueued",
  jobLeased: "runtime.queue.leased",
  jobCompleted: "runtime.queue.completed",
  jobFailed: "runtime.queue.failed",
  jobRetryScheduled: "runtime.queue.retry_scheduled",
  jobDeadLettered: "runtime.queue.dead_lettered",
  jobCancelled: "runtime.queue.cancelled",
  jobReleased: "runtime.queue.released",
  budgetExhausted: "runtime.budget.exhausted",
  deadlineExceeded: "runtime.deadline.exceeded",
  // One-click auto-run session markers (never duplicate the stage events above).
  autorunStarted: "runtime.autorun.started",
  autorunWaiting: "runtime.autorun.waiting",
  autorunCompleted: "runtime.autorun.completed",
} as const;

export type RuntimeEventName = (typeof RUNTIME_EVENTS)[keyof typeof RUNTIME_EVENTS];

/** Aggregate types used for per-aggregate event sequencing. */
export const AGGREGATE = {
  run: "intelligence_run",
  stage: "run_stage",
  job: "job_queue",
  reasoning: "reasoning_job",
} as const;

/* ---- result plumbing ---------------------------------------------------------- */
/**
 * Short-circuit helper: returns the error verbatim so a service can propagate a
 * repository failure without inspecting it. Keeps orchestration flat instead of
 * deeply nested, and guarantees no raw error is ever synthesized in a service.
 */
export const failed = <T>(result: RuntimeResult<T>): result is RuntimeErr => !result.ok;

/**
 * `replayed` is a SUCCESS, not a no-op to be ignored: it means the work already
 * happened. Callers use this to decide whether downstream effects still need to
 * run (they do — the effect must be idempotent too) versus whether they created
 * something new (for event emission).
 */
export const wasCreated = <T>(result: RuntimeResult<T>): boolean => result.ok && result.code === "created";
