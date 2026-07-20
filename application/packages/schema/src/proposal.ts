/* =============================================================================
 * Proposal Intelligence Engine — CONTRACTS (AIS-004 · PDF 27 §12).
 *
 * Converts validated findings, ranked recommendations, decision briefs, and
 * competitor context into an approval-ready, DATA-ONLY proposal artifact.
 *
 * GOVERNING RULE (AIS-004): "A proposal is a commitment, not a pitch. Every line
 * is traceable to an approved recommendation and its evidence. The engine drafts;
 * a human approves before anything reaches a client. Pricing, scope, and claims
 * are derived — never invented to win a deal."
 *
 * Encoded here: no scope/deliverable without a source recommendation or finding;
 * no fabricated ROI, revenue uplift, or proof; unavailable baselines stay
 * unavailable; a material change invalidates prior approval. NO pricing is
 * calculated — only the INPUTS a future pricing engine will consume.
 *
 * NOTE ON NAMES: everything is `Proposal*`-prefixed because `Proposal`,
 * `Deliverable`, `Milestone`, `SuccessMetric`, `Approval`, `ProposalSection`, and
 * `ProposalPart` are already taken by earlier modules, which stay unchanged.
 * ========================================================================== */

import { z } from "zod";
import { indexDimensionSchema, evidenceStateSchema, recommendationTierSchema } from "./engine.js";
import { evidenceConfidenceSchema, provenanceSchema } from "./evidence.js";

export const PROPOSAL_SCHEMA_VERSION = "1.0";
export const PROPOSAL_MODEL_VERSION = "ais-004-1.0";

/* ---- shared bands ---------------------------------------------------------- */
/** Bands, never point estimates — the engine does not invent precision. */
export const effortBandSchema = z.enum(["xs", "s", "m", "l", "xl", "unavailable"]);
export type EffortBand = z.infer<typeof effortBandSchema>;

export const riskBandSchema = z.enum(["low", "moderate", "high", "critical", "unknown"]);
export type RiskBand = z.infer<typeof riskBandSchema>;

export const durationBandSchema = z.enum(["days", "weeks", "one_month", "quarter", "multi_quarter", "unavailable"]);
export type DurationBand = z.infer<typeof durationBandSchema>;

export const priorityBandSchema = z.enum(["critical", "high", "medium", "low"]);
export type PriorityBand = z.infer<typeof priorityBandSchema>;

/* ---- 1 · proposal request -------------------------------------------------- */
export const stakeholderRoleSchema = z.object({
  role: z.string().max(120),
  responsibility: z.string().max(500),
  isApprover: z.boolean().default(false),
});
export type StakeholderRole = z.infer<typeof stakeholderRoleSchema>;

/** Budget is NEVER inferred. Absent ⇒ `provided:false` and null bounds. */
export const budgetRangeSchema = z.object({
  provided: z.boolean(),
  low: z.number().nonnegative().nullable().default(null),
  high: z.number().nonnegative().nullable().default(null),
  currency: z.string().max(8).nullable().default(null),
});
export type BudgetRange = z.infer<typeof budgetRangeSchema>;

export const paymentStructureSchema = z.enum(["milestone", "monthly", "upfront", "hybrid", "unspecified"]);
export type PaymentStructure = z.infer<typeof paymentStructureSchema>;

export const proposalRequestSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  prospectId: z.string().nullable().default(null),
  businessProfile: z.record(z.string(), z.unknown()).default({}),
  selectedRecommendationIds: z.array(z.string()).default([]),
  selectedScenarioId: z.string().nullable().default(null),
  decisionBriefId: z.string().nullable().default(null),
  competitorSnapshotId: z.string().nullable().default(null),
  targetOutcomes: z.array(z.string().max(500)).default([]),
  constraints: z.array(z.string().max(500)).default([]),
  requestedServices: z.array(z.string().max(200)).default([]),
  excludedServices: z.array(z.string().max(200)).default([]),
  deliveryHorizon: durationBandSchema.default("unavailable"),
  budgetRange: budgetRangeSchema,
  preferredPaymentStructure: paymentStructureSchema.default("unspecified"),
  stakeholderRoles: z.array(stakeholderRoleSchema).default([]),
  brandProfileRef: z.string().nullable().default(null),
  approvalRequirements: z.array(z.string().max(200)).default([]),
  sourceArtifactIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type ProposalRequest = z.infer<typeof proposalRequestSchema>;

