/* =============================================================================
 * Runtime row↔domain mappers (Phase B · Sprint 13B §3).
 *
 * Row types are DERIVED from the generated Database type — nothing here is
 * hand-authored, and there is no `any` or unsafe cast. Enum columns already match
 * the schema's literal unions exactly (the migration mirrors them 1:1), so they
 * need no coercion. `jsonb` is the one place that needs validation: the generated
 * `Json` type permits scalars and arrays, while the domain expects an object.
 * ========================================================================== */

import type { Database, Json } from "@brightloop/db";
import type {
  RuntimeArtifact,
  RuntimeCheckpoint,
  RuntimeCompetitorSnapshot,
  RuntimeEvent,
  RuntimeFinding,
  RuntimeNarrativeVersion,
  RuntimeProposalVersion,
  RuntimeProviderAttempt,
  RuntimeQueueJob,
  RuntimeReasoningJob,
  RuntimeRecommendation,
  RuntimeRun,
  RuntimeStage,
} from "@brightloop/schema";

type Tables = Database["public"]["Tables"];
export type RunRow = Tables["intelligence_runs"]["Row"];
export type StageRow = Tables["intelligence_run_stages"]["Row"];
export type CheckpointRow = Tables["intelligence_checkpoints"]["Row"];
export type ArtifactRow = Tables["intelligence_artifacts"]["Row"];
export type ReasoningJobRow = Tables["reasoning_jobs"]["Row"];
export type ProviderAttemptRow = Tables["provider_attempts"]["Row"];
export type FindingRow = Tables["intelligence_findings"]["Row"];
export type RecommendationRow = Tables["intelligence_recommendations"]["Row"];
export type CompetitorSnapshotRow = Tables["competitor_snapshots"]["Row"];
export type ProposalVersionRow = Tables["proposal_versions"]["Row"];
export type NarrativeVersionRow = Tables["narrative_versions"]["Row"];
export type EventRow = Tables["runtime_events"]["Row"];
export type QueueRow = Tables["job_queue"]["Row"];

/**
 * Validate a `jsonb` column into a plain object. Arrays, scalars and null all
 * collapse to `{}` rather than being forced through a cast — the runtime never
 * trusts an unexpected payload shape.
 */
export function toRecord(value: Json | null): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Validate a `jsonb` column of string→string (checkpoint source checksums). */
export function toStringRecord(value: Json | null): Record<string, string> {
  const record = toRecord(value);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) if (typeof v === "string") out[k] = v;
  return out;
}

/** `text[]` columns arrive as `string[] | null`. */
const toIds = (value: string[] | null): string[] => value ?? [];

/* ---- row → domain ----------------------------------------------------------- */
export const toRun = (r: RunRow): RuntimeRun => ({
  id: r.id, clientId: r.client_id, scanId: r.scan_id, status: r.status,
  currentStage: r.current_stage, failedStage: r.failed_stage, version: r.version,
  idempotencyKey: r.idempotency_key, metadata: toRecord(r.metadata), checksum: r.checksum,
  deadline: r.deadline, cancelled: r.cancelled, createdBy: r.created_by,
  createdAt: r.created_at, updatedAt: r.updated_at, startedAt: r.started_at,
  completedAt: r.completed_at, failedAt: r.failed_at, cancelledAt: r.cancelled_at,
});

export const toStage = (r: StageRow): RuntimeStage => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id, stage: r.stage,
  status: r.status, attempt: r.attempt, idempotencyKey: r.idempotency_key,
  metadata: toRecord(r.metadata), lastError: r.last_error, createdBy: r.created_by,
  createdAt: r.created_at, updatedAt: r.updated_at, startedAt: r.started_at,
  completedAt: r.completed_at, failedAt: r.failed_at, cancelledAt: r.cancelled_at,
});

export const toCheckpoint = (r: CheckpointRow): RuntimeCheckpoint => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id, stage: r.stage,
  status: r.status, artifactIds: toIds(r.artifact_ids), sourceChecksums: toStringRecord(r.source_checksums),
  nextStage: r.next_stage, attempt: r.attempt, invalidationReason: r.invalidation_reason,
  idempotencyKey: r.idempotency_key, createdAt: r.created_at,
});

export const toArtifact = (r: ArtifactRow): RuntimeArtifact => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id, kind: r.kind,
  version: r.version, checksum: r.checksum, validationStatus: r.validation_status,
  sourceArtifactIds: toIds(r.source_artifact_ids), envelope: toRecord(r.envelope),
  payloadRef: r.payload_ref, idempotencyKey: r.idempotency_key,
  createdBy: r.created_by, createdAt: r.created_at,
});

export const toReasoningJob = (r: ReasoningJobRow): RuntimeReasoningJob => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id, stage: r.stage,
  taskType: r.task_type, status: r.status, attempt: r.attempt, maxAttempts: r.max_attempts,
  idempotencyKey: r.idempotency_key, metadata: toRecord(r.metadata), deadline: r.deadline,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  startedAt: r.started_at, completedAt: r.completed_at, failedAt: r.failed_at, cancelledAt: r.cancelled_at,
});

export const toProviderAttempt = (r: ProviderAttemptRow): RuntimeProviderAttempt => ({
  id: r.id, reasoningJobId: r.reasoning_job_id, runId: r.run_id, clientId: r.client_id,
  scanId: r.scan_id, providerId: r.provider_id, attempt: r.attempt, status: r.status,
  retryDisposition: r.retry_disposition, latencyMs: r.latency_ms,
  estimatedCost: r.estimated_cost, actualCost: r.actual_cost,
  inputTokens: r.input_tokens, outputTokens: r.output_tokens, usageEstimated: r.usage_estimated,
  rawResponseRef: r.raw_response_ref, lastError: r.last_error,
  idempotencyKey: r.idempotency_key, createdAt: r.created_at,
});

