/* =============================================================================
 * AI Reasoning Orchestrator — CONTRACTS (PDF 27 §07 · AIS-001 §04/05/13).
 *
 * How reasoning work is planned, routed, validated, retried, reviewed, and
 * returned as STRUCTURED output — with grounding guards, provider-routing
 * integration, multi-pass orchestration, and full result provenance. Shapes
 * only; the deterministic logic is pure domain code
 * (@brightloop/domain/scan-engine/reasoning/*). NO live model execution, no
 * hidden chain-of-thought — every claim carries its evidence + confidence trace.
 * ========================================================================== */

import { z } from "zod";
import { reasoningStageSchema, evidenceStateSchema } from "./engine.js";
import { providerCapabilitySchema } from "./provider-registry.js";
import { evidenceConfidenceSchema, provenanceSchema, freshnessSchema, freshnessBandSchema } from "./evidence.js";
import { proposalPartSchema } from "./engine.js";

export const REASONING_SCHEMA_VERSION = "1.0";

/* ---- 1 · reasoning job ---------------------------------------------------- */
export const reasoningTaskTypeSchema = z.enum(["extraction", "reasoning", "writing"]);
export type ReasoningTaskType = z.infer<typeof reasoningTaskTypeSchema>;

export const reasoningJobStatusSchema = z.enum([
  "pending",
  "planned",
  "routed",
  "running",
  "validating",
  "completed",
  "failed",
  "cancelled",
  "blocked",
]);
export type ReasoningJobStatus = z.infer<typeof reasoningJobStatusSchema>;

export const reasoningInputRefsSchema = z.object({
  evidenceIds: z.array(z.string()).default([]),
  graphRefs: z.array(z.string()).default([]),
  graphSnapshotChecksum: z.string().nullable().default(null),
  discoveryManifestId: z.string().nullable().default(null),
});
export type ReasoningInputRefs = z.infer<typeof reasoningInputRefsSchema>;

export const reasoningBudgetSchema = z.object({
  costCeiling: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyCeilingMs: z.number().int().positive().default(30_000),
});
export type ReasoningBudget = z.infer<typeof reasoningBudgetSchema>;

export const providerRequirementsSchema = z.object({
  capabilities: z.array(providerCapabilitySchema).default([]),
  minContextTokens: z.number().int().nonnegative().default(0),
  preferredProviderIds: z.array(z.string()).default([]),
});
export type ProviderRequirements = z.infer<typeof providerRequirementsSchema>;

export const reasoningJobSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  taskType: reasoningTaskTypeSchema,
  stage: reasoningStageSchema,
  inputRefs: reasoningInputRefsSchema,
  requiredOutputs: z.array(z.string()).default([]), // output-contract kinds this job must return
  providerRequirements: providerRequirementsSchema,
  budget: reasoningBudgetSchema,
  deadline: z.string().nullable().default(null),
  priority: z.number().int().default(0),
  status: reasoningJobStatusSchema.default("pending"),
  attempt: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  cancelled: z.boolean().default(false),
});
export type ReasoningJob = z.infer<typeof reasoningJobSchema>;

export const reasoningJobEventSchema = z.enum(["plan", "route", "start", "validate", "complete", "fail", "cancel", "block", "unblock", "retry"]);
export type ReasoningJobEvent = z.infer<typeof reasoningJobEventSchema>;

/* ---- 3 · structured prompt input (no hidden chain-of-thought) ------------- */
export const reasoningInputSchema = z.object({
  jobId: z.string(),
  businessContext: z.record(z.string(), z.unknown()).default({}),
  evidenceRefs: z.array(z.string()).default([]),
  graphRefs: z.array(z.string()).default([]),
  taskObjective: z.string().max(2000),
  constraints: z.array(z.string()).default([]),
  policyRules: z.array(z.string()).default([]),
  allowedClaims: z.array(z.string()).default([]),
  prohibitedClaims: z.array(z.string()).default([]),
  outputSchemaId: z.string(),
  costBudget: z.number().nonnegative(),
  tokenBudget: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  deadline: z.string().nullable().default(null),
  providerCapabilityRequirements: z.array(providerCapabilitySchema).default([]),
});
export type ReasoningInput = z.infer<typeof reasoningInputSchema>;

