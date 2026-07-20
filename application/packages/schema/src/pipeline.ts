/* =============================================================================
 * End-to-End Business Intelligence Pipeline — CONTRACTS (PDF 27 §03/§04 · AIS-001 §04/L2).
 *
 * The canonical internal scan pipeline that wires the Phase-A layers together:
 * Discovery → Evidence Ingress → Evidence Bundle → Intelligence Graph → Reasoning
 * Jobs → Provider Execution → Validated Findings → Recommendation Candidates →
 * Scan Result → Internal Intelligence Report. Shapes only — the deterministic
 * orchestration is pure domain code
 * (@brightloop/domain/scan-engine/pipeline-run/*). No crawler runtime, no live AI,
 * no persistence, no pricing, no final ranking mathematics.
 *
 * NOTE ON NAMES: `pipelineRunStage` is the ORCHESTRATION stage list (this file).
 * It is distinct from `engineStage` (PDF-27's 13 knowledge-artifact stages) and
 * from `ScanStage`/`SCAN_PIPELINE` (PDF-26's 9 job stages) — all three coexist.
 * ========================================================================== */

import { z } from "zod";
import { indexDimensionSchema, evidenceStateSchema, recommendationTierSchema } from "./engine.js";
import { evidenceConfidenceSchema, provenanceSchema, coverageSummarySchema, evidenceConflictSchema } from "./evidence.js";
import { contradictionStatusSchema, validatedClaimSchema } from "./reasoning.js";

export const PIPELINE_SCHEMA_VERSION = "1.0";

/* ---- 1 · run status + 2 · orchestration stages ---------------------------- */
export const pipelineRunStatusSchema = z.enum([
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
export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;

/** The 13 orchestration stages, in canonical order. */
export const pipelineRunStageSchema = z.enum([
  "discovery_planning",
  "discovery_completion",
  "evidence_normalization",
  "evidence_validation",
  "graph_assembly",
  "graph_snapshot",
  "reasoning_job_creation",
  "provider_routing",
  "provider_execution",
  "grounding_validation",
  "finding_synthesis",
  "recommendation_candidates",
  "report_assembly",
]);
export type PipelineRunStage = z.infer<typeof pipelineRunStageSchema>;

/* ---- 3 · artifact registry ------------------------------------------------ */
export const artifactKindSchema = z.enum([
  "discovery_manifest",
  "evidence_ingress",
  "evidence_bundle",
  "intelligence_graph",
  "graph_snapshot",
  "reasoning_jobs",
  "execution_outcomes",
  "validated_claims",
  "findings",
  "recommendation_candidates",
  "internal_intelligence_report",
]);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const artifactValidationStatusSchema = z.enum(["valid", "invalid", "unvalidated"]);
export type ArtifactValidationStatus = z.infer<typeof artifactValidationStatusSchema>;

/** The envelope every pipeline artifact carries — identity, lineage, integrity. */
export const pipelineArtifactSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  scanId: z.string(),
  kind: artifactKindSchema,
  version: z.number().int().positive().default(1),
  checksum: z.string(), // deterministic content hash
  generatedAt: z.string(),
  sourceArtifactIds: z.array(z.string()).default([]), // upstream lineage
  validationStatus: artifactValidationStatusSchema.default("unvalidated"),
  provenance: z.record(z.string(), z.unknown()).default({}),
});
export type PipelineArtifact = z.infer<typeof pipelineArtifactSchema>;

/* ---- 4 · checkpoints ------------------------------------------------------ */
export const pipelineCheckpointSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  stage: pipelineRunStageSchema,
  at: z.string(),
  artifactIds: z.array(z.string()).default([]),
  /** false once an upstream artifact changed — downstream checkpoints invalidate. */
  valid: z.boolean().default(true),
});
export type PipelineCheckpoint = z.infer<typeof pipelineCheckpointSchema>;

