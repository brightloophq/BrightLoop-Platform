/* =============================================================================
 * InMemoryRuntimeRepository (Phase B · Sprint 13C) — the deterministic double.
 *
 * Deferred from Sprint 13B §11 ("only if it directly supports future service
 * tests") — the runtime services are those tests, so it lands now, shaped by
 * what they actually need.
 *
 * IT MUST MIRROR THE REAL ADAPTER'S SEMANTICS, not merely store rows. A double
 * that is more permissive than production turns green tests into false comfort.
 * So it reproduces, deliberately:
 *   · idempotency — replay on identical payload, CONFLICT on a changed one;
 *   · lease ownership — a non-owner gets `lease_lost`, never a silent success;
 *   · lease EXPIRY — an expired lease stops protecting the row;
 *   · terminal states — a completed/cancelled/dead-lettered job cannot move;
 *   · event sequencing — monotonic per aggregate, duplicates rejected.
 *
 * Time is injected, never read from the system clock, so every test is
 * reproducible.
 * ========================================================================== */

import type {
  RuntimeArtifact,
  RuntimeArtifactKind,
  RuntimeCheckpoint,
  RuntimeCompetitorSnapshot,
  RuntimeEvent,
  RuntimeFinding,
  RuntimeNarrativeVersion,
  RuntimeProposalVersion,
  RuntimeProviderAttempt,
  RuntimeQueueJob,
  RuntimeReasoningJob,
  RuntimeReasoningJobStatus,
  RuntimeRecommendation,
  RuntimeRun,
  RuntimeRunStatus,
  RuntimeStage,
} from "@brightloop/schema";
import type {
  AppendEventInput,
  FailJobInput,
  LeaseRequest,
  ListEventsQuery,
  RescheduleInput,
  RuntimeRepository,
} from "../repository.js";
import { err, ok, type RuntimeResult } from "../results.js";

/** Jobs in these states cannot be leased, completed, failed or cancelled again. */
const TERMINAL_QUEUE = new Set<RuntimeQueueJob["status"]>(["completed", "cancelled", "dead_letter"]);
const TERMINAL_RUN = new Set<RuntimeRunStatus>(["completed", "failed", "cancelled"]);

/** A keyed store that reproduces the adapter's replay-vs-conflict behaviour. */
class IdempotentStore<T extends { id: string; idempotencyKey: string }> {
  readonly rows = new Map<string, T>();
  private readonly byKey = new Map<string, string>();

  /** @param fingerprint canonical payload identity — what "same write" means. */
  constructor(private readonly fingerprint: (row: T) => string) {}

  insert(row: T): RuntimeResult<T> {
    const existingId = this.byKey.get(row.idempotencyKey);
    if (existingId !== undefined) {
      const existing = this.rows.get(existingId)!;
      return this.fingerprint(existing) === this.fingerprint(row)
        ? ok("replayed", existing)
        : err("conflict", `idempotency key ${row.idempotencyKey} reused with a different payload`);
    }
    this.rows.set(row.id, row);
    this.byKey.set(row.idempotencyKey, row.id);
    return ok("created", row);
  }

  get(id: string): T | null {
    return this.rows.get(id) ?? null;
  }

  byIdempotencyKey(key: string): T | null {
    const id = this.byKey.get(key);
    return id === undefined ? null : (this.rows.get(id) ?? null);
  }

  all(): T[] {
    return [...this.rows.values()];
  }

  replace(row: T): void {
    this.rows.set(row.id, row);
  }
}

