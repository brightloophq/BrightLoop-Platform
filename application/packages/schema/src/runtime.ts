/* =============================================================================
 * Runtime Persistence & Job Infrastructure — CONTRACTS (Phase B · Sprint 13).
 *
 * The durable counterpart to the Phase-A deterministic engine. These shapes mirror
 * the `runtime_*` Postgres enums and the additive runtime tables 1:1, so the typed
 * adapters (Sprint 13B) can map rows without a cast.
 *
 * PRINCIPLES:
 *   · additive only — no Phase-A contract is altered;
 *   · artifacts are stored as ENVELOPES + references, never as hidden reasoning;
 *   · every write path carries an `idempotencyKey` so a replay is safe;
 *   · the event log is append-only, ordered per aggregate, and carries no
 *     chain-of-thought, secrets, or raw provider content.
 *
 * NOTE ON NAMES: everything is `Runtime*`-prefixed and the Postgres enums are
 * `runtime_*`, so nothing collides with the Phase-A domain enums of the same
 * meaning (`pipelineRunStatus`, `reasoningJobStatus`, `executionStatus`, …),
 * which remain the canonical in-memory contracts.
 * ========================================================================== */

import { z } from "zod";

export const RUNTIME_SCHEMA_VERSION = "1.0";

/* ---- 2 · status enums (mirror the runtime_* Postgres enums exactly) -------- */

/** Mirrors `pipelineRunStatus` (Sprint 8) — the durable run lifecycle. */
export const runtimeRunStatusSchema = z.enum([
  "pending",
  "discovering",
  "ingesting_evidence",
  "assembling_graph",
  "planning_reasoning",
  "executing_reasoning",
  "validating_results",
  "synthesizing_findings",
  "building_recommendations",
  "preparing_report",
  "completed",
  "failed",
  "cancelled",
  "blocked",
]);
export type RuntimeRunStatus = z.infer<typeof runtimeRunStatusSchema>;

export const runtimeStageStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped", "cancelled"]);
export type RuntimeStageStatus = z.infer<typeof runtimeStageStatusSchema>;

export const runtimeCheckpointStatusSchema = z.enum(["valid", "invalidated"]);
export type RuntimeCheckpointStatus = z.infer<typeof runtimeCheckpointStatusSchema>;

/** Mirrors `artifactValidationStatus` (Sprint 8). */
export const runtimeArtifactStatusSchema = z.enum(["valid", "invalid", "unvalidated"]);
export type RuntimeArtifactStatus = z.infer<typeof runtimeArtifactStatusSchema>;

/** Mirrors `reasoningJobStatus` (Sprint 6). */
export const runtimeReasoningJobStatusSchema = z.enum([
  "pending", "planned", "routed", "running", "validating", "completed", "failed", "cancelled", "blocked",
]);
export type RuntimeReasoningJobStatus = z.infer<typeof runtimeReasoningJobStatusSchema>;

/** Mirrors `executionStatus` (Sprint 7). */
export const runtimeProviderAttemptStatusSchema = z.enum([
  "succeeded", "rejected", "failed", "timed_out", "cancelled", "budget_exhausted", "deadline_exceeded",
]);
export type RuntimeProviderAttemptStatus = z.infer<typeof runtimeProviderAttemptStatusSchema>;

export const runtimeQueueStatusSchema = z.enum(["queued", "leased", "completed", "failed", "cancelled", "dead_letter"]);
export type RuntimeQueueStatus = z.infer<typeof runtimeQueueStatusSchema>;

export const runtimeLeaseStatusSchema = z.enum(["unleased", "leased", "expired", "released"]);
export type RuntimeLeaseStatus = z.infer<typeof runtimeLeaseStatusSchema>;

/** Mirrors the Sprint-6 `RetryDecision`. */
export const runtimeRetryDispositionSchema = z.enum(["retry_same", "retry_fallback", "stop"]);
export type RuntimeRetryDisposition = z.infer<typeof runtimeRetryDispositionSchema>;

/** The artifact kinds persisted (mirrors Sprint-8 `artifactKind` + Phase B additions). */
export const runtimeArtifactKindSchema = z.enum([
  "discovery_manifest", "evidence_ingress", "evidence_bundle", "intelligence_graph", "graph_snapshot",
  "reasoning_jobs", "execution_outcomes", "validated_claims", "findings", "recommendation_candidates",
  "internal_intelligence_report", "competitor_snapshot", "proposal", "narrative",
]);
export type RuntimeArtifactKind = z.infer<typeof runtimeArtifactKindSchema>;

/* ---- 1 · runtime records ---------------------------------------------------- */
const auditShape = {
  createdBy: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  failedAt: z.string().nullable().default(null),
  cancelledAt: z.string().nullable().default(null),
};