/* ---- 2 · strategy ---------------------------------------------------------- */
/** Every statement carries the ids it derives from — no free-hand sales copy. */
export const strategyStatementSchema = z.object({
  statement: z.string().max(2000),
  findingIds: z.array(z.string()).default([]),
  recommendationIds: z.array(z.string()).default([]),
  competitorEvidenceIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  /** False when nothing traceable backs it — such a statement is rejected. */
  supported: z.boolean(),
});
export type StrategyStatement = z.infer<typeof strategyStatementSchema>;

export const proposalWorkstreamSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  objective: z.string().max(1000),
  recommendationIds: z.array(z.string()).min(1),
  affectedDomains: z.array(indexDimensionSchema).default([]),
  effortBand: effortBandSchema,
  durationBand: durationBandSchema,
  dependencies: z.array(z.string()).default([]),
  tier: recommendationTierSchema,
  confidence: z.number().min(0).max(100),
});
export type ProposalWorkstream = z.infer<typeof proposalWorkstreamSchema>;

export const proposalStrategySchema = z.object({
  id: z.string(),
  proposalRequestId: z.string(),
  coreProblem: strategyStatementSchema,
  desiredFutureState: strategyStatementSchema,
  transformationThesis: strategyStatementSchema,
  workstreams: z.array(proposalWorkstreamSchema).default([]),
  deliveryApproach: z.string().max(2000),
  sequencingRationale: z.string().max(2000),
  dependencies: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  expectedOutcomes: z.array(strategyStatementSchema).default([]),
  confidence: z.number().min(0).max(100),
  evidenceCoverage: z.number().min(0).max(1),
  /** Statements that failed the traceability check and were dropped. */
  rejectedStatements: z.array(z.object({ statement: z.string(), reason: z.string() })).default([]),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true),
  modelVersion: z.string(),
});
export type ProposalStrategy = z.infer<typeof proposalStrategySchema>;

/* ---- 3 · scope ------------------------------------------------------------- */
export const scopeKindSchema = z.enum([
  "mandatory",
  "optional",
  "excluded",
  "deferred",
  "client_responsibility",
  "provider_responsibility",
  "assumption",
  "out_of_scope_boundary",
]);
export type ScopeKind = z.infer<typeof scopeKindSchema>;

export const proposalScopeItemSchema = z.object({
  id: z.string(),
  kind: scopeKindSchema,
  title: z.string().max(200),
  description: z.string().max(2000),
  /** Work must trace to a recommendation or a finding — enforced in the domain. */
  sourceRecommendationIds: z.array(z.string()).default([]),
  sourceFindingIds: z.array(z.string()).default([]),
  workstreamId: z.string().nullable().default(null),
  affectedDomains: z.array(indexDimensionSchema).default([]),
  priority: priorityBandSchema,
  confidence: z.number().min(0).max(100),
  effortBand: effortBandSchema,
  riskBand: riskBandSchema,
  dependencies: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string().max(500)).default([]),
  changeControlTriggers: z.array(z.string().max(300)).default([]),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true),
});
export type ProposalScopeItem = z.infer<typeof proposalScopeItemSchema>;

/* ---- 4 · deliverables ------------------------------------------------------ */
export const deliverableStatusSchema = z.enum(["proposed", "approved", "in_progress", "blocked", "delivered", "accepted", "rejected", "deferred"]);
export type DeliverableStatus = z.infer<typeof deliverableStatusSchema>;

