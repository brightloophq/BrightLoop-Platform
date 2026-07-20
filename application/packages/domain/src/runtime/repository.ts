/* =============================================================================
 * RuntimeRepository — the PORT for Phase B runtime persistence (Sprint 13B §1).
 *
 * A thin, tenant-safe persistence boundary. It does NOT decide ids, statuses,
 * timestamps, attribution, or capability — that is the runtime SERVICE's job
 * (Sprint 13C). Mirrors the CoreSurfaceRepository / TransformationRepository
 * pattern: the adapter runs under the caller's RLS-scoped session.
 *
 * EVERY method returns a `RuntimeResult` — no raw database error crosses this
 * boundary, and replay / conflict / not-found / lease-loss are explicit.
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

/* ---- the port --------------------------------------------------------------- */
export interface RuntimeRepository {
  /** Resolve `public.users.id` from an auth user id, for `created_by` attribution. */
  resolveUserId(authUserId: string): Promise<RuntimeResult<string | null>>;

  // ---- runs ----------------------------------------------------------------
  createRun(record: RuntimeRun): Promise<RuntimeResult<RuntimeRun>>;
  getRun(id: string): Promise<RuntimeResult<RuntimeRun>>;
  getRunByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeRun>>;
  updateRunStatus(id: string, status: RuntimeRunStatus, patch?: Partial<Pick<RuntimeRun, "currentStage" | "failedStage" | "startedAt" | "completedAt" | "failedAt">>): Promise<RuntimeResult<RuntimeRun>>;
  /** Idempotent: cancelling an already-cancelled run replays; a completed run is `terminal_state`. */
  cancelRun(id: string, at: string): Promise<RuntimeResult<RuntimeRun>>;

  // ---- stages --------------------------------------------------------------
  appendStageTransition(record: RuntimeStage): Promise<RuntimeResult<RuntimeStage>>;
  getLatestStage(runId: string): Promise<RuntimeResult<RuntimeStage>>;
  listStages(runId: string): Promise<RuntimeResult<RuntimeStage[]>>;

  // ---- checkpoints ---------------------------------------------------------
  saveCheckpoint(record: RuntimeCheckpoint): Promise<RuntimeResult<RuntimeCheckpoint>>;
  getLatestValidCheckpoint(runId: string): Promise<RuntimeResult<RuntimeCheckpoint>>;
  /** Marks checkpoints invalid (retained for audit, never deleted). Returns the affected ids. */
  invalidateCheckpoints(runId: string, fromStage: string, reason: string): Promise<RuntimeResult<string[]>>;

  // ---- artifacts -----------------------------------------------------------
  saveArtifact(record: RuntimeArtifact): Promise<RuntimeResult<RuntimeArtifact>>;
  getArtifact(id: string): Promise<RuntimeResult<RuntimeArtifact>>;
  listArtifactsByKind(runId: string, kind: RuntimeArtifactKind): Promise<RuntimeResult<RuntimeArtifact[]>>;

  // ---- reasoning -----------------------------------------------------------
  createReasoningJob(record: RuntimeReasoningJob): Promise<RuntimeResult<RuntimeReasoningJob>>;
  getReasoningJob(id: string): Promise<RuntimeResult<RuntimeReasoningJob>>;
  updateReasoningJobStatus(id: string, status: RuntimeReasoningJobStatus, patch?: Partial<Pick<RuntimeReasoningJob, "attempt" | "startedAt" | "completedAt" | "failedAt" | "cancelledAt">>): Promise<RuntimeResult<RuntimeReasoningJob>>;

  // ---- provider attempts ---------------------------------------------------
  recordProviderAttempt(record: RuntimeProviderAttempt): Promise<RuntimeResult<RuntimeProviderAttempt>>;
  listProviderAttempts(reasoningJobId: string): Promise<RuntimeResult<RuntimeProviderAttempt[]>>;

  // ---- derived records -----------------------------------------------------
  saveFinding(record: RuntimeFinding): Promise<RuntimeResult<RuntimeFinding>>;
  listFindings(runId: string): Promise<RuntimeResult<RuntimeFinding[]>>;
  saveRecommendation(record: RuntimeRecommendation): Promise<RuntimeResult<RuntimeRecommendation>>;
  listRecommendations(runId: string): Promise<RuntimeResult<RuntimeRecommendation[]>>;

  // ---- snapshots / versions ------------------------------------------------
  saveCompetitorSnapshot(record: RuntimeCompetitorSnapshot): Promise<RuntimeResult<RuntimeCompetitorSnapshot>>;
  saveProposalVersion(record: RuntimeProposalVersion): Promise<RuntimeResult<RuntimeProposalVersion>>;
  saveNarrativeVersion(record: RuntimeNarrativeVersion): Promise<RuntimeResult<RuntimeNarrativeVersion>>;
  getLatestProposalVersion(runId: string): Promise<RuntimeResult<RuntimeProposalVersion>>;
  getLatestNarrativeVersion(runId: string, audience: string): Promise<RuntimeResult<RuntimeNarrativeVersion>>;

  // ---- queue ---------------------------------------------------------------
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

  // ---- events (append-only) -------------------------------------------------
  /** Allocates the next per-aggregate sequence atomically; a race returns `serialization_conflict`. */
  appendRuntimeEvent(input: AppendEventInput): Promise<RuntimeResult<RuntimeEvent>>;
  listRuntimeEvents(query: ListEventsQuery): Promise<RuntimeResult<RuntimeEvent[]>>;
}
