/* =============================================================================
 * SupabaseRuntimeRepository — the typed Phase B runtime adapter (Sprint 13B §3).
 *
 * Implements RuntimeRepository FULLY TYPED against the generated Database types:
 * no `any`, no cast, no hand-authored DB types, no service-role assumption. The
 * request-scoped client carries the caller's session, and internal-only RLS is
 * the real boundary.
 *
 * NO raw database error escapes: every path returns a `RuntimeResult`, with
 * SQLSTATEs mapped by `mapDatabaseError`.
 *
 * IDEMPOTENCY (§4): a write races the unique `idempotency_key`. On a unique
 * violation the existing row is re-read and its canonical fingerprint compared —
 * matching ⇒ `replayed`, differing ⇒ `conflict`. Nothing is ever overwritten.
 *
 * LEASING (§5): delegated to the `bl_lease_next_job` RPC so selection and claim
 * happen in ONE atomic statement (FOR UPDATE SKIP LOCKED).
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@brightloop/db";
import type {
  RuntimeArtifact, RuntimeArtifactKind, RuntimeCheckpoint, RuntimeCompetitorSnapshot,
  RuntimeEvent, RuntimeFinding, RuntimeNarrativeVersion, RuntimeProposalVersion,
  RuntimeProviderAttempt, RuntimeQueueJob, RuntimeReasoningJob, RuntimeReasoningJobStatus,
  RuntimeRecommendation, RuntimeRun, RuntimeRunStatus, RuntimeStage,
} from "@brightloop/schema";
import {
  err, mapDatabaseError, ok, SQLSTATE,
  type AppendEventInput, type FailJobInput, type LeaseRequest, type ListEventsQuery,
  type RescheduleInput, type RuntimeRepository, type RuntimeResult,
} from "@brightloop/domain";
import {
  artifactFingerprint, checkpointFingerprint, checksumFingerprint, narrativeFingerprint,
  providerAttemptFingerprint, queueFingerprint, reasoningJobFingerprint, runFingerprint,
  stageFingerprint, toArtifact, toCheckpoint, toCompetitorSnapshot, toEvent, toFinding,
  toNarrativeVersion, toProposalVersion, toProviderAttempt, toQueueJob, toReasoningJob,
  toRecommendation, toRun, toStage,
} from "./mappers.js";

type Db = SupabaseClient<Database>;
/** jsonb columns accept our records; the generated column type is `Json`. */
const asJson = (value: Record<string, unknown>): Json => value as Json;

/** Terminal queue states — never leased, completed, renewed or recovered. */
const TERMINAL_QUEUE = new Set(["completed", "cancelled", "dead_letter"]);

export class SupabaseRuntimeRepository implements RuntimeRepository {
  constructor(private readonly db: Db) {}

  /* ---- idempotency helper -------------------------------------------------- */
  /**
   * Run an insert; on a unique-key collision, re-read the existing row and decide
   * `replayed` vs `conflict` by canonical fingerprint. Shared by every write.
   */
  private async idempotentInsert<T>(
    op: string,
    // Supabase returns a thenable PostgrestBuilder, not a full Promise.
    insert: () => PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>,
    reread: () => PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>,
    map: (row: never) => T,
    fingerprintOf: (value: T) => string,
    incomingFingerprint: string,
  ): Promise<RuntimeResult<T>> {
    const inserted = await insert();
    if (inserted.error === null) return ok("created", map(inserted.data as never));
    if (inserted.error.code !== SQLSTATE.uniqueViolation) return mapDatabaseError(inserted.error, op);

    const existing = await reread();
    if (existing.error !== null) return mapDatabaseError(existing.error, `${op}.reread`);
    if (existing.data === null || existing.data === undefined) {
      // the collision was on a natural key, not the idempotency key
      return err("conflict", `${op}: a conflicting record already exists`, inserted.error.message ?? null);
    }
    const record = map(existing.data as never);
    return fingerprintOf(record) === incomingFingerprint
      ? ok("replayed", record)
      : err("conflict", `${op}: idempotency key reused with a different payload`, null);
  }