export const proposalDeliverableSchema = z.object({
  id: z.string(),
  workstreamId: z.string(),
  title: z.string().max(200),
  description: z.string().max(2000),
  linkedScopeIds: z.array(z.string()).min(1),
  format: z.string().max(120),
  ownerRole: z.string().max(120).nullable().default(null),
  acceptanceCriteria: z.array(z.string().max(500)).default([]),
  dependencies: z.array(z.string()).default([]),
  targetMilestoneId: z.string().nullable().default(null),
  qualityCriteria: z.array(z.string().max(500)).default([]),
  reviewGates: z.array(z.string().max(200)).default([]),
  evidenceOfCompletion: z.array(z.string().max(300)).default([]),
  status: deliverableStatusSchema.default("proposed"),
  limitations: z.array(z.string()).default([]),
});
export type ProposalDeliverable = z.infer<typeof proposalDeliverableSchema>;

/* ---- 5 · phases ------------------------------------------------------------ */
export const phaseKindSchema = z.enum(["discovery", "stabilize", "build", "optimize", "future"]);
export type PhaseKind = z.infer<typeof phaseKindSchema>;

export const proposalPhaseSchema = z.object({
  id: z.string(),
  kind: phaseKindSchema,
  order: z.number().int().nonnegative(),
  objective: z.string().max(1000),
  workstreamIds: z.array(z.string()).default([]),
  deliverableIds: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  milestoneIds: z.array(z.string()).default([]),
  /** A BAND — never an invented date. */
  durationBand: durationBandSchema,
  entryCriteria: z.array(z.string().max(500)).default([]),
  exitCriteria: z.array(z.string().max(500)).default([]),
  risks: z.array(z.string()).default([]),
  approvals: z.array(z.string().max(200)).default([]),
  measurableOutcomes: z.array(z.string().max(500)).default([]),
  limitations: z.array(z.string()).default([]),
});
export type ProposalPhase = z.infer<typeof proposalPhaseSchema>;

/* ---- 6 · milestones -------------------------------------------------------- */
export const milestoneStatusSchema = z.enum(["proposed", "approved", "in_progress", "blocked", "achieved", "missed", "deferred"]);
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const proposalMilestoneSchema = z.object({
  id: z.string(),
  phaseId: z.string(),
  title: z.string().max(200),
  targetOutcome: z.string().max(1000),
  deliverableIds: z.array(z.string()).default([]),
  prerequisiteMilestoneIds: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string().max(500)).default([]),
  ownerRole: z.string().max(120).nullable().default(null),
  approverRole: z.string().max(120).nullable().default(null),
  reviewGate: z.boolean().default(false),
  status: milestoneStatusSchema.default("proposed"),
  /** A relative window band, not a date. */
  dueWindow: durationBandSchema,
  confidence: z.number().min(0).max(100),
  limitations: z.array(z.string()).default([]),
});
export type ProposalMilestone = z.infer<typeof proposalMilestoneSchema>;

export const milestoneSequenceSchema = z.object({
  order: z.array(z.string()).default([]),
  blocked: z.array(z.string()).default([]),
  issues: z.array(z.object({ kind: z.enum(["cycle", "unknown_prerequisite", "self_reference"]), milestoneIds: z.array(z.string()), detail: z.string() })).default([]),
  acyclic: z.boolean(),
});
export type MilestoneSequence = z.infer<typeof milestoneSequenceSchema>;

/* ---- 7 · success metrics --------------------------------------------------- */
export const metricCadenceSchema = z.enum(["weekly", "monthly", "quarterly", "per_milestone", "unspecified"]);
export type MetricCadence = z.infer<typeof metricCadenceSchema>;

