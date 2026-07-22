/* =============================================================================
 * Runtime persistence PORTS (Phase B · Sprint 13B §1).
 *
 * THIRTEEN aggregate-scoped interfaces, one per runtime aggregate, composed into
 * a single `RuntimeRepository` facade. The split is the contract; the facade is a
 * convenience so a service can depend on exactly the aggregates it touches
 * (`StageRepository & CheckpointRepository`) rather than the whole surface.
 *
 * A thin, tenant-safe persistence boundary. It does NOT decide ids, statuses,
 * timestamps, attribution, or capability — that is the runtime SERVICE's job
 * (Sprint 13C). Mirrors the CoreSurfaceRepository / TransformationRepository
 * pattern: the adapter runs under the caller's RLS-scoped session.
 *
 * NO SQL CONCEPT CROSSES THIS BOUNDARY. Every method returns a `RuntimeResult` —
 * no raw database error escapes, and replay / conflict / not-found / lease-loss
 * are explicit domain outcomes rather than exceptions.
 *
 * IDEMPOTENCY CONTRACT (§4), uniform across every write:
 *   · same key + same canonical payload  → `replayed` with the existing record
 *   · same key + different payload       → `conflict` (never a silent overwrite)
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
import type { RuntimeResult } from "./results.js";

/* ---- inputs ----------------------------------------------------------------- */
/** A queue lease request. `leaseSeconds` bounds the lease (§8). */
export interface LeaseRequest {
  owner: string;
  leaseSeconds: number;
  /** Restrict to a job type; omit to lease any eligible work. */
  jobType?: string | null;
  /** Restrict to one tenant; omit for the caller's full RLS scope. */
  clientId?: string | null;
  now?: string;
}

export interface FailJobInput {
  jobId: string;
  owner: string;
  error: string;
  /** `true` marks the job terminal (dead-letter/failed); `false` allows a retry. */
  terminal: boolean;
  /** When retryable, the absolute time the job becomes eligible again. */
  retryAfter?: string | null;
}

export interface RescheduleInput {
  jobId: string;
  owner: string;
  availableAt: string;
  /** Recorded for audit; the schedule itself is computed by the service. */
  reason: string;
}

export interface AppendEventInput {
  event: Omit<RuntimeEvent, "sequence"> & { sequence?: number };
  /** When omitted, the adapter allocates the next sequence for the aggregate. */
  expectedSequence?: number;
}

export interface ListEventsQuery {
  aggregateType: string;
  aggregateId: string;
  fromSequence?: number;
  limit?: number;
}

/** Filter for listing runs (the product read side). All fields optional. */
export interface ListRunsQuery {
  /** Restrict to one tenant; omit for the caller's full RLS scope. */
  clientId?: string | null;
  /** Restrict to these lifecycle statuses; omit for all. */
  statuses?: readonly RuntimeRunStatus[];
  limit?: number;
}

/* ---- 1 · runs ---------------------------------------------------------------- */
export interface IntelligenceRunRepository {
  createRun(record: RuntimeRun): Promise<RuntimeResult<RuntimeRun>>;
  getRun(id: string): Promise<RuntimeResult<RuntimeRun>>;
  getRunByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeRun>>;
  updateRunStatus(id: string, status: RuntimeRunStatus, patch?: Partial<Pick<RuntimeRun, "currentStage" | "failedStage" | "startedAt" | "completedAt" | "failedAt">>): Promise<RuntimeResult<RuntimeRun>>;
  /** Idempotent: cancelling an already-cancelled run replays; a completed run is `terminal_state`. */
  cancelRun(id: string, at: string): Promise<RuntimeResult<RuntimeRun>>;
  /**
   * The product read side: runs the caller may see, newest first. Tenant/status
   * filters are applied in-query; RLS is still the real boundary, so a client
   * role sees nothing on these internal-only tables regardless of `clientId`.
   */
  listRuns(query: ListRunsQuery): Promise<RuntimeResult<RuntimeRun[]>>;
}

/* ---- 2 · stages -------------------------------------------------------------- */
/** Stage transitions are APPEND-ONLY — a transition is never rewritten in place. */
export interface StageRepository {
  appendStageTransition(record: RuntimeStage): Promise<RuntimeResult<RuntimeStage>>;
  getLatestStage(runId: string): Promise<RuntimeResult<RuntimeStage>>;
  listStages(runId: string): Promise<RuntimeResult<RuntimeStage[]>>;
}

/* ---- 3 · checkpoints --------------------------------------------------------- */
/**
 * Resume metadata: completed stage, attempt, next stage, source checksums and the
 * artifacts that stage produced. Historical checkpoints are NEVER overwritten —
 * superseding one marks it invalid and retains it for audit.
 */