export const toFinding = (r: FindingRow): RuntimeFinding => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id,
  domain: r.domain, severity: r.severity, version: r.version, checksum: r.checksum,
  envelope: toRecord(r.envelope), sourceArtifactIds: toIds(r.source_artifact_ids),
  idempotencyKey: r.idempotency_key, createdBy: r.created_by, createdAt: r.created_at,
});

export const toRecommendation = (r: RecommendationRow): RuntimeRecommendation => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id,
  tier: r.tier, priority: r.priority, version: r.version, checksum: r.checksum,
  envelope: toRecord(r.envelope), sourceArtifactIds: toIds(r.source_artifact_ids),
  idempotencyKey: r.idempotency_key, createdBy: r.created_by, createdAt: r.created_at,
});

export const toCompetitorSnapshot = (r: CompetitorSnapshotRow): RuntimeCompetitorSnapshot => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id,
  competitorCount: r.competitor_count, version: r.version, checksum: r.checksum,
  envelope: toRecord(r.envelope), sourceArtifactIds: toIds(r.source_artifact_ids),
  idempotencyKey: r.idempotency_key, createdBy: r.created_by, createdAt: r.created_at,
});

export const toProposalVersion = (r: ProposalVersionRow): RuntimeProposalVersion => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id,
  status: r.status, supersedesId: r.supersedes_id, version: r.version, checksum: r.checksum,
  envelope: toRecord(r.envelope), sourceArtifactIds: toIds(r.source_artifact_ids),
  idempotencyKey: r.idempotency_key, createdBy: r.created_by, createdAt: r.created_at,
});

export const toNarrativeVersion = (r: NarrativeVersionRow): RuntimeNarrativeVersion => ({
  id: r.id, runId: r.run_id, clientId: r.client_id, scanId: r.scan_id,
  audience: r.audience, status: r.status, supersedesId: r.supersedes_id,
  version: r.version, checksum: r.checksum, envelope: toRecord(r.envelope),
  sourceArtifactIds: toIds(r.source_artifact_ids), idempotencyKey: r.idempotency_key,
  createdBy: r.created_by, createdAt: r.created_at,
});

export const toEvent = (r: EventRow): RuntimeEvent => ({
  id: r.id, eventType: r.event_type, runId: r.run_id, stage: r.stage,
  aggregateId: r.aggregate_id, aggregateType: r.aggregate_type, clientId: r.client_id,
  scanId: r.scan_id, sequence: Number(r.sequence), payload: toRecord(r.payload),
  occurredAt: r.occurred_at, correlationId: r.correlation_id, causationId: r.causation_id,
  actor: r.actor, schemaVersion: r.schema_version,
});

export const toQueueJob = (r: QueueRow): RuntimeQueueJob => ({
  id: r.id, jobType: r.job_type, clientId: r.client_id, runId: r.run_id, scanId: r.scan_id,
  stage: r.stage, priority: r.priority, status: r.status, availableAt: r.available_at,
  attempt: r.attempt, maxAttempts: r.max_attempts, leaseOwner: r.lease_owner,
  leaseExpiresAt: r.lease_expires_at, idempotencyKey: r.idempotency_key,
  payloadRef: r.payload_ref, payload: toRecord(r.payload), lastError: r.last_error,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

/* ---- canonical fingerprints (§4 replay-vs-conflict) ------------------------- */
/**
 * The canonical payload of a record for idempotency comparison. A replay must
 * match on these fields; anything else with the same key is a CONFLICT.
 * Identity, timestamps and mutable status are deliberately excluded.
 */
export const runFingerprint = (r: Pick<RuntimeRun, "scanId" | "clientId" | "checksum">) => JSON.stringify([r.scanId, r.clientId, r.checksum]);
export const stageFingerprint = (r: Pick<RuntimeStage, "runId" | "stage" | "attempt">) => JSON.stringify([r.runId, r.stage, r.attempt]);
export const checkpointFingerprint = (r: Pick<RuntimeCheckpoint, "runId" | "stage" | "attempt" | "artifactIds">) => JSON.stringify([r.runId, r.stage, r.attempt, [...r.artifactIds].sort()]);
export const artifactFingerprint = (r: Pick<RuntimeArtifact, "runId" | "kind" | "version" | "checksum">) => JSON.stringify([r.runId, r.kind, r.version, r.checksum]);
export const reasoningJobFingerprint = (r: Pick<RuntimeReasoningJob, "runId" | "stage" | "taskType">) => JSON.stringify([r.runId, r.stage, r.taskType]);
export const providerAttemptFingerprint = (r: Pick<RuntimeProviderAttempt, "reasoningJobId" | "attempt" | "providerId">) => JSON.stringify([r.reasoningJobId, r.attempt, r.providerId]);
export const checksumFingerprint = (r: { runId: string; checksum: string; version: number }) => JSON.stringify([r.runId, r.version, r.checksum]);
export const narrativeFingerprint = (r: Pick<RuntimeNarrativeVersion, "runId" | "audience" | "version" | "checksum">) => JSON.stringify([r.runId, r.audience, r.version, r.checksum]);
export const queueFingerprint = (r: Pick<RuntimeQueueJob, "jobType" | "runId" | "stage">) => JSON.stringify([r.jobType, r.runId, r.stage]);