export const runtimeRunSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  leadId: z.string().nullable(),
  scanId: z.string(),
  status: runtimeRunStatusSchema.default("pending"),
  currentStage: z.string().nullable().default(null),
  failedStage: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  idempotencyKey: z.string(),
  /** Budget + policy envelope; NOT a copy of canonical domain data. */
  metadata: z.record(z.string(), z.unknown()).default({}),
  checksum: z.string().nullable().default(null),
  deadline: z.string().nullable().default(null),
  cancelled: z.boolean().default(false),
  ...auditShape,
});
export type RuntimeRun = z.infer<typeof runtimeRunSchema>;

export const runtimeStageSchema = z.object({
  id: z.string(),
  runId: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string(),
  stage: z.string(),
  status: runtimeStageStatusSchema.default("pending"),
  attempt: z.number().int().nonnegative().default(0),
  idempotencyKey: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  lastError: z.string().nullable().default(null),
  ...auditShape,
});
export type RuntimeStage = z.infer<typeof runtimeStageSchema>;

export const runtimeCheckpointSchema = z.object({
  id: z.string(),
  runId: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string(),
  stage: z.string(),
  status: runtimeCheckpointStatusSchema.default("valid"),
  artifactIds: z.array(z.string()).default([]),
  /** Checksums of the upstream artifacts this checkpoint was taken against. */
  sourceChecksums: z.record(z.string(), z.string()).default({}),
  nextStage: z.string().nullable().default(null),
  attempt: z.number().int().nonnegative().default(0),
  invalidationReason: z.string().nullable().default(null),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});
export type RuntimeCheckpoint = z.infer<typeof runtimeCheckpointSchema>;

export const runtimeArtifactSchema = z.object({
  id: z.string(),
  runId: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string(),
  kind: runtimeArtifactKindSchema,
  version: z.number().int().positive().default(1),
  checksum: z.string(),
  validationStatus: runtimeArtifactStatusSchema.default("unvalidated"),
  sourceArtifactIds: z.array(z.string()).default([]),
  /** The artifact ENVELOPE (or a storage reference) — never raw hidden reasoning. */
  envelope: z.record(z.string(), z.unknown()).default({}),
  payloadRef: z.string().nullable().default(null),
  idempotencyKey: z.string(),
  createdBy: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type RuntimeArtifact = z.infer<typeof runtimeArtifactSchema>;

export const runtimeReasoningJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string(),
  stage: z.string(),
  taskType: z.string(),
  status: runtimeReasoningJobStatusSchema.default("pending"),
  attempt: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(3),
  idempotencyKey: z.string(),
  /** Input references + budget envelope; not a copy of the evidence itself. */
  metadata: z.record(z.string(), z.unknown()).default({}),
  deadline: z.string().nullable().default(null),
  ...auditShape,
});
export type RuntimeReasoningJob = z.infer<typeof runtimeReasoningJobSchema>;

export const runtimeProviderAttemptSchema = z.object({
  id: z.string(),
  reasoningJobId: z.string(),
  runId: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string(),
  /** Opaque provider id — never a vendor branch in domain code. */
  providerId: z.string(),
  attempt: z.number().int().nonnegative(),
  status: runtimeProviderAttemptStatusSchema,
  retryDisposition: runtimeRetryDispositionSchema.nullable().default(null),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
  estimatedCost: z.number().nonnegative().nullable().default(null),
  actualCost: z.number().nonnegative().nullable().default(null),
  inputTokens: z.number().int().nonnegative().nullable().default(null),
  outputTokens: z.number().int().nonnegative().nullable().default(null),
  usageEstimated: z.boolean().default(true),
  /** A REFERENCE to the raw response — never the raw content. */
  rawResponseRef: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});
export type RuntimeProviderAttempt = z.infer<typeof runtimeProviderAttemptSchema>;

/** Findings / recommendations / snapshots / versions persist an envelope + checksum. */
const versionedRecordShape = {
  id: z.string(),
  runId: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string(),
  version: z.number().int().positive().default(1),
  checksum: z.string(),
  envelope: z.record(z.string(), z.unknown()).default({}),
  sourceArtifactIds: z.array(z.string()).default([]),
  idempotencyKey: z.string(),
  createdBy: z.string().nullable().default(null),
  createdAt: z.string(),
};

export const runtimeFindingSchema = z.object({ ...versionedRecordShape, domain: z.string().nullable().default(null), severity: z.string().nullable().default(null) });
export type RuntimeFinding = z.infer<typeof runtimeFindingSchema>;