/* ---- 4 · shared claim attribution (every claim carries its trace) --------- */
export const contradictionStatusSchema = z.enum(["none", "contradicted", "reconciled"]);
export type ContradictionStatus = z.infer<typeof contradictionStatusSchema>;

export const claimAttributionSchema = z.object({
  evidenceIds: z.array(z.string()), // grounding; guards require ≥1 for factual claims
  evidenceState: evidenceStateSchema,
  confidence: evidenceConfidenceSchema,
  provenance: provenanceSchema,
  freshness: freshnessSchema,
  limitations: z.array(z.string()), // must be present (empty allowed only when explicitly none)
  contradictionStatus: contradictionStatusSchema.default("none"),
});
export type ClaimAttribution = z.infer<typeof claimAttributionSchema>;

export const evidenceCitationSchema = z.object({
  evidenceId: z.string(),
  state: evidenceStateSchema,
  freshnessBand: freshnessBandSchema,
  sourceUrl: z.string().max(2048).nullable().default(null),
});
export type EvidenceCitation = z.infer<typeof evidenceCitationSchema>;

/* ---- 4 · structured outputs ----------------------------------------------- */
export const researchFindingSchema = claimAttributionSchema.extend({ id: z.string(), jobId: z.string(), statement: z.string().max(2000) });
export type ResearchFinding = z.infer<typeof researchFindingSchema>;

export const validationResultSchema = z.object({ passed: z.boolean(), rejections: z.array(z.object({ reason: z.string(), claimId: z.string().nullable().default(null), detail: z.string() })).default([]) });
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const validatedClaimSchema = claimAttributionSchema.extend({ id: z.string(), jobId: z.string(), claim: z.string().max(2000), validation: validationResultSchema });
export type ValidatedClaim = z.infer<typeof validatedClaimSchema>;

export const hypothesisSchema = claimAttributionSchema.extend({ id: z.string(), jobId: z.string(), statement: z.string().max(2000) });
export type Hypothesis = z.infer<typeof hypothesisSchema>;

export const counterHypothesisSchema = claimAttributionSchema.extend({ id: z.string(), jobId: z.string(), targetHypothesisId: z.string(), statement: z.string().max(2000) });
export type CounterHypothesis = z.infer<typeof counterHypothesisSchema>;

export const recommendationCandidateSchema = claimAttributionSchema.extend({
  id: z.string(),
  jobId: z.string(),
  title: z.string().max(200),
  rationale: z.string().max(2000),
  impact: z.number().int().min(0).max(100),
  difficulty: z.number().int().min(0).max(100),
});
export type RecommendationCandidate = z.infer<typeof recommendationCandidateSchema>;

export const executiveSummarySectionSchema = claimAttributionSchema.extend({ id: z.string(), jobId: z.string(), heading: z.string().max(200), body: z.string().max(4000) });
export type ExecutiveSummarySection = z.infer<typeof executiveSummarySectionSchema>;

export const proposalSectionSchema = claimAttributionSchema.extend({ id: z.string(), jobId: z.string(), part: proposalPartSchema, body: z.string().max(4000) });
export type ProposalSection = z.infer<typeof proposalSectionSchema>;

export const uncertaintyDeclarationSchema = z.object({ id: z.string(), jobId: z.string(), about: z.string().max(500), reason: z.string().max(1000), missingEvidence: z.array(z.string()).default([]) });
export type UncertaintyDeclaration = z.infer<typeof uncertaintyDeclarationSchema>;

/* ---- 5 · grounding / hallucination guards --------------------------------- */
export const groundingRejectionReasonSchema = z.enum([
  "no_evidence",
  "fabricated_competitor",
  "fabricated_metric",
  "unsupported_causal_claim",
  "certainty_exceeds_evidence",
  "references_unavailable_source",
  "missing_limitations",
  "malformed_citation",
  "stale_evidence",
  "prohibited_sensitive_claim",
]);
export type GroundingRejectionReason = z.infer<typeof groundingRejectionReasonSchema>;

export const groundingRejectionSchema = z.object({ reason: groundingRejectionReasonSchema, claimId: z.string().nullable().default(null), detail: z.string() });
export type GroundingRejection = z.infer<typeof groundingRejectionSchema>;