export class InMemoryRuntimeRepository implements RuntimeRepository {
  private readonly runs = new IdempotentStore<RuntimeRun>((r) => JSON.stringify([r.scanId, r.clientId, r.checksum]));
  private readonly stages = new IdempotentStore<RuntimeStage>((r) => JSON.stringify([r.runId, r.stage, r.attempt, r.status]));
  private readonly checkpoints = new IdempotentStore<RuntimeCheckpoint>((r) => JSON.stringify([r.runId, r.stage, r.attempt, [...r.artifactIds].sort()]));
  private readonly artifacts = new IdempotentStore<RuntimeArtifact>((r) => JSON.stringify([r.runId, r.kind, r.version, r.checksum]));
  private readonly reasoning = new IdempotentStore<RuntimeReasoningJob>((r) => JSON.stringify([r.runId, r.stage, r.taskType]));
  private readonly attempts = new IdempotentStore<RuntimeProviderAttempt>((r) => JSON.stringify([r.reasoningJobId, r.attempt, r.providerId]));
  private readonly findings = new IdempotentStore<RuntimeFinding>((r) => JSON.stringify([r.runId, r.checksum, r.version]));
  private readonly recommendations = new IdempotentStore<RuntimeRecommendation>((r) => JSON.stringify([r.runId, r.checksum, r.version]));
  private readonly competitors = new IdempotentStore<RuntimeCompetitorSnapshot>((r) => JSON.stringify([r.runId, r.version, r.checksum]));
  private readonly proposals = new IdempotentStore<RuntimeProposalVersion>((r) => JSON.stringify([r.runId, r.version, r.checksum]));
  private readonly narratives = new IdempotentStore<RuntimeNarrativeVersion>((r) => JSON.stringify([r.runId, r.audience, r.version, r.checksum]));
  private readonly jobs = new IdempotentStore<RuntimeQueueJob>((r) => JSON.stringify([r.jobType, r.runId, r.stage]));
  private readonly events: RuntimeEvent[] = [];

  /** Injected clock — no system time anywhere in this double. */
  constructor(private now: () => string) {}

  /** Advance the double's clock (tests use this for lease expiry and deadlines). */
  setNow(now: () => string): void {
    this.now = now;
  }

  async resolveUserId(authUserId: string): Promise<RuntimeResult<string | null>> {
    return ok("found", authUserId);
  }

  /* ---- runs ------------------------------------------------------------------ */
  async createRun(record: RuntimeRun): Promise<RuntimeResult<RuntimeRun>> {
    return this.runs.insert(record);
  }

  async getRun(id: string): Promise<RuntimeResult<RuntimeRun>> {
    const row = this.runs.get(id);
    return row === null ? err("not_found", `run ${id} not found`) : ok("found", row);
  }

  async getRunByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeRun>> {
    const row = this.runs.byIdempotencyKey(key);
    return row === null ? err("not_found", `run for key ${key} not found`) : ok("found", row);
  }

  async updateRunStatus(
    id: string,
    status: RuntimeRunStatus,
    patch: Partial<Pick<RuntimeRun, "currentStage" | "failedStage" | "startedAt" | "completedAt" | "failedAt">> = {},
  ): Promise<RuntimeResult<RuntimeRun>> {
    const row = this.runs.get(id);
    if (row === null) return err("not_found", `run ${id} not found`);
    if (TERMINAL_RUN.has(row.status)) return err("terminal_state", `run ${id} is ${row.status}`);
    const next = { ...row, ...patch, status, updatedAt: this.now() };
    this.runs.replace(next);
    return ok("updated", next);
  }

  async cancelRun(id: string, at: string): Promise<RuntimeResult<RuntimeRun>> {
    const row = this.runs.get(id);
    if (row === null) return err("not_found", `run ${id} not found`);
    if (row.status === "cancelled") return ok("replayed", row);
    if (TERMINAL_RUN.has(row.status)) return err("terminal_state", `run ${id} is ${row.status}`);
    const next = { ...row, status: "cancelled" as const, cancelled: true, cancelledAt: at, updatedAt: at };
    this.runs.replace(next);
    return ok("updated", next);
  }

  /* ---- stages ---------------------------------------------------------------- */
  async appendStageTransition(record: RuntimeStage): Promise<RuntimeResult<RuntimeStage>> {
    return this.stages.insert(record);
  }