export const runtimeRecommendationSchema = z.object({ ...versionedRecordShape, tier: z.string().nullable().default(null), priority: z.number().int().nullable().default(null) });
export type RuntimeRecommendation = z.infer<typeof runtimeRecommendationSchema>;

export const runtimeCompetitorSnapshotSchema = z.object({ ...versionedRecordShape, competitorCount: z.number().int().nonnegative().default(0) });
export type RuntimeCompetitorSnapshot = z.infer<typeof runtimeCompetitorSnapshotSchema>;

export const runtimeProposalVersionSchema = z.object({ ...versionedRecordShape, status: z.string(), supersedesId: z.string().nullable().default(null) });
export type RuntimeProposalVersion = z.infer<typeof runtimeProposalVersionSchema>;

export const runtimeNarrativeVersionSchema = z.object({ ...versionedRecordShape, audience: z.string(), status: z.string(), supersedesId: z.string().nullable().default(null) });
export type RuntimeNarrativeVersion = z.infer<typeof runtimeNarrativeVersionSchema>;

/* ---- 11 · event log (append-only) ------------------------------------------ */
export const runtimeEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  runId: z.string().nullable().default(null),
  stage: z.string().nullable().default(null),
  aggregateId: z.string(),
  aggregateType: z.string(),
  clientId: z.string().nullable(),
  scanId: z.string().nullable().default(null),
  /** Monotonic per (aggregateType, aggregateId) — deterministic ordering. */
  sequence: z.number().int().positive(),
  /** Structured payload — NO chain-of-thought, secrets, or raw provider content. */
  payload: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.string(),
  correlationId: z.string().nullable().default(null),
  causationId: z.string().nullable().default(null),
  actor: z.string().nullable().default(null),
  schemaVersion: z.string().default(RUNTIME_SCHEMA_VERSION),
});
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;

/* ---- 7 · job queue ---------------------------------------------------------- */
export const runtimeQueueJobSchema = z.object({
  id: z.string(),
  jobType: z.string(),
  clientId: z.string().nullable(),
  runId: z.string().nullable().default(null),
  scanId: z.string().nullable().default(null),
  stage: z.string().nullable().default(null),
  priority: z.number().int().default(0), // lower runs first
  status: runtimeQueueStatusSchema.default("queued"),
  availableAt: z.string(),
  attempt: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(5),
  leaseOwner: z.string().nullable().default(null),
  leaseExpiresAt: z.string().nullable().default(null),
  idempotencyKey: z.string(),
  payloadRef: z.string().nullable().default(null),
  payload: z.record(z.string(), z.unknown()).default({}),
  lastError: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string().nullable().default(null),
});
export type RuntimeQueueJob = z.infer<typeof runtimeQueueJobSchema>;

/* ---- 5 · idempotency -------------------------------------------------------- */
/** The outcome of an idempotent write. */
export const idempotentOutcomeSchema = z.enum(["created", "replayed", "conflict"]);
export type IdempotentOutcome = z.infer<typeof idempotentOutcomeSchema>;

export const idempotentResultSchema = z.object({
  outcome: idempotentOutcomeSchema,
  id: z.string().nullable().default(null),
  /** Present on `conflict`: the same key was reused with a different payload. */
  conflictDetail: z.string().nullable().default(null),
});
export type IdempotentResult = z.infer<typeof idempotentResultSchema>;

/* ---- 9 · retry scheduling --------------------------------------------------- */
export const retryScheduleSchema = z.object({
  disposition: runtimeRetryDispositionSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  /** Absolute time the job becomes eligible again; null when stopping. */
  retryAfter: z.string().nullable().default(null),
  backoffMs: z.number().int().nonnegative().default(0),
  fatal: z.boolean().default(false),
  reason: z.string(),
});
export type RetrySchedule = z.infer<typeof retryScheduleSchema>;

/* ---- 16 · operational read models ------------------------------------------ */
export const runtimeQueueDepthSchema = z.object({
  queued: z.number().int().nonnegative(),
  leased: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  deadLetter: z.number().int().nonnegative(),
  byJobType: z.record(z.string(), z.number()).default({}),
});
export type RuntimeQueueDepth = z.infer<typeof runtimeQueueDepthSchema>;

export const runtimeRunSummarySchema = z.object({
  run: runtimeRunSchema,
  stages: z.array(runtimeStageSchema).default([]),
  latestCheckpoint: runtimeCheckpointSchema.nullable().default(null),
  artifactCount: z.number().int().nonnegative().default(0),
  failedStage: z.string().nullable().default(null),
  eventCount: z.number().int().nonnegative().default(0),
});
export type RuntimeRunSummary = z.infer<typeof runtimeRunSummarySchema>;