export interface CheckpointRepository {
  saveCheckpoint(record: RuntimeCheckpoint): Promise<RuntimeResult<RuntimeCheckpoint>>;
  getLatestValidCheckpoint(runId: string): Promise<RuntimeResult<RuntimeCheckpoint>>;
  /** Marks checkpoints invalid (retained for audit, never deleted). Returns the affected ids. */
  invalidateCheckpoints(runId: string, fromStage: string, reason: string): Promise<RuntimeResult<string[]>>;
}

/* ---- 4 · artifacts ----------------------------------------------------------- */
/**
 * Artifacts are IMMUTABLE. There is deliberately no update method: a change is a
 * new row at `version + 1` carrying its own checksum, with `sourceArtifactIds`
 * preserving lineage back to what produced it.
 */
export interface ArtifactRepository {
  saveArtifact(record: RuntimeArtifact): Promise<RuntimeResult<RuntimeArtifact>>;
  getArtifact(id: string): Promise<RuntimeResult<RuntimeArtifact>>;
  listArtifactsByKind(runId: string, kind: RuntimeArtifactKind): Promise<RuntimeResult<RuntimeArtifact[]>>;
}

/* ---- 5 · reasoning jobs ------------------------------------------------------- */
export interface ReasoningJobRepository {
  createReasoningJob(record: RuntimeReasoningJob): Promise<RuntimeResult<RuntimeReasoningJob>>;
  getReasoningJob(id: string): Promise<RuntimeResult<RuntimeReasoningJob>>;
  updateReasoningJobStatus(id: string, status: RuntimeReasoningJobStatus, patch?: Partial<Pick<RuntimeReasoningJob, "attempt" | "startedAt" | "completedAt" | "failedAt" | "cancelledAt">>): Promise<RuntimeResult<RuntimeReasoningJob>>;
}

/* ---- 6 · provider attempts ---------------------------------------------------- */
/**
 * The per-attempt provider ledger: provider, attempt, latency, usage, cost,
 * validation outcome, failure and finish reason.
 *
 * RAW MODEL OUTPUT IS NEVER STORED. `rawResponseRef` is a REFERENCE only — the
 * record carries no completion text and no chain-of-thought.
 */
export interface ProviderAttemptRepository {
  recordProviderAttempt(record: RuntimeProviderAttempt): Promise<RuntimeResult<RuntimeProviderAttempt>>;
  listProviderAttempts(reasoningJobId: string): Promise<RuntimeResult<RuntimeProviderAttempt[]>>;
}

/* ---- 7 · findings ------------------------------------------------------------- */
export interface FindingRepository {
  saveFinding(record: RuntimeFinding): Promise<RuntimeResult<RuntimeFinding>>;
  listFindings(runId: string): Promise<RuntimeResult<RuntimeFinding[]>>;
}

/* ---- 8 · recommendations ------------------------------------------------------ */
export interface RecommendationRepository {
  saveRecommendation(record: RuntimeRecommendation): Promise<RuntimeResult<RuntimeRecommendation>>;
  listRecommendations(runId: string): Promise<RuntimeResult<RuntimeRecommendation[]>>;
}

/* ---- 9 · competitor snapshots -------------------------------------------------- */
export interface CompetitorSnapshotRepository {
  saveCompetitorSnapshot(record: RuntimeCompetitorSnapshot): Promise<RuntimeResult<RuntimeCompetitorSnapshot>>;
}

/* ---- 10 · proposal versions ---------------------------------------------------- */
/** Versioned and immutable; `supersedesId` preserves the lineage chain. */
export interface ProposalVersionRepository {
  saveProposalVersion(record: RuntimeProposalVersion): Promise<RuntimeResult<RuntimeProposalVersion>>;
  getLatestProposalVersion(runId: string): Promise<RuntimeResult<RuntimeProposalVersion>>;
}

/* ---- 11 · narrative versions --------------------------------------------------- */
/** Versioned per audience and immutable; `supersedesId` preserves the lineage chain. */
export interface NarrativeVersionRepository {
  saveNarrativeVersion(record: RuntimeNarrativeVersion): Promise<RuntimeResult<RuntimeNarrativeVersion>>;
  getLatestNarrativeVersion(runId: string, audience: string): Promise<RuntimeResult<RuntimeNarrativeVersion>>;
}

/* ---- 12 · runtime events (append-only) ------------------------------------------ */
/**
 * APPEND ONLY. There is deliberately no update and no delete method — the
 * database enforces the same rule with revoked privileges, no UPDATE/DELETE
 * policy, and an immutability trigger.
 */
