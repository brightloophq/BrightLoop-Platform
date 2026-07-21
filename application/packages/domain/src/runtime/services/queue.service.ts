/* =============================================================================
 * QueueService (Phase B · Sprint 13C) — orchestration ONLY.
 *
 * The hard concurrency guarantee already lives in the repository: leasing is a
 * single `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)`
 * statement, and every ownership check is re-asserted inside the statement that
 * mutates the row. This service NEVER re-implements or works around that — it
 * sequences calls, decides retry vs dead-letter, and emits events.
 *
 * No Redis. No BullMQ. No Temporal. No hosted queue. Postgres is the queue.
 *
 * Lease expiry needs no sweeper: an expired lease simply stops matching the
 * `lease_owner`-scoped update, and the row becomes eligible again on its own.
 * ========================================================================== */

import type { RuntimeQueueJob } from "@brightloop/schema";
import type { FailJobInput, JobQueueRepository, LeaseRequest } from "../repository.js";
import { type RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { AGGREGATE, queueKey, RUNTIME_EVENTS, type RuntimeServiceContext } from "./support.js";

export interface EnqueueInput {
  jobType: string;
  clientId: string | null;
  runId: string;
  scanId: string;
  stage: string;
  priority?: number;
  /** Absolute time the job becomes eligible. Defaults to now. */
  availableAt?: string;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
  payloadRef?: string | null;
}

/** Exponential backoff with a ceiling. Pure and deterministic — no jitter. */
export function backoffMsFor(attempt: number, baseMs = 1_000, ceilingMs = 300_000): number {
  const raw = baseMs * 2 ** Math.max(0, attempt);
  return Math.min(raw, ceilingMs);
}

export class QueueService {
  constructor(
    private readonly repo: JobQueueRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /**
   * Enqueue work. The key is derived from (jobType, runId, stage), so enqueueing
   * the same unit of work twice REPLAYS rather than creating a duplicate job —
   * this is the primary defence against double execution after a crash.
   */
  async enqueue(input: EnqueueInput): Promise<RuntimeResult<RuntimeQueueJob>> {
    const now = this.ctx.clock();
    const record: RuntimeQueueJob = {
      id: this.ctx.ids("job"),
      jobType: input.jobType,
      clientId: input.clientId,
      runId: input.runId,
      scanId: input.scanId,
      stage: input.stage,
      priority: input.priority ?? 5,
      status: "queued",
      availableAt: input.availableAt ?? now,
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 5,
      leaseOwner: null,
      leaseExpiresAt: null,
      idempotencyKey: queueKey(input.jobType, input.runId, input.stage),
      payloadRef: input.payloadRef ?? null,
      payload: input.payload ?? {},
      lastError: null,
      createdAt: now,
      updatedAt: null,
    };

    const result = await this.repo.enqueueJob(record);
    if (result.ok && result.code === "created") {
      await this.emitJob(RUNTIME_EVENTS.jobEnqueued, result.value, { jobType: input.jobType, stage: input.stage });
    }
    return result;
  }

  /**
   * Atomically lease the next eligible job. `no_job_available` is a NORMAL
   * outcome (an idle queue), not an error condition.
   */
  async lease(request: LeaseRequest): Promise<RuntimeResult<RuntimeQueueJob>> {
    const result = await this.repo.leaseNextEligibleJob(request);
    if (result.ok) {
      await this.emitJob(RUNTIME_EVENTS.jobLeased, result.value, {
        owner: request.owner,
        attempt: result.value.attempt,
      });
    }
    return result;
  }

  /** Extend an active lease. Owner-only — a lost lease returns `lease_lost`. */
  async renew(jobId: string, owner: string, leaseSeconds: number): Promise<RuntimeResult<RuntimeQueueJob>> {
    return this.repo.renewLease(jobId, owner, leaseSeconds);
  }

  /** Return the job to the queue without consuming an attempt. */
  async release(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const result = await this.repo.releaseLease(jobId, owner);
    if (result.ok) await this.emitJob(RUNTIME_EVENTS.jobReleased, result.value, { owner });
    return result;
  }

  async complete(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const result = await this.repo.completeJob(jobId, owner);
    if (result.ok) await this.emitJob(RUNTIME_EVENTS.jobCompleted, result.value, { owner });
    return result;
  }

  /**
   * Fail a job and decide its disposition.
   *
   * `fatal` or an exhausted attempt budget → terminal (dead-letter). Otherwise a
   * retry is scheduled at a deterministic exponential backoff. The decision is
   * recorded as an event either way, so the queue's behaviour is auditable
   * rather than inferred from row state.
   */
  async fail(
    job: RuntimeQueueJob,
    owner: string,
    error: string,
    options: { fatal?: boolean } = {},
  ): Promise<RuntimeResult<RuntimeQueueJob>> {
    const attemptsExhausted = job.attempt >= job.maxAttempts;
    const terminal = Boolean(options.fatal) || attemptsExhausted;

    const input: FailJobInput = {
      jobId: job.id,
      owner,
      error,
      terminal,
      retryAfter: terminal ? null : this.retryAt(job.attempt),
    };

    const result = await this.repo.failJob(input);
    if (!result.ok) return result;

    await this.emitJob(RUNTIME_EVENTS.jobFailed, result.value, { error, attempt: job.attempt, terminal });
    await this.emitJob(
      terminal ? RUNTIME_EVENTS.jobDeadLettered : RUNTIME_EVENTS.jobRetryScheduled,
      result.value,
      terminal
        ? { reason: options.fatal ? "fatal" : "attempts_exhausted", attempts: job.attempt }
        : { retryAfter: input.retryAfter, attempt: job.attempt },
    );
    return result;
  }

  /** Cancel a job. Idempotent; a terminal job returns `terminal_state`. */
  async cancel(jobId: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const result = await this.repo.cancelJob(jobId);
    if (result.ok && result.code !== "replayed") {
      await this.emitJob(RUNTIME_EVENTS.jobCancelled, result.value, {});
    }
    return result;
  }

  /** Push a job's eligibility out explicitly (owner-only). */
  async reschedule(jobId: string, owner: string, availableAt: string, reason: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    return this.repo.rescheduleJob({ jobId, owner, availableAt, reason });
  }

  async get(jobId: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    return this.repo.getJob(jobId);
  }

  /** The absolute time the next attempt becomes eligible. Deterministic. */
  retryAt(attempt: number, now: string = this.ctx.clock()): string {
    return new Date(new Date(now).getTime() + backoffMsFor(attempt)).toISOString();
  }

  /* ---- internals ----------------------------------------------------------- */
  private async emitJob(
    eventType: (typeof RUNTIME_EVENTS)[keyof typeof RUNTIME_EVENTS],
    job: RuntimeQueueJob,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateType: AGGREGATE.job,
      aggregateId: job.id,
      clientId: job.clientId,
      runId: job.runId,
      scanId: job.scanId,
      stage: job.stage,
      payload,
    });
  }
}