  private async single<T>(op: string, query: PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>, map: (row: never) => T): Promise<RuntimeResult<T>> {
    const { data, error } = await query;
    if (error !== null) return mapDatabaseError(error, op);
    if (data === null || data === undefined) return err("not_found", `${op}: no record`);
    return ok("found", map(data as never));
  }

  private async many<T>(op: string, query: PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }>, map: (row: never) => T): Promise<RuntimeResult<T[]>> {
    const { data, error } = await query;
    if (error !== null) return mapDatabaseError(error, op);
    return ok("found", ((data ?? []) as never[]).map(map));
  }

  /* ---- attribution --------------------------------------------------------- */
  async resolveUserId(authUserId: string): Promise<RuntimeResult<string | null>> {
    const { data, error } = await this.db.from("users").select("id").eq("auth_user_id", authUserId).maybeSingle();
    if (error !== null) return mapDatabaseError(error, "resolveUserId");
    return ok("found", data?.id ?? null);
  }

  /* ---- runs ---------------------------------------------------------------- */
  async createRun(r: RuntimeRun): Promise<RuntimeResult<RuntimeRun>> {
    return this.idempotentInsert(
      "createRun",
      () => this.db.from("intelligence_runs").insert({
        id: r.id, client_id: r.clientId, scan_id: r.scanId, status: r.status,
        current_stage: r.currentStage, failed_stage: r.failedStage, version: r.version,
        idempotency_key: r.idempotencyKey, metadata: asJson(r.metadata), checksum: r.checksum,
        deadline: r.deadline, cancelled: r.cancelled, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("intelligence_runs").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toRun, runFingerprint, runFingerprint(r),
    );
  }

  async getRun(id: string): Promise<RuntimeResult<RuntimeRun>> {
    return this.single("getRun", this.db.from("intelligence_runs").select("*").eq("id", id).maybeSingle(), toRun);
  }

  async getRunByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeRun>> {
    return this.single("getRunByIdempotencyKey", this.db.from("intelligence_runs").select("*").eq("idempotency_key", key).maybeSingle(), toRun);
  }

  async updateRunStatus(id: string, status: RuntimeRunStatus, patch: Partial<Pick<RuntimeRun, "currentStage" | "failedStage" | "startedAt" | "completedAt" | "failedAt">> = {}): Promise<RuntimeResult<RuntimeRun>> {
    const { data, error } = await this.db.from("intelligence_runs")
      .update({
        status, updated_at: new Date().toISOString(),
        ...(patch.currentStage !== undefined ? { current_stage: patch.currentStage } : {}),
        ...(patch.failedStage !== undefined ? { failed_stage: patch.failedStage } : {}),
        ...(patch.startedAt !== undefined ? { started_at: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completed_at: patch.completedAt } : {}),
        ...(patch.failedAt !== undefined ? { failed_at: patch.failedAt } : {}),
      })
      .eq("id", id).select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "updateRunStatus");
    if (data === null) return err("not_found", "updateRunStatus: no run");
    return ok("updated", toRun(data));
  }

  async cancelRun(id: string, at: string): Promise<RuntimeResult<RuntimeRun>> {
    const current = await this.getRun(id);
    if (!current.ok) return current;
    if (current.value.status === "completed" || current.value.status === "failed") {
      return err("terminal_state", `cancelRun: run is ${current.value.status}`);
    }
    if (current.value.cancelled) return ok("replayed", current.value); // idempotent
    const { data, error } = await this.db.from("intelligence_runs")
      .update({ status: "cancelled", cancelled: true, cancelled_at: at, updated_at: at })
      .eq("id", id).select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "cancelRun");
    if (data === null) return err("not_found", "cancelRun: no run");
    return ok("updated", toRun(data));
  }

  /* ---- stages -------------------------------------------------------------- */
  async appendStageTransition(r: RuntimeStage): Promise<RuntimeResult<RuntimeStage>> {
    return this.idempotentInsert(
      "appendStageTransition",
      () => this.db.from("intelligence_run_stages").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, stage: r.stage,
        status: r.status, attempt: r.attempt, idempotency_key: r.idempotencyKey,
        metadata: asJson(r.metadata), last_error: r.lastError, created_by: r.createdBy,
        started_at: r.startedAt, completed_at: r.completedAt, failed_at: r.failedAt, cancelled_at: r.cancelledAt,
      }).select("*").single(),
      () => this.db.from("intelligence_run_stages").select("*").eq("run_id", r.runId).eq("stage", r.stage).eq("attempt", r.attempt).maybeSingle(),
      toStage, stageFingerprint, stageFingerprint(r),
    );
  }

  async getLatestStage(runId: string): Promise<RuntimeResult<RuntimeStage>> {
    return this.single("getLatestStage",
      this.db.from("intelligence_run_stages").select("*").eq("run_id", runId).order("created_at", { ascending: false }).limit(1).maybeSingle(), toStage);
  }

  async listStages(runId: string): Promise<RuntimeResult<RuntimeStage[]>> {
    return this.many("listStages",
      this.db.from("intelligence_run_stages").select("*").eq("run_id", runId).order("created_at", { ascending: true }), toStage);
  }

  /* ---- checkpoints --------------------------------------------------------- */
  async saveCheckpoint(r: RuntimeCheckpoint): Promise<RuntimeResult<RuntimeCheckpoint>> {
    return this.idempotentInsert(
      "saveCheckpoint",
      () => this.db.from("intelligence_checkpoints").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, stage: r.stage,
        status: r.status, artifact_ids: r.artifactIds, source_checksums: asJson(r.sourceChecksums),
        next_stage: r.nextStage, attempt: r.attempt, invalidation_reason: r.invalidationReason,
        idempotency_key: r.idempotencyKey,
      }).select("*").single(),
      () => this.db.from("intelligence_checkpoints").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toCheckpoint, checkpointFingerprint, checkpointFingerprint(r),
    );
  }

  async getLatestValidCheckpoint(runId: string): Promise<RuntimeResult<RuntimeCheckpoint>> {
    return this.single("getLatestValidCheckpoint",
      this.db.from("intelligence_checkpoints").select("*").eq("run_id", runId).eq("status", "valid")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(), toCheckpoint);
  }

  async invalidateCheckpoints(runId: string, fromStage: string, reason: string): Promise<RuntimeResult<string[]>> {
    // Retained for audit — status flips, rows are never deleted.
    const { data, error } = await this.db.from("intelligence_checkpoints")
      .update({ status: "invalidated", invalidation_reason: reason })
      .eq("run_id", runId).eq("stage", fromStage).eq("status", "valid").select("id");
    if (error !== null) return mapDatabaseError(error, "invalidateCheckpoints");
    return ok("updated", (data ?? []).map((row) => row.id));
  }

  /* ---- artifacts ----------------------------------------------------------- */
  async saveArtifact(r: RuntimeArtifact): Promise<RuntimeResult<RuntimeArtifact>> {
    return this.idempotentInsert(
      "saveArtifact",
      () => this.db.from("intelligence_artifacts").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, kind: r.kind,
        version: r.version, checksum: r.checksum, validation_status: r.validationStatus,
        source_artifact_ids: r.sourceArtifactIds, envelope: asJson(r.envelope),
        payload_ref: r.payloadRef, idempotency_key: r.idempotencyKey, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("intelligence_artifacts").select("*").eq("run_id", r.runId).eq("kind", r.kind).eq("version", r.version).maybeSingle(),
      toArtifact, artifactFingerprint, artifactFingerprint(r),
    );
  }

  async getArtifact(id: string): Promise<RuntimeResult<RuntimeArtifact>> {
    return this.single("getArtifact", this.db.from("intelligence_artifacts").select("*").eq("id", id).maybeSingle(), toArtifact);
  }

  async listArtifactsByKind(runId: string, kind: RuntimeArtifactKind): Promise<RuntimeResult<RuntimeArtifact[]>> {
    return this.many("listArtifactsByKind",
      this.db.from("intelligence_artifacts").select("*").eq("run_id", runId).eq("kind", kind).order("version", { ascending: false }), toArtifact);
  }

  /* ---- reasoning ----------------------------------------------------------- */
  async createReasoningJob(r: RuntimeReasoningJob): Promise<RuntimeResult<RuntimeReasoningJob>> {
    return this.idempotentInsert(
      "createReasoningJob",
      () => this.db.from("reasoning_jobs").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, stage: r.stage,
        task_type: r.taskType, status: r.status, attempt: r.attempt, max_attempts: r.maxAttempts,
        idempotency_key: r.idempotencyKey, metadata: asJson(r.metadata), deadline: r.deadline, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("reasoning_jobs").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toReasoningJob, reasoningJobFingerprint, reasoningJobFingerprint(r),
    );
  }

  async getReasoningJob(id: string): Promise<RuntimeResult<RuntimeReasoningJob>> {
    return this.single("getReasoningJob", this.db.from("reasoning_jobs").select("*").eq("id", id).maybeSingle(), toReasoningJob);
  }

  async updateReasoningJobStatus(id: string, status: RuntimeReasoningJobStatus, patch: Partial<Pick<RuntimeReasoningJob, "attempt" | "startedAt" | "completedAt" | "failedAt" | "cancelledAt">> = {}): Promise<RuntimeResult<RuntimeReasoningJob>> {
    const { data, error } = await this.db.from("reasoning_jobs")
      .update({
        status, updated_at: new Date().toISOString(),
        ...(patch.attempt !== undefined ? { attempt: patch.attempt } : {}),
        ...(patch.startedAt !== undefined ? { started_at: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completed_at: patch.completedAt } : {}),
        ...(patch.failedAt !== undefined ? { failed_at: patch.failedAt } : {}),
        ...(patch.cancelledAt !== undefined ? { cancelled_at: patch.cancelledAt } : {}),
      })
      .eq("id", id).select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "updateReasoningJobStatus");
    if (data === null) return err("not_found", "updateReasoningJobStatus: no job");
    return ok("updated", toReasoningJob(data));
  }

  /* ---- provider attempts --------------------------------------------------- */
  async recordProviderAttempt(r: RuntimeProviderAttempt): Promise<RuntimeResult<RuntimeProviderAttempt>> {
    return this.idempotentInsert(
      "recordProviderAttempt",
      () => this.db.from("provider_attempts").insert({
        id: r.id, reasoning_job_id: r.reasoningJobId, run_id: r.runId, client_id: r.clientId,
        scan_id: r.scanId, provider_id: r.providerId, attempt: r.attempt, status: r.status,
        retry_disposition: r.retryDisposition, latency_ms: r.latencyMs,
        estimated_cost: r.estimatedCost, actual_cost: r.actualCost,
        input_tokens: r.inputTokens, output_tokens: r.outputTokens, usage_estimated: r.usageEstimated,
        raw_response_ref: r.rawResponseRef, last_error: r.lastError, idempotency_key: r.idempotencyKey,
      }).select("*").single(),
      () => this.db.from("provider_attempts").select("*").eq("reasoning_job_id", r.reasoningJobId).eq("attempt", r.attempt).maybeSingle(),
      toProviderAttempt, providerAttemptFingerprint, providerAttemptFingerprint(r),
    );
  }

  async listProviderAttempts(reasoningJobId: string): Promise<RuntimeResult<RuntimeProviderAttempt[]>> {
    return this.many("listProviderAttempts",
      this.db.from("provider_attempts").select("*").eq("reasoning_job_id", reasoningJobId).order("attempt", { ascending: true }), toProviderAttempt);
  }

  /* ---- derived records ----------------------------------------------------- */
  async saveFinding(r: RuntimeFinding): Promise<RuntimeResult<RuntimeFinding>> {
    return this.idempotentInsert(
      "saveFinding",
      () => this.db.from("intelligence_findings").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, domain: r.domain,
        severity: r.severity, version: r.version, checksum: r.checksum, envelope: asJson(r.envelope),
        source_artifact_ids: r.sourceArtifactIds, idempotency_key: r.idempotencyKey, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("intelligence_findings").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toFinding, checksumFingerprint, checksumFingerprint(r),
    );
  }

  async listFindings(runId: string): Promise<RuntimeResult<RuntimeFinding[]>> {
    return this.many("listFindings", this.db.from("intelligence_findings").select("*").eq("run_id", runId).order("created_at", { ascending: true }), toFinding);
  }

  async saveRecommendation(r: RuntimeRecommendation): Promise<RuntimeResult<RuntimeRecommendation>> {
    return this.idempotentInsert(
      "saveRecommendation",
      () => this.db.from("intelligence_recommendations").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, tier: r.tier,
        priority: r.priority, version: r.version, checksum: r.checksum, envelope: asJson(r.envelope),
        source_artifact_ids: r.sourceArtifactIds, idempotency_key: r.idempotencyKey, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("intelligence_recommendations").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toRecommendation, checksumFingerprint, checksumFingerprint(r),
    );
  }

  async listRecommendations(runId: string): Promise<RuntimeResult<RuntimeRecommendation[]>> {
    return this.many("listRecommendations", this.db.from("intelligence_recommendations").select("*").eq("run_id", runId).order("created_at", { ascending: true }), toRecommendation);
  }

  /* ---- snapshots / versions ------------------------------------------------ */
  async saveCompetitorSnapshot(r: RuntimeCompetitorSnapshot): Promise<RuntimeResult<RuntimeCompetitorSnapshot>> {
    return this.idempotentInsert(
      "saveCompetitorSnapshot",
      () => this.db.from("competitor_snapshots").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId,
        competitor_count: r.competitorCount, version: r.version, checksum: r.checksum,
        envelope: asJson(r.envelope), source_artifact_ids: r.sourceArtifactIds,
        idempotency_key: r.idempotencyKey, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("competitor_snapshots").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toCompetitorSnapshot, checksumFingerprint, checksumFingerprint(r),
    );
  }

  async saveProposalVersion(r: RuntimeProposalVersion): Promise<RuntimeResult<RuntimeProposalVersion>> {
    return this.idempotentInsert(
      "saveProposalVersion",
      () => this.db.from("proposal_versions").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, status: r.status,
        supersedes_id: r.supersedesId, version: r.version, checksum: r.checksum,
        envelope: asJson(r.envelope), source_artifact_ids: r.sourceArtifactIds,
        idempotency_key: r.idempotencyKey, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("proposal_versions").select("*").eq("run_id", r.runId).eq("version", r.version).maybeSingle(),
      toProposalVersion, checksumFingerprint, checksumFingerprint(r),
    );
  }

  async saveNarrativeVersion(r: RuntimeNarrativeVersion): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    return this.idempotentInsert(
      "saveNarrativeVersion",
      () => this.db.from("narrative_versions").insert({
        id: r.id, run_id: r.runId, client_id: r.clientId, scan_id: r.scanId, audience: r.audience,
        status: r.status, supersedes_id: r.supersedesId, version: r.version, checksum: r.checksum,
        envelope: asJson(r.envelope), source_artifact_ids: r.sourceArtifactIds,
        idempotency_key: r.idempotencyKey, created_by: r.createdBy,
      }).select("*").single(),
      () => this.db.from("narrative_versions").select("*").eq("run_id", r.runId).eq("audience", r.audience).eq("version", r.version).maybeSingle(),
      toNarrativeVersion, narrativeFingerprint, narrativeFingerprint(r),
    );
  }

  async getLatestProposalVersion(runId: string): Promise<RuntimeResult<RuntimeProposalVersion>> {
    return this.single("getLatestProposalVersion",
      this.db.from("proposal_versions").select("*").eq("run_id", runId).order("version", { ascending: false }).limit(1).maybeSingle(), toProposalVersion);
  }

  async getLatestNarrativeVersion(runId: string, audience: string): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    return this.single("getLatestNarrativeVersion",
      this.db.from("narrative_versions").select("*").eq("run_id", runId).eq("audience", audience)
        .order("version", { ascending: false }).limit(1).maybeSingle(), toNarrativeVersion);
  }

  /* ---- queue --------------------------------------------------------------- */
  async enqueueJob(r: RuntimeQueueJob): Promise<RuntimeResult<RuntimeQueueJob>> {
    return this.idempotentInsert(
      "enqueueJob",
      () => this.db.from("job_queue").insert({
        id: r.id, job_type: r.jobType, client_id: r.clientId, run_id: r.runId, scan_id: r.scanId,
        stage: r.stage, priority: r.priority, status: r.status, available_at: r.availableAt,
        attempt: r.attempt, max_attempts: r.maxAttempts, idempotency_key: r.idempotencyKey,
        payload_ref: r.payloadRef, payload: asJson(r.payload),
      }).select("*").single(),
      () => this.db.from("job_queue").select("*").eq("idempotency_key", r.idempotencyKey).maybeSingle(),
      toQueueJob, queueFingerprint, queueFingerprint(r),
    );
  }

  async getJob(id: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    return this.single("getJob", this.db.from("job_queue").select("*").eq("id", id).maybeSingle(), toQueueJob);
  }

  /** ATOMIC — one RPC round trip; selection and claim cannot interleave. */
  async leaseNextEligibleJob(request: LeaseRequest): Promise<RuntimeResult<RuntimeQueueJob>> {
    const { data, error } = await this.db.rpc("bl_lease_next_job", {
      p_owner: request.owner,
      p_lease_seconds: request.leaseSeconds,
      ...(request.jobType != null ? { p_job_type: request.jobType } : {}),
      ...(request.clientId != null ? { p_client_id: request.clientId } : {}),
    });
    if (error !== null) return mapDatabaseError(error, "leaseNextEligibleJob");
    const rows = data ?? [];
    if (rows.length === 0) return err("no_job_available", "leaseNextEligibleJob: no eligible job");
    return ok("leased", toQueueJob(rows[0]!));
  }

  /** Owner-only, active-lease-only, never after a terminal state. */
  async renewLease(jobId: string, owner: string, leaseSeconds: number): Promise<RuntimeResult<RuntimeQueueJob>> {
    const current = await this.getJob(jobId);
    if (!current.ok) return current;
    if (TERMINAL_QUEUE.has(current.value.status)) return err("terminal_state", `renewLease: job is ${current.value.status}`);
    if (current.value.leaseOwner !== owner || current.value.status !== "leased") {
      return err("lease_lost", "renewLease: caller does not hold an active lease");
    }
    const expiresAt = new Date(Date.now() + Math.max(1, leaseSeconds) * 1000).toISOString();
    // the owner predicate is re-asserted in the statement itself
    const { data, error } = await this.db.from("job_queue")
      .update({ lease_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("lease_owner", owner).eq("status", "leased").select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "renewLease");
    if (data === null) return err("lease_lost", "renewLease: lease changed hands");
    return ok("updated", toQueueJob(data));
  }

  async releaseLease(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const { data, error } = await this.db.from("job_queue")
      .update({ status: "queued", lease_status: "released", lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("lease_owner", owner).eq("status", "leased").select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "releaseLease");
    if (data === null) return err("lease_lost", "releaseLease: caller does not hold the lease");
    return ok("released", toQueueJob(data));
  }

  async completeJob(jobId: string, owner: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const { data, error } = await this.db.from("job_queue")
      .update({ status: "completed", lease_status: "released", lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("lease_owner", owner).eq("status", "leased").select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "completeJob");
    if (data === null) return err("lease_lost", "completeJob: caller does not hold the lease (or the job is not leased)");
    return ok("updated", toQueueJob(data));
  }

  async failJob(input: FailJobInput): Promise<RuntimeResult<RuntimeQueueJob>> {
    const terminalStatus = input.terminal ? "dead_letter" : "queued";
    const { data, error } = await this.db.from("job_queue")
      .update({
        status: terminalStatus, lease_status: "released", lease_owner: null, lease_expires_at: null,
        last_error: input.error, updated_at: new Date().toISOString(),
        ...(input.terminal ? {} : { available_at: input.retryAfter ?? new Date().toISOString() }),
      })
      .eq("id", input.jobId).eq("lease_owner", input.owner).eq("status", "leased").select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "failJob");
    if (data === null) return err("lease_lost", "failJob: caller does not hold the lease");
    return ok("updated", toQueueJob(data));
  }

  async cancelJob(jobId: string): Promise<RuntimeResult<RuntimeQueueJob>> {
    const current = await this.getJob(jobId);
    if (!current.ok) return current;
    if (current.value.status === "cancelled") return ok("replayed", current.value); // idempotent
    if (TERMINAL_QUEUE.has(current.value.status)) return err("terminal_state", `cancelJob: job is ${current.value.status}`);
    const { data, error } = await this.db.from("job_queue")
      .update({ status: "cancelled", lease_status: "released", lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() })
      .eq("id", jobId).select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "cancelJob");
    if (data === null) return err("not_found", "cancelJob: no job");
    return ok("updated", toQueueJob(data));
  }

  async rescheduleJob(input: RescheduleInput): Promise<RuntimeResult<RuntimeQueueJob>> {
    const { data, error } = await this.db.from("job_queue")
      .update({
        status: "queued", lease_status: "released", lease_owner: null, lease_expires_at: null,
        available_at: input.availableAt, last_error: input.reason, updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId).eq("lease_owner", input.owner).eq("status", "leased").select("*").maybeSingle();
    if (error !== null) return mapDatabaseError(error, "rescheduleJob");
    if (data === null) return err("lease_lost", "rescheduleJob: caller does not hold the lease");
    return ok("updated", toQueueJob(data));
  }

  /* ---- events (append-only) ------------------------------------------------ */
  async appendRuntimeEvent(input: AppendEventInput): Promise<RuntimeResult<RuntimeEvent>> {
    const e = input.event;
    // Allocate the next sequence when the caller did not pin one. The unique
    // (aggregate_type, aggregate_id, sequence) index is the real arbiter: a
    // concurrent append collides and surfaces as a serialization conflict.
    let sequence = input.expectedSequence ?? e.sequence;
    if (sequence === undefined) {
      const { data, error } = await this.db.from("runtime_events")
        .select("sequence").eq("aggregate_type", e.aggregateType).eq("aggregate_id", e.aggregateId)
        .order("sequence", { ascending: false }).limit(1).maybeSingle();
      if (error !== null) return mapDatabaseError(error, "appendRuntimeEvent.sequence");
      sequence = (data === null ? 0 : Number(data.sequence)) + 1;
    }

    const { data, error } = await this.db.from("runtime_events").insert({
      id: e.id, event_type: e.eventType, run_id: e.runId, stage: e.stage,
      aggregate_id: e.aggregateId, aggregate_type: e.aggregateType, client_id: e.clientId,
      scan_id: e.scanId, sequence, payload: asJson(e.payload), occurred_at: e.occurredAt,
      correlation_id: e.correlationId, causation_id: e.causationId, actor: e.actor,
      schema_version: e.schemaVersion,
    }).select("*").single();

    if (error !== null) {
      // a duplicate sequence means another writer won the race for this slot
      if (error.code === SQLSTATE.uniqueViolation) {
        return err("serialization_conflict", "appendRuntimeEvent: sequence taken by a concurrent append", error.message);
      }
      return mapDatabaseError(error, "appendRuntimeEvent");
    }
    return ok("created", toEvent(data));
  }

  async listRuntimeEvents(query: ListEventsQuery): Promise<RuntimeResult<RuntimeEvent[]>> {
    let q = this.db.from("runtime_events").select("*")
      .eq("aggregate_type", query.aggregateType).eq("aggregate_id", query.aggregateId)
      .order("sequence", { ascending: true });
    if (query.fromSequence !== undefined) q = q.gte("sequence", query.fromSequence);
    if (query.limit !== undefined) q = q.limit(query.limit);
    return this.many("listRuntimeEvents", q, toEvent);
  }
}