export interface RuntimeEventRepository {
  /** Allocates the next per-aggregate sequence atomically; a race returns `serialization_conflict`. */
  appendRuntimeEvent(input: AppendEventInput): Promise<RuntimeResult<RuntimeEvent>>;
  listRuntimeEvents(query: ListEventsQuery): Promise<RuntimeResult<RuntimeEvent[]>>;
}

/* ---- 13 · job queue ------------------------------------------------------------ */
/**
 * Postgres-backed queue — no Redis, no BullMQ, no hosted provider. Leasing is a
 * single `FOR UPDATE SKIP LOCKED` statement (§5).
 */
export interface JobQueueRepository {
  enqueueJob(record: RuntimeQueueJob): Promise<RuntimeResult<RuntimeQueueJob>>;
  getJob(id: string): Promise<RuntimeResult<RuntimeQueueJob>>;
  /**
   * ATOMIC lease (§5). One statement: the next eligible job is selected with
   * `FOR UPDATE SKIP LOCKED` and marked leased in the same round trip, so two
   * workers can never take the same row. Returns `no_job_available` when nothing
   * qualifies — that is a normal outcome, not an error.
   */
  leaseNextEligibleJob(request: LeaseRequest): Promise<RuntimeResult<RuntimeQueueJob>>;
  /** Owner-only, active-lease-only, bounded extension. `lease_lost` otherwise. */
  renewLease(jobId: string, owner: string, leaseSeconds: number): Promise<RuntimeResult<RuntimeQueueJob>>;
  /** Owner-only. Returns the job to `queued` (or `cancelled` when the run is cancelled). */
  releaseLease(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>>;
  /** Owner-only, leased-only. */
  completeJob(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>>;
  /** Owner-only. Persists the structured failure and the terminal/retryable disposition. */
  failJob(input: FailJobInput): Promise<RuntimeResult<RuntimeQueueJob>>;
  /** Idempotent; a terminal job returns `terminal_state`. */
  cancelJob(jobId: string): Promise<RuntimeResult<RuntimeQueueJob>>;
  /** Owner-only. Pushes `available_at` out for a retry. */
  rescheduleJob(input: RescheduleInput): Promise<RuntimeResult<RuntimeQueueJob>>;
  /**
   * Reset the job for (runId, stage, jobType) from a NON-PROGRESSING state
   * (`failed` / `dead_letter` / `cancelled`) back to `queued`, so recovery can
   * re-drive a failed stage. Clears the lease, resets the attempt counter, and
   * makes it eligible now.
   *
   * Returns `not_found` when there is no resettable job — either none exists, or
   * the job is already active (`queued`/`leased`), in which case there is nothing
   * to retry. NOT owner-gated: retry is a supervisory action, not a lease
   * operation, and no worker holds the lease on a dead job.
   */
  requeueJob(runId: string, stage: string, jobType: string, availableAt: string): Promise<RuntimeResult<RuntimeQueueJob>>;
  /**
   * A NON-mutating peek at queue depth for a dry-run eligibility check: how many
   * jobs are `eligible` (queued AND available now), plus the raw `queued` and
   * `leased` counts. Does not lease, lock, or mutate anything — safe to call
   * before deciding whether a turn is worth running.
   */
  queueDepth(jobType: string, clientId: string | null, now: string): Promise<RuntimeResult<QueueDepthCounts>>;
}

/** Counts returned by `queueDepth`. */
export interface QueueDepthCounts {
  eligible: number;
  queued: number;
  leased: number;
}

/* ---- the composed facade -------------------------------------------------------- */
/**
 * Every runtime aggregate behind one binding. A service should depend on the
 * NARROWEST composition it needs — `IntelligenceRunRepository & StageRepository`
 * for a stage advancer — and reserve this facade for wiring.
 *
 * `resolveUserId` sits here rather than on an aggregate: it is cross-cutting
 * attribution support, not a runtime aggregate of its own.
 */
export interface RuntimeRepository
  extends IntelligenceRunRepository,
    StageRepository,
    CheckpointRepository,
    ArtifactRepository,
    ReasoningJobRepository,
    ProviderAttemptRepository,
    FindingRepository,
    RecommendationRepository,
    CompetitorSnapshotRepository,
    ProposalVersionRepository,
    NarrativeVersionRepository,
    RuntimeEventRepository,
    JobQueueRepository {
  /** Resolve `public.users.id` from an auth user id, for `created_by` attribution. */
  resolveUserId(authUserId: string): Promise<RuntimeResult<string | null>>;
}