export const proposalSuccessMetricSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  /** Null + `baselineAvailable:false` when no baseline could be evidenced. */
  baseline: z.number().nullable().default(null),
  baselineAvailable: z.boolean(),
  target: z.number().nullable().default(null),
  /** True when the target is modelled rather than measured — always labelled. */
  targetIsEstimated: z.boolean().default(false),
  unit: z.string().max(60).nullable().default(null),
  measurementMethod: z.string().max(500),
  dataSource: z.string().max(300).nullable().default(null),
  cadence: metricCadenceSchema.default("unspecified"),
  ownerRole: z.string().max(120).nullable().default(null),
  confidence: z.number().min(0).max(100),
  evidenceState: evidenceStateSchema,
  evidenceIds: z.array(z.string()).default([]),
  targetHorizon: durationBandSchema,
  reviewThreshold: z.number().nullable().default(null),
  affectedDomains: z.array(indexDimensionSchema).default([]),
  limitations: z.array(z.string()).default([]),
});
export type ProposalSuccessMetric = z.infer<typeof proposalSuccessMetricSchema>;

/* ---- 8 · assumptions, risks, exclusions ------------------------------------ */
export const proposalItemKindSchema = z.enum([
  "assumption",
  "dependency",
  "delivery_risk",
  "commercial_risk",
  "technical_risk",
  "client_side_risk",
  "exclusion",
  "unresolved_question",
]);
export type ProposalItemKind = z.infer<typeof proposalItemKindSchema>;

export const proposalQualifierSchema = z.object({
  id: z.string(),
  kind: proposalItemKindSchema,
  title: z.string().max(200),
  detail: z.string().max(2000),
  source: z.string().max(300), // what surfaced it (finding/recommendation/constraint id or policy)
  severity: riskBandSchema,
  probability: z.number().min(0).max(1).nullable().default(null),
  impact: riskBandSchema,
  mitigation: z.string().max(1000).nullable().default(null),
  ownerRole: z.string().max(120).nullable().default(null),
  reviewDate: z.string().nullable().default(null),
  confidence: z.number().min(0).max(100),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true),
});
export type ProposalQualifier = z.infer<typeof proposalQualifierSchema>;

/* ---- 9 · investment structure INPUTS (no pricing) -------------------------- */
export const serviceTierSchema = z.enum(["essential", "standard", "premium", "enterprise", "unspecified"]);
export type ServiceTier = z.infer<typeof serviceTierSchema>;

export const supportLevelSchema = z.enum(["none", "standard", "priority", "dedicated", "unspecified"]);
export type SupportLevel = z.infer<typeof supportLevelSchema>;

/**
 * Everything a FUTURE pricing engine needs — and nothing more. No price, rate,
 * total, invoice, or payment is computed anywhere in this sprint.
 */
export const investmentStructureInputsSchema = z.object({
  workstreamEffortBands: z.record(z.string(), effortBandSchema).default({}),
  roleMix: z.array(z.object({ role: z.string().max(120), allocationBand: effortBandSchema })).default([]),
  durationBands: z.record(z.string(), durationBandSchema).default({}),
  deliveryComplexity: riskBandSchema,
  dependencyBurden: z.number().int().nonnegative(),
  riskPremiumInputs: z.array(z.object({ source: z.string().max(200), band: riskBandSchema })).default([]),
  optionality: z.array(z.string()).default([]), // optional scope ids
  supportLevel: supportLevelSchema.default("unspecified"),
  serviceTier: serviceTierSchema.default("unspecified"),
  hasSetupComponent: z.boolean().default(false),
  hasRecurringComponent: z.boolean().default(false),
  milestonePaymentPreference: paymentStructureSchema.default("unspecified"),
  depositRequired: z.boolean().default(false),
  currency: z.string().max(8).nullable().default(null),
  taxRegion: z.string().max(120).nullable().default(null),
  discountEligibilityInputs: z.array(z.string().max(200)).default([]),
  /** True when the client supplied no budget — never inferred. */
  budgetUnavailable: z.boolean(),
  limitations: z.array(z.string()).default([]),
  modelVersion: z.string(),
});
export type InvestmentStructureInputs = z.infer<typeof investmentStructureInputsSchema>;