/* ---- 6 · evidence-validation support taxonomy ------------------------------
 * The five levels a validated claim can carry once measured against the evidence
 * that backs it. `supported` / `partially_supported` / `weak_support` are the
 * graded outcomes for a GROUNDED claim (ordered by evidence strength);
 * `unsupported` (no evidence, or an assertion beyond the evidence) and
 * `contradicted` (the evidence actively undermines the claim) are the two
 * negative outcomes a REJECTED claim maps to. A claim SURVIVES into the next
 * stage only when its level is one of the three positive grades. */
export const evidenceSupportLevelSchema = z.enum([
  "supported",
  "partially_supported",
  "weak_support",
  "unsupported",
  "contradicted",
]);
export type EvidenceSupportLevel = z.infer<typeof evidenceSupportLevelSchema>;

/** The three positive grades — a claim at one of these survives validation. */
export const SURVIVING_EVIDENCE_SUPPORT_LEVELS: readonly EvidenceSupportLevel[] = ["supported", "partially_supported", "weak_support"];

/** A per-claim support assessment: level, recomputed confidence, reason codes. */
export const evidenceSupportAssessmentSchema = z.object({
  level: evidenceSupportLevelSchema,
  /** Recalculated 0–100 confidence, derived from evidence quality — never inflated. */
  confidence: z.number().int().min(0).max(100),
  /** Stable, sorted, de-duplicated codes explaining the level + confidence. */
  reasonCodes: z.array(z.string()).default([]),
});
export type EvidenceSupportAssessment = z.infer<typeof evidenceSupportAssessmentSchema>;

/* ---- 7 · retry / fallback ------------------------------------------------- */
export const reasoningFailureKindSchema = z.enum(["retryable", "fatal", "validation", "budget_exhausted", "timeout", "cancelled"]);
export type ReasoningFailureKind = z.infer<typeof reasoningFailureKindSchema>;

export const partialOutputSchema = z.object({
  jobId: z.string(),
  stage: reasoningStageSchema,
  producedIds: z.array(z.string()).default([]),
  complete: z.boolean(),
});
export type PartialOutput = z.infer<typeof partialOutputSchema>;

/* ---- 8 · multi-pass ------------------------------------------------------- */
export const reasoningPassSchema = z.enum(["primary", "critic", "validation", "synthesis"]);
export type ReasoningPass = z.infer<typeof reasoningPassSchema>;

export const consensusMetadataSchema = z.object({
  agreement: z.number().min(0).max(1), // share of passes/agents that agree
  agreeing: z.array(z.string()).default([]),
  disagreeing: z.array(z.string()).default([]),
  resolved: z.boolean(),
});
export type ConsensusMetadata = z.infer<typeof consensusMetadataSchema>;

/* ---- 9 · result provenance ------------------------------------------------ */
export const modelMetadataSchema = z.object({
  provider: z.string(),
  model: z.string(),
  version: z.string().nullable().default(null),
});
export type ModelMetadata = z.infer<typeof modelMetadataSchema>;

export const reasoningResultProvenanceSchema = z.object({
  jobId: z.string(),
  stage: reasoningStageSchema,
  providerId: z.string().nullable(),
  model: modelMetadataSchema.nullable().default(null),
  routingDecision: z.string().nullable().default(null), // selected provider id / "no_provider"
  tokenEstimate: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  costEstimate: z.number().nonnegative(),
  sourceEvidenceIds: z.array(z.string()).default([]),
  graphSnapshotChecksum: z.string().nullable().default(null),
  schemaVersion: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable().default(null),
  validationStatus: z.enum(["passed", "failed", "skipped"]),
});
export type ReasoningResultProvenance = z.infer<typeof reasoningResultProvenanceSchema>;

/* ---- 10 · events ---------------------------------------------------------- */
export const reasoningEventTypeSchema = z.enum([
  "reasoning.job_created",
  "reasoning.planned",
  "reasoning.routed",
  "reasoning.started",
  "reasoning.validation_failed",
  "reasoning.retried",
  "reasoning.fallback_selected",
  "reasoning.completed",
  "reasoning.failed",
  "reasoning.cancelled",
]);
export type ReasoningEventType = z.infer<typeof reasoningEventTypeSchema>;

export const reasoningEventSchema = z.object({
  type: reasoningEventTypeSchema,
  jobId: z.string(),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type ReasoningEvent = z.infer<typeof reasoningEventSchema>;