  async getLatestStage(runId: string): Promise<RuntimeResult<RuntimeStage>> {
    const rows = this.stages.all().filter((s) => s.runId === runId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = rows[rows.length - 1];
    return last === undefined ? err("not_found", `no stages for run ${runId}`) : ok("found", last);
  }

  async listStages(runId: string): Promise<RuntimeResult<RuntimeStage[]>> {
    return ok("found", this.stages.all().filter((s) => s.runId === runId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  /* ---- checkpoints ------------------------------------------------------------ */
  async saveCheckpoint(record: RuntimeCheckpoint): Promise<RuntimeResult<RuntimeCheckpoint>> {
    return this.checkpoints.insert(record);
  }

  async getLatestValidCheckpoint(runId: string): Promise<RuntimeResult<RuntimeCheckpoint>> {
    const rows = this.checkpoints
      .all()
      .filter((c) => c.runId === runId && c.status === "valid")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = rows[rows.length - 1];
    return last === undefined ? err("not_found", `no valid checkpoint for run ${runId}`) : ok("found", last);
  }

  /** Marks rows invalid and RETAINS them — history is never destroyed. */
  async invalidateCheckpoints(runId: string, fromStage: string, reason: string): Promise<RuntimeResult<string[]>> {
    const affected: string[] = [];
    for (const c of this.checkpoints.all()) {
      if (c.runId !== runId || c.status !== "valid") continue;
      if (c.stage < fromStage) continue;
      this.checkpoints.replace({ ...c, status: "invalidated", invalidationReason: reason });
      affected.push(c.id);
    }
    return ok("updated", affected.sort());
  }

  /* ---- artifacts --------------------------------------------------------------- */
  async saveArtifact(record: RuntimeArtifact): Promise<RuntimeResult<RuntimeArtifact>> {
    return this.artifacts.insert(record);
  }

  async getArtifact(id: string): Promise<RuntimeResult<RuntimeArtifact>> {
    const row = this.artifacts.get(id);
    return row === null ? err("not_found", `artifact ${id} not found`) : ok("found", row);
  }

  async listArtifactsByKind(runId: string, kind: RuntimeArtifactKind): Promise<RuntimeResult<RuntimeArtifact[]>> {
    return ok("found", this.artifacts.all().filter((a) => a.runId === runId && a.kind === kind).sort((a, b) => a.version - b.version));
  }

  /* ---- reasoning ----------------------------------------------------------------- */
  async createReasoningJob(record: RuntimeReasoningJob): Promise<RuntimeResult<RuntimeReasoningJob>> {
    return this.reasoning.insert(record);
  }

  async getReasoningJob(id: string): Promise<RuntimeResult<RuntimeReasoningJob>> {
    const row = this.reasoning.get(id);
    return row === null ? err("not_found", `reasoning job ${id} not found`) : ok("found", row);
  }

  async updateReasoningJobStatus(
    id: string,
    status: RuntimeReasoningJobStatus,
    patch: Partial<Pick<RuntimeReasoningJob, "attempt" | "startedAt" | "completedAt" | "failedAt" | "cancelledAt">> = {},
  ): Promise<RuntimeResult<RuntimeReasoningJob>> {
    const row = this.reasoning.get(id);
    if (row === null) return err("not_found", `reasoning job ${id} not found`);
    const next = { ...row, ...patch, status, updatedAt: this.now() };
    this.reasoning.replace(next);
    return ok("updated", next);
  }

  /* ---- provider attempts ------------------------------------------------------------ */
  async recordProviderAttempt(record: RuntimeProviderAttempt): Promise<RuntimeResult<RuntimeProviderAttempt>> {
    return this.attempts.insert(record);
  }

  async listProviderAttempts(reasoningJobId: string): Promise<RuntimeResult<RuntimeProviderAttempt[]>> {
    return ok("found", this.attempts.all().filter((a) => a.reasoningJobId === reasoningJobId).sort((a, b) => a.attempt - b.attempt));
  }

  /* ---- derived records ---------------------------------------------------------------- */
  async saveFinding(record: RuntimeFinding): Promise<RuntimeResult<RuntimeFinding>> {
    return this.findings.insert(record);
  }

  async listFindings(runId: string): Promise<RuntimeResult<RuntimeFinding[]>> {
    return ok("found", this.findings.all().filter((f) => f.runId === runId));
  }

  async saveRecommendation(record: RuntimeRecommendation): Promise<RuntimeResult<RuntimeRecommendation>> {
    return this.recommendations.insert(record);
  }

  async listRecommendations(runId: string): Promise<RuntimeResult<RuntimeRecommendation[]>> {
    return ok("found", this.recommendations.all().filter((r) => r.runId === runId));
  }

  async saveCompetitorSnapshot(record: RuntimeCompetitorSnapshot): Promise<RuntimeResult<RuntimeCompetitorSnapshot>> {
    return this.competitors.insert(record);
  }

  async saveProposalVersion(record: RuntimeProposalVersion): Promise<RuntimeResult<RuntimeProposalVersion>> {
    return this.proposals.insert(record);
  }

  async saveNarrativeVersion(record: RuntimeNarrativeVersion): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    return this.narratives.insert(record);
  }

  async getLatestProposalVersion(runId: string): Promise<RuntimeResult<RuntimeProposalVersion>> {
    const rows = this.proposals.all().filter((p) => p.runId === runId).sort((a, b) => a.version - b.version);
    const last = rows[rows.length - 1];
    return last === undefined ? err("not_found", `no proposal for run ${runId}`) : ok("found", last);
  }

  async getLatestNarrativeVersion(runId: string, audience: string): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    const rows = this.narratives.all().filter((n) => n.runId === runId && n.audience === audience).sort((a, b) => a.version - b.version);
    const last = rows[rows.length - 1];
    return last === undefined ? err("not_found", `no narrative for run ${runId}/${audience}`) : ok("found", last);
  }

  /* ---- queue -------------------------------------------------------------------------- */
  async enqueueJob(record: RuntimeQueueJob): Promise<RuntimeResult<RuntimeQueueJob>> {
    return this.jobs.insert(record);
  }

  async getJob(id: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const row = this.jobs.get(id);
    return row === null ? err("not_found", `job ${id} not found`) : ok("found", row);
  }

  /**
   * Mirrors the atomic RPC's SELECTION rule: eligible = queued (or an EXPIRED
   * lease), available now, ordered by priority → availableAt → createdAt.
   * Single-threaded JS makes the claim itself atomic here.
   */
  async leaseNextEligibleJob(request: LeaseRequest): Promise<RuntimeResult<RuntimeQueueJob>> {
    const now = request.now ?? this.now();
    const eligible = this.jobs
      .all()
      .filter((j) => {
        if (request.jobType != null && j.jobType !== request.jobType) return false;
        if (request.clientId != null && j.clientId !== request.clientId) return false;
        if (j.availableAt > now) return false;
        if (j.status === "queued") return true;
        // an expired lease returns the row to the pool without a sweeper
        return j.status === "leased" && j.leaseExpiresAt !== null && now >= j.leaseExpiresAt;
      })
      .sort((a, b) => a.priority - b.priority || a.availableAt.localeCompare(b.availableAt) || a.createdAt.localeCompare(b.createdAt));

    const job = eligible[0];
    if (job === undefined) return err("no_job_available", "no eligible job");

    const leased: RuntimeQueueJob = {
      ...job,
      status: "leased",
      leaseOwner: request.owner,
      leaseExpiresAt: new Date(new Date(now).getTime() + Math.max(request.leaseSeconds, 1) * 1000).toISOString(),
      attempt: job.attempt + 1,
      updatedAt: now,
    };
    this.jobs.replace(leased);
    return ok("leased", leased);
  }

  async renewLease(jobId: string, owner: string, leaseSeconds: number): Promise<RuntimeResult<RuntimeQueueJob>> {
    const held = this.heldBy(jobId, owner);
    if (!held.ok) return held;
    const now = this.now();
    const next = {
      ...held.value,
      leaseExpiresAt: new Date(new Date(now).getTime() + Math.max(leaseSeconds, 1) * 1000).toISOString(),
      updatedAt: now,
    };
    this.jobs.replace(next);
    return ok("updated", next);
  }

  async releaseLease(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const held = this.heldBy(jobId, owner);
    if (!held.ok) return held;
    // a release does NOT consume an attempt — the work was never tried
    const next = {
      ...held.value,
      status: "queued" as const,
      leaseOwner: null,
      leaseExpiresAt: null,
      attempt: Math.max(0, held.value.attempt - 1),
      updatedAt: this.now(),
    };
    this.jobs.replace(next);
    return ok("released", next);
  }

  async completeJob(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const held = this.heldBy(jobId, owner);
    if (!held.ok) return held;
    const next = { ...held.value, status: "completed" as const, leaseOwner: null, leaseExpiresAt: null, updatedAt: this.now() };
    this.jobs.replace(next);
    return ok("updated", next);
  }

  async failJob(input: FailJobInput): Promise<RuntimeResult<RuntimeQueueJob>> {
    const held = this.heldBy(input.jobId, input.owner);
    if (!held.ok) return held;
    const next: RuntimeQueueJob = {
      ...held.value,
      status: input.terminal ? "dead_letter" : "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: input.retryAfter ?? held.value.availableAt,
      lastError: input.error,
      updatedAt: this.now(),
    };
    this.jobs.replace(next);
    return ok("updated", next);
  }

  async cancelJob(jobId: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const row = this.jobs.get(jobId);
    if (row === null) return err("not_found", `job ${jobId} not found`);
    if (row.status === "cancelled") return ok("replayed", row);
    if (TERMINAL_QUEUE.has(row.status)) return err("terminal_state", `job ${jobId} is ${row.status}`);
    const next = { ...row, status: "cancelled" as const, leaseOwner: null, leaseExpiresAt: null, updatedAt: this.now() };
    this.jobs.replace(next);
    return ok("updated", next);
  }

  async rescheduleJob(input: RescheduleInput): Promise<RuntimeResult<RuntimeQueueJob>> {
    const held = this.heldBy(input.jobId, input.owner);
    if (!held.ok) return held;
    const next = {
      ...held.value,
      status: "queued" as const,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: input.availableAt,
      lastError: input.reason,
      updatedAt: this.now(),
    };
    this.jobs.replace(next);
    return ok("updated", next);
  }

  /* ---- events (append-only) --------------------------------------------------------- */
  async appendRuntimeEvent(input: AppendEventInput): Promise<RuntimeResult<RuntimeEvent>> {
    const { event, expectedSequence } = input;
    const existing = this.events.filter(
      (e) => e.aggregateType === event.aggregateType && e.aggregateId === event.aggregateId,
    );
    const nextSequence = expectedSequence ?? event.sequence ?? existing.length + 1;

    if (existing.some((e) => e.sequence === nextSequence)) {
      return err("serialization_conflict", `sequence ${nextSequence} already exists for ${event.aggregateType}/${event.aggregateId}`);
    }
    const row: RuntimeEvent = { ...event, sequence: nextSequence };
    this.events.push(row);
    return ok("created", row);
  }

  async listRuntimeEvents(query: ListEventsQuery): Promise<RuntimeResult<RuntimeEvent[]>> {
    const rows = this.events
      .filter((e) => e.aggregateType === query.aggregateType && e.aggregateId === query.aggregateId)
      .filter((e) => (query.fromSequence === undefined ? true : e.sequence >= query.fromSequence))
      .sort((a, b) => a.sequence - b.sequence);
    return ok("found", query.limit === undefined ? rows : rows.slice(0, query.limit));
  }

  /* ---- test inspection ------------------------------------------------------------------ */
  /** All jobs, for read-model assertions. Not part of the port. */
  allJobs(): RuntimeQueueJob[] {
    return this.jobs.all();
  }

  allRuns(): RuntimeRun[] {
    return this.runs.all();
  }

  allArtifacts(): RuntimeArtifact[] {
    return this.artifacts.all();
  }

  allEvents(): RuntimeEvent[] {
    return [...this.events];
  }

  allCheckpoints(): RuntimeCheckpoint[] {
    return this.checkpoints.all();
  }

  /* ---- internals ------------------------------------------------------------------------- */
  /**
   * Ownership + liveness, exactly as the adapter re-asserts it in-statement:
   * the row must be leased, held by this owner, and NOT expired.
   */
  private heldBy(jobId: string, owner: string): RuntimeResult<RuntimeQueueJob> {
    const row = this.jobs.get(jobId);
    if (row === null) return err("not_found", `job ${jobId} not found`);
    if (TERMINAL_QUEUE.has(row.status)) return err("terminal_state", `job ${jobId} is ${row.status}`);
    if (row.status !== "leased" || row.leaseOwner !== owner) {
      return err("lease_lost", `job ${jobId} is not leased by ${owner}`);
    }
    if (row.leaseExpiresAt !== null && this.now() >= row.leaseExpiresAt) {
      return err("lease_lost", `lease on job ${jobId} expired at ${row.leaseExpiresAt}`);
    }
    return ok("found", row);
  }
}