/* ---- 10 · option packages -------------------------------------------------- */
export const packageKindSchema = z.enum(["essential", "recommended", "accelerated", "strategic"]);
export type PackageKind = z.infer<typeof packageKindSchema>;

export const proposalOptionPackageSchema = z.object({
  id: z.string(),
  kind: packageKindSchema,
  title: z.string().max(200),
  workstreamIds: z.array(z.string()).default([]),
  deliverableIds: z.array(z.string()).default([]),
  excludedWorkstreamIds: z.array(z.string()).default([]),
  durationBand: durationBandSchema,
  effortBand: effortBandSchema,
  expectedOutcomes: z.array(z.string().max(500)).default([]),
  risks: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  /** The deterministic rule that produced this package's contents. */
  derivationRule: z.string().max(500),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true),
});
export type ProposalOptionPackage = z.infer<typeof proposalOptionPackageSchema>;

/* ---- 11 · case-study / proof inputs (contract only) ------------------------ */
export const proofTypeSchema = z.enum(["case_study", "metric_outcome", "reference", "certification", "sample_work"]);
export type ProofType = z.infer<typeof proofTypeSchema>;

export const proofVerificationSchema = z.enum(["verified", "unverified", "expired", "unavailable"]);
export type ProofVerification = z.infer<typeof proofVerificationSchema>;

/**
 * A REFERENCE to proof the operator already holds. The engine never authors a
 * testimonial, result, or case study — unverified/unapproved proof may not be used.
 */
export const caseStudyReferenceSchema = z.object({
  id: z.string(),
  proofType: proofTypeSchema,
  comparableBusinessProfile: z.record(z.string(), z.unknown()).default({}),
  relevantOutcome: z.string().max(1000),
  source: z.string().max(300),
  verification: proofVerificationSchema,
  approvedForUse: z.boolean(),
  limitations: z.array(z.string()).default([]),
});
export type CaseStudyReference = z.infer<typeof caseStudyReferenceSchema>;

/* ---- 14 · approvals -------------------------------------------------------- */
export const approvalDecisionSchema = z.enum(["pending", "approved", "rejected", "approved_with_conditions"]);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const proposalApprovalSchema = z.object({
  id: z.string(),
  reviewerRole: z.string().max(120),
  required: z.boolean().default(true),
  order: z.number().int().nonnegative().default(0),
  decision: approvalDecisionSchema.default("pending"),
  conditions: z.array(z.string().max(500)).default([]),
  commentRef: z.string().nullable().default(null), // metadata pointer, not free text
  decidedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  /** Set true when a material revision reset this approval. */
  resetByRevision: z.boolean().default(false),
});
export type ProposalApproval = z.infer<typeof proposalApprovalSchema>;