/* ---- 5 · failure model ---------------------------------------------------- */
export const pipelineFailureKindSchema = z.enum([
  "discovery_failure",
  "evidence_validation_failure",
  "graph_validation_failure",
  "provider_routing_failure",
  "provider_execution_failure",
  "grounding_rejection",
  "budget_exhaustion",
  "timeout",
  "cancellation",
  "malformed_artifact",
  "blocked_dependency",
]);
export type PipelineFailureKind = z.infer<typeof pipelineFailureKindSchema>;

export const pipelineFailureSchema = z.object({
  kind: pipelineFailureKindSchema,
  stage: pipelineRunStageSchema.nullable().default(null),
  detail: z.string(),
  at: z.string(),
  retryable: z.boolean().default(false),
  /** Failed outputs are preserved for audit, never discarded. */
  artifactIds: z.array(z.string()).default([]),
});
export type PipelineFailure = z.infer<typeof pipelineFailureSchema>;

/* ---- 6 · budget propagation ----------------------------------------------- */
export const pipelineBudgetSchema = z.object({
  scanCeiling: z.number().nonnegative(), // hard ceiling for the whole run
  stageCeiling: z.number().nonnegative(), // per-stage ceiling
  reasoningJobCeiling: z.number().nonnegative(), // per reasoning job
  softWarningAt: z.number().nonnegative(),
});
export type PipelineBudget = z.infer<typeof pipelineBudgetSchema>;

export const pipelineSpendSchema = z.object({
  estimated: z.number().nonnegative().default(0),
  actual: z.number().nonnegative().default(0),
  remaining: z.number(), // scanCeiling − actual (may go negative to expose overrun)
  softWarning: z.boolean().default(false),
  hardStop: z.boolean().default(false),
});
export type PipelineSpend = z.infer<typeof pipelineSpendSchema>;

/* ---- 1 · the pipeline run ------------------------------------------------- */
export const pipelineAttemptSchema = z.object({
  stage: pipelineRunStageSchema,
  attempt: z.number().int().nonnegative(),
  ok: z.boolean(),
  failureKind: pipelineFailureKindSchema.nullable().default(null),
  at: z.string(),
});
export type PipelineAttempt = z.infer<typeof pipelineAttemptSchema>;

export const pipelineRunSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  discoveryRequestId: z.string().nullable().default(null),
  status: pipelineRunStatusSchema.default("pending"),
  currentStage: pipelineRunStageSchema.nullable().default(null),
  completedStages: z.array(pipelineRunStageSchema).default([]),
  failedStage: pipelineRunStageSchema.nullable().default(null),
  checkpoints: z.array(pipelineCheckpointSchema).default([]),
  attempts: z.array(pipelineAttemptSchema).default([]),
  budget: pipelineBudgetSchema,
  spend: pipelineSpendSchema,
  deadline: z.string().nullable().default(null),
  cancelled: z.boolean().default(false),
  createdAt: z.string(),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
});
export type PipelineRun = z.infer<typeof pipelineRunSchema>;

/* ---- 7 · findings --------------------------------------------------------- */
export const findingSeveritySchema = z.enum(["low", "moderate", "high", "critical"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

/** A deterministic finding derived from validated claims — never free-form. */
export const pipelineFindingSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  title: z.string().max(200),
  domain: indexDimensionSchema,
  evidenceIds: z.array(z.string()),
  graphNodeIds: z.array(z.string()).default([]),
  evidenceState: evidenceStateSchema,
  confidence: evidenceConfidenceSchema,
  severity: findingSeveritySchema,
  priority: z.number().int().min(0).max(100), // deterministic, computed
  businessImpact: z.string().max(1000),
  limitations: z.array(z.string()).default([]),
  contradictionStatus: contradictionStatusSchema.default("none"),
  provenance: provenanceSchema,
});
export type PipelineFinding = z.infer<typeof pipelineFindingSchema>;

/* ---- 8 · recommendation candidates (NOT final ranking mathematics) -------- */
export const pipelineRecommendationCandidateSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  findingIds: z.array(z.string()).min(1), // a candidate exists only because a finding requires it
  evidenceIds: z.array(z.string()),
  targetDomains: z.array(indexDimensionSchema).default([]),
  tier: recommendationTierSchema,
  impact: z.number().int().min(0).max(100),
  effort: z.number().int().min(0).max(100),
  confidence: evidenceConfidenceSchema,
  dependencies: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  expectedOutcome: z.string().max(1000),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true), // human gate (AIS-001 §14)
});
export type PipelineRecommendationCandidate = z.infer<typeof pipelineRecommendationCandidateSchema>;

/* ---- 9 · internal intelligence report ------------------------------------- */
export const domainSummarySchema = z.object({
  domain: indexDimensionSchema,
  summary: z.string().max(2000),
  score: z.number().int().min(0).max(100).nullable().default(null),
  confidence: evidenceConfidenceSchema.nullable().default(null),
  findingIds: z.array(z.string()).default([]),
});
export type DomainSummary = z.infer<typeof domainSummarySchema>;

export const indexSummarySchema = z.object({
  overall: z.number().int().min(0).max(100).nullable().default(null),
  byDimension: z.record(z.string(), z.number()).default({}),
});
export type IndexSummary = z.infer<typeof indexSummarySchema>;

export const internalIntelligenceReportSchema = z.object({
  id: z.string(),
  pipelineRunId: z.string(),
  scanId: z.string(),
  generatedAt: z.string(),
  schemaVersion: z.string(),
  executiveOverview: z.string().max(4000),
  businessProfile: z.record(z.string(), z.unknown()).default({}),
  indexSummary: indexSummarySchema,
  domainSummaries: z.array(domainSummarySchema).default([]),
  findingsLedger: z.array(pipelineFindingSchema).default([]),
  evidenceCoverage: coverageSummarySchema.nullable().default(null),
  confidenceSummary: evidenceConfidenceSchema.nullable().default(null),
  conflicts: z.array(evidenceConflictSchema).default([]),
  strongestRisks: z.array(z.string()).default([]), // finding ids, severity-ordered
  highestConfidenceOpportunities: z.array(z.string()).default([]), // finding ids
  recommendationCandidates: z.array(pipelineRecommendationCandidateSchema).default([]),
  unavailableData: z.array(z.string()).default([]), // honestly reported, never filled
  limitations: z.array(z.string()).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
  pipelineMetadata: z.object({
    runId: z.string(),
    completedStages: z.array(pipelineRunStageSchema).default([]),
    estimatedSpend: z.number().nonnegative(),
    actualSpend: z.number().nonnegative(),
    artifactIds: z.array(z.string()).default([]),
  }),
});
export type InternalIntelligenceReport = z.infer<typeof internalIntelligenceReportSchema>;

/* ---- 11 · pipeline events (pure; no transport) ---------------------------- */
export const pipelineEventTypeSchema = z.enum([
  "pipeline.created",
  "pipeline.stage_started",
  "pipeline.stage_completed",
  "pipeline.stage_failed",
  "pipeline.checkpoint_created",
  "pipeline.resumed",
  "pipeline.budget_warning",
  "pipeline.blocked",
  "pipeline.cancelled",
  "pipeline.completed",
]);
export type PipelineEventType = z.infer<typeof pipelineEventTypeSchema>;

export const pipelineEventSchema = z.object({
  type: pipelineEventTypeSchema,
  pipelineRunId: z.string(),
  stage: pipelineRunStageSchema.nullable().default(null),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type PipelineEvent = z.infer<typeof pipelineEventSchema>;

/* ---- 10 · the runner's aggregate outcome ---------------------------------- */
export const pipelineOutcomeSchema = z.object({
  pipelineRunId: z.string(),
  status: pipelineRunStatusSchema,
  run: pipelineRunSchema,
  artifacts: z.array(pipelineArtifactSchema).default([]),
  validatedClaims: z.array(validatedClaimSchema).default([]),
  findings: z.array(pipelineFindingSchema).default([]),
  candidates: z.array(pipelineRecommendationCandidateSchema).default([]),
  report: internalIntelligenceReportSchema.nullable().default(null),
  failure: pipelineFailureSchema.nullable().default(null),
  events: z.array(pipelineEventSchema).default([]),
});
export type PipelineOutcome = z.infer<typeof pipelineOutcomeSchema>;