/* ---- 12 · the proposal artifact -------------------------------------------- */
export const proposalStatusSchema = z.enum([
  "draft",
  "internal_review",
  "approved_for_send",
  "sent",
  "viewed",
  "revision_requested",
  "accepted",
  "rejected",
  "expired",
  "withdrawn",
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalArtifactSchema = z.object({
  id: z.string(),
  proposalRequestId: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  version: z.number().int().positive(),
  status: proposalStatusSchema.default("draft"),
  title: z.string().max(300),
  executiveSummary: z.object({
    headline: z.string().max(500),
    keyPoints: z.array(strategyStatementSchema).default([]),
    findingCount: z.number().int().nonnegative(),
    recommendationCount: z.number().int().nonnegative(),
  }),
  businessContext: z.record(z.string(), z.unknown()).default({}),
  evidenceSummary: z.object({
    evidenceIds: z.array(z.string()).default([]),
    coverage: z.number().min(0).max(1),
    confidence: evidenceConfidenceSchema.nullable().default(null),
    gaps: z.array(z.string()).default([]),
  }),
  competitorContext: z.object({
    snapshotId: z.string().nullable().default(null),
    marketPercentile: z.number().min(0).max(100).nullable().default(null),
    supportsMarketClaims: z.boolean().default(false),
    competitorIds: z.array(z.string()).default([]),
  }),
  strategy: proposalStrategySchema,
  optionPackages: z.array(proposalOptionPackageSchema).default([]),
  selectedPackageId: z.string().nullable().default(null),
  scope: z.array(proposalScopeItemSchema).default([]),
  deliverables: z.array(proposalDeliverableSchema).default([]),
  phases: z.array(proposalPhaseSchema).default([]),
  milestones: z.array(proposalMilestoneSchema).default([]),
  milestoneSequence: milestoneSequenceSchema.nullable().default(null),
  successMetrics: z.array(proposalSuccessMetricSchema).default([]),
  qualifiers: z.array(proposalQualifierSchema).default([]), // assumptions, risks, exclusions
  investmentInputs: investmentStructureInputsSchema,
  proofReferences: z.array(caseStudyReferenceSchema).default([]),
  approvals: z.array(proposalApprovalSchema).default([]),
  approvalRequirementsMet: z.boolean().default(false),
  validityPeriodDays: z.number().int().positive().nullable().default(null),
  sourceArtifactIds: z.array(z.string()).default([]),
  modelVersions: z.record(z.string(), z.string()).default({}),
  provenance: z.record(z.string(), z.unknown()).default({}),
  checksum: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProposalArtifact = z.infer<typeof proposalArtifactSchema>;

/* ---- 13 · versioning & revisions ------------------------------------------ */
export const revisionReasonSchema = z.enum([
  "scope_change",
  "recommendation_change",
  "option_package_change",
  "milestone_change",
  "source_artifact_change",
  "pricing_input_change",
  "client_request",
  "internal_correction",
]);
export type RevisionReason = z.infer<typeof revisionReasonSchema>;

export const proposalRevisionSchema = z.object({
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
  reasons: z.array(revisionReasonSchema).default([]),
  changeSummary: z.array(z.string().max(500)).default([]),
  /** True when the change resets prior approvals (AIS-004 approval gate). */
  material: z.boolean(),
  approvalsReset: z.array(z.string()).default([]),
  at: z.string(),
});
export type ProposalRevision = z.infer<typeof proposalRevisionSchema>;

/* ---- 16 · events ----------------------------------------------------------- */
export const proposalEventTypeSchema = z.enum([
  "proposal.requested",
  "proposal.strategy_created",
  "proposal.scope_created",
  "proposal.options_created",
  "proposal.version_created",
  "proposal.review_required",
  "proposal.approved_for_send",
  "proposal.revision_requested",
  "proposal.accepted",
  "proposal.rejected",
  "proposal.expired",
]);
export type ProposalEventType = z.infer<typeof proposalEventTypeSchema>;

export const proposalEventSchema = z.object({
  type: proposalEventTypeSchema,
  proposalId: z.string().nullable().default(null),
  scanId: z.string(),
  version: z.number().int().positive().nullable().default(null),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type ProposalEvent = z.infer<typeof proposalEventSchema>;

/* ---- 15 · pipeline stage result -------------------------------------------- */
export const proposalIntelligenceResultSchema = z.object({
  scanId: z.string(),
  pipelineRunId: z.string().nullable().default(null),
  request: proposalRequestSchema,
  strategy: proposalStrategySchema,
  scope: z.array(proposalScopeItemSchema).default([]),
  deliverables: z.array(proposalDeliverableSchema).default([]),
  phases: z.array(proposalPhaseSchema).default([]),
  milestones: z.array(proposalMilestoneSchema).default([]),
  optionPackages: z.array(proposalOptionPackageSchema).default([]),
  artifact: proposalArtifactSchema.nullable().default(null),
  events: z.array(proposalEventSchema).default([]),
});
export type ProposalIntelligenceResult = z.infer<typeof proposalIntelligenceResultSchema>;

export { provenanceSchema };
