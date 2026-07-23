/* =============================================================================
 * Prospect Intelligence — CONTRACTS (Phase C · Sprint C5).
 *
 * The missing layer between evidence and a proposal: evidence → business
 * intelligence → executive summary → transformation opportunities.
 *
 * Every shape here enforces the sprint's non-negotiables at the TYPE level:
 *   - a claim-bearing record REQUIRES at least one evidence id (`.min(1)`);
 *   - a score REQUIRES its calculation (formula + inputs + missing factors);
 *   - an unknown field is `null`, never a filled-in guess;
 *   - a category with no evidence is `available: false`, never a zero score;
 *   - every record carries its own `limitations`.
 *
 * These are DERIVED observations, not proposals and not pricing. Nothing in this
 * contract set can express a price, a timeline, or a commitment.
 * ========================================================================== */

import { z } from "zod";
import { evidenceConfidenceSchema } from "./evidence.js";
import { indexDimensionSchema } from "./engine.js";

/* ---- 1 · maturity categories ------------------------------------------------ */

/** The thirteen assessed capability categories (§ Business Maturity). */
export const maturityCategorySchema = z.enum([
  "website",
  "seo",
  "branding",
  "trust",
  "accessibility",
  "content",
  "lead_capture",
  "performance",
  "automation",
  "analytics",
  "social_presence",
  "customer_journey",
  "operations",
]);
export type MaturityCategory = z.infer<typeof maturityCategorySchema>;

/**
 * Category weights for the composite maturity score. They sum to 100 over ALL
 * categories; when a category is unavailable its weight is REDISTRIBUTED across
 * the remaining scored categories rather than counted as zero.
 */
export const MATURITY_CATEGORY_WEIGHTS: Record<MaturityCategory, number> = {
  website: 12,
  seo: 11,
  trust: 10,
  content: 10,
  lead_capture: 10,
  customer_journey: 9,
  branding: 8,
  accessibility: 7,
  social_presence: 6,
  performance: 6,
  analytics: 4,
  automation: 4,
  operations: 3,
};

/* ---- 2 · calculation trace -------------------------------------------------- */

/**
 * The full derivation of a score. `formula` is the literal expression evaluated,
 * `inputs` the named values substituted into it. There is no hidden math: a
 * reader can recompute the score by hand from this record alone.
 */
export const scoreCalculationSchema = z.object({
  formula: z.string().max(400),
  inputs: z.record(z.string(), z.number()),
  /** Signals that contributed. */
  signalCount: z.number().int().nonnegative(),
  /** Named signals with no supporting evidence — excluded, never zeroed. */
  missingSignals: z.array(z.string()).default([]),
});
export type ScoreCalculation = z.infer<typeof scoreCalculationSchema>;

/** One assessed capability category. `available:false` ⇒ `score` is null. */
export const maturityScoreSchema = z.object({
  category: maturityCategorySchema,
  /** 0–100, higher is better. Null when no evidence supports the category. */
  score: z.number().int().min(0).max(100).nullable(),
  /** The weight actually applied after redistribution (0 when unavailable). */
  weight: z.number().min(0).max(100),
  confidence: evidenceConfidenceSchema,
  evidenceIds: z.array(z.string()).default([]),
  calculation: scoreCalculationSchema,
  limitations: z.array(z.string()).default([]),
  /** False when the category could not be assessed from the available evidence. */
  available: z.boolean(),
});
export type MaturityScore = z.infer<typeof maturityScoreSchema>;

/** The composite maturity assessment across all thirteen categories. */
export const maturityAssessmentSchema = z.object({
  scanId: z.string(),
  /** Weighted composite over AVAILABLE categories only. Null when none scored. */
  overall: z.number().int().min(0).max(100).nullable(),
  categories: z.array(maturityScoreSchema).default([]),
  /** Share of total category weight that was actually assessable (0–1). */
  coverage: z.number().min(0).max(1),
  confidence: evidenceConfidenceSchema,
  calculation: scoreCalculationSchema,
  limitations: z.array(z.string()).default([]),
  computedAt: z.string(),
});
export type MaturityAssessment = z.infer<typeof maturityAssessmentSchema>;

/* ---- 3 · business profile ---------------------------------------------------- */

/** A single derived profile fact. Null value ⇒ genuinely unknown. */
export const profileFieldSchema = z.object({
  value: z.string().max(500).nullable(),
  evidenceIds: z.array(z.string()).default([]),
  confidence: evidenceConfidenceSchema,
  /** How the value was reached — never "inferred" without evidence behind it. */
  basis: z.enum(["observed", "derived", "unknown"]),
});
export type ProfileField = z.infer<typeof profileFieldSchema>;

/** A 0–1 completeness/confidence indicator with its own derivation. */
export const profileIndicatorSchema = z.object({
  value: z.number().min(0).max(1).nullable(),
  evidenceIds: z.array(z.string()).default([]),
  calculation: scoreCalculationSchema,
});
export type ProfileIndicator = z.infer<typeof profileIndicatorSchema>;

export const prospectProfileSchema = z.object({
  scanId: z.string(),
  identity: profileFieldSchema,
  websiteUrl: profileFieldSchema,
  category: profileFieldSchema,
  primaryServices: z.array(z.string().max(200)).default([]),
  primaryServicesEvidenceIds: z.array(z.string()).default([]),
  digitalMaturity: profileFieldSchema,
  size: profileFieldSchema,
  geography: profileFieldSchema,
  contactConfidence: profileIndicatorSchema,
  websiteCompleteness: profileIndicatorSchema,
  contentFreshness: profileIndicatorSchema,
  trustIndicators: z.array(z.string().max(200)).default([]),
  operationalIndicators: z.array(z.string().max(200)).default([]),
  /** Field names that remain genuinely unknown — surfaced, never filled in. */
  unknownFields: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  generatedAt: z.string(),
});
export type ProspectProfile = z.infer<typeof prospectProfileSchema>;

/* ---- 4 · industry ------------------------------------------------------------ */

export const industryClassificationSchema = z.object({
  scanId: z.string(),
  /** Null when the evidence does not support a classification. */
  category: z.string().max(120).nullable(),
  /** Ranked alternates, each with its own support. */
  candidates: z.array(
    z.object({
      category: z.string().max(120),
      matchedTerms: z.array(z.string().max(80)).default([]),
      score: z.number().min(0).max(1),
      evidenceIds: z.array(z.string()).default([]),
    }),
  ).default([]),
  confidence: evidenceConfidenceSchema,
  evidenceIds: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});
export type IndustryClassification = z.infer<typeof industryClassificationSchema>;

/* ---- 5 · strengths & weaknesses ---------------------------------------------- */

export const prospectFindingKindSchema = z.enum(["strength", "weakness"]);
export type ProspectFindingKind = z.infer<typeof prospectFindingKindSchema>;

/**
 * An observed strength or weakness. `evidenceIds` is `.min(1)` — a finding
 * cannot be constructed without evidence, so speculation is unrepresentable.
 */
export const prospectFindingSchema = z.object({
  id: z.string(),
  kind: prospectFindingKindSchema,
  category: maturityCategorySchema,
  title: z.string().max(200),
  description: z.string().max(1000),
  evidenceIds: z.array(z.string()).min(1),
  confidence: evidenceConfidenceSchema,
  /** The observed 0–100 category score that produced this finding. */
  observedScore: z.number().int().min(0).max(100),
  limitations: z.array(z.string()).default([]),
});
export type ProspectFinding = z.infer<typeof prospectFindingSchema>;

/* ---- 6 · opportunities -------------------------------------------------------- */

export const impactBandSchema = z.enum(["low", "moderate", "high"]);
export type ImpactBand = z.infer<typeof impactBandSchema>;

export const complexityBandSchema = z.enum(["low", "moderate", "high"]);
export type ComplexityBand = z.infer<typeof complexityBandSchema>;

/**
 * A transformation opportunity. Carries NO price, NO timeline and NO promise —
 * the contract has no field capable of expressing one.
 */
export const prospectOpportunitySchema = z.object({
  id: z.string(),
  category: maturityCategorySchema,
  title: z.string().max(200),
  description: z.string().max(1000),
  businessImpact: z.number().int().min(0).max(100),
  businessImpactBand: impactBandSchema,
  implementationComplexity: z.number().int().min(0).max(100),
  implementationComplexityBand: complexityBandSchema,
  confidence: evidenceConfidenceSchema,
  evidenceIds: z.array(z.string()).min(1),
  /** The Auxion workstream this maps to — a routing label, not a commitment. */
  recommendedWorkstream: z.string().max(120),
  affectedDimensions: z.array(indexDimensionSchema).default([]),
  calculation: scoreCalculationSchema,
  limitations: z.array(z.string()).default([]),
});
export type ProspectOpportunity = z.infer<typeof prospectOpportunitySchema>;

/* ---- 7 · risks ---------------------------------------------------------------- */

export const prospectRiskCategorySchema = z.enum([
  "operational",
  "technical",
  "marketing",
  "trust",
  "compliance",
  "seo",
  "accessibility",
  "content",
  "automation",
]);
export type ProspectRiskCategory = z.infer<typeof prospectRiskCategorySchema>;

export const prospectRiskSeveritySchema = z.enum(["low", "moderate", "high", "critical"]);
export type ProspectRiskSeverity = z.infer<typeof prospectRiskSeveritySchema>;

export const prospectRiskSchema = z.object({
  id: z.string(),
  category: prospectRiskCategorySchema,
  title: z.string().max(200),
  description: z.string().max(1000),
  severity: prospectRiskSeveritySchema,
  severityScore: z.number().int().min(0).max(100),
  confidence: evidenceConfidenceSchema,
  evidenceIds: z.array(z.string()).min(1),
  limitations: z.array(z.string()).default([]),
});
export type ProspectRisk = z.infer<typeof prospectRiskSchema>;

/* ---- 8 · transformation readiness --------------------------------------------- */

export const readinessFactorSchema = z.enum([
  "digital_foundation",
  "market_visibility",
  "conversion_capability",
  "trust_and_credibility",
  "operational_signal",
  "measurement_capability",
]);
export type ReadinessFactor = z.infer<typeof readinessFactorSchema>;

/** Documented factor weights. Missing factors are excluded and redistributed. */
export const READINESS_FACTOR_WEIGHTS: Record<ReadinessFactor, number> = {
  digital_foundation: 25,
  conversion_capability: 20,
  market_visibility: 20,
  trust_and_credibility: 15,
  measurement_capability: 10,
  operational_signal: 10,
};

export const readinessFactorScoreSchema = z.object({
  factor: readinessFactorSchema,
  score: z.number().int().min(0).max(100).nullable(),
  /** Weight actually applied after redistribution (0 when excluded). */
  weight: z.number().min(0).max(100),
  /** The maturity categories that fed this factor. */
  contributingCategories: z.array(maturityCategorySchema).default([]),
  evidenceIds: z.array(z.string()).default([]),
  calculation: scoreCalculationSchema,
  available: z.boolean(),
  limitations: z.array(z.string()).default([]),
});
export type ReadinessFactorScore = z.infer<typeof readinessFactorScoreSchema>;

export const transformationReadinessSchema = z.object({
  scanId: z.string(),
  overall: z.number().int().min(0).max(100).nullable(),
  factors: z.array(readinessFactorScoreSchema).default([]),
  /** Share of total factor weight that was assessable (0–1). */
  coverage: z.number().min(0).max(1),
  confidence: evidenceConfidenceSchema,
  calculation: scoreCalculationSchema,
  /** Factors excluded for lack of evidence — never scored as zero. */
  excludedFactors: z.array(readinessFactorSchema).default([]),
  limitations: z.array(z.string()).default([]),
  computedAt: z.string(),
});
export type TransformationReadiness = z.infer<typeof transformationReadinessSchema>;

/* ---- 9 · executive summary ----------------------------------------------------- */

export const summarySectionKeySchema = z.enum([
  "business_overview",
  "current_position",
  "key_findings",
  "critical_risks",
  "major_opportunities",
  "transformation_readiness",
  "recommended_next_steps",
]);
export type SummarySectionKey = z.infer<typeof summarySectionKeySchema>;

/**
 * One assembled sentence. `template` names the validated template used and
 * `evidenceIds` traces it — there is no field for free-form model prose, so an
 * untraceable sentence cannot be represented.
 */
export const summaryStatementSchema = z.object({
  template: z.string().max(80),
  text: z.string().max(600),
  evidenceIds: z.array(z.string()).default([]),
  /** What the statement is derived from, for audit. */
  derivedFrom: z.enum(["profile", "maturity", "finding", "risk", "opportunity", "readiness", "coverage"]),
  refIds: z.array(z.string()).default([]),
});
export type SummaryStatement = z.infer<typeof summaryStatementSchema>;

export const summarySectionSchema = z.object({
  key: summarySectionKeySchema,
  title: z.string().max(120),
  statements: z.array(summaryStatementSchema).default([]),
  /** Set when a section has nothing evidenced to say. */
  unavailableReason: z.string().max(300).nullable().default(null),
});
export type SummarySection = z.infer<typeof summarySectionSchema>;

export const executiveSummarySchema = z.object({
  scanId: z.string(),
  sections: z.array(summarySectionSchema).default([]),
  confidence: evidenceConfidenceSchema,
  limitations: z.array(z.string()).default([]),
  /** Human review is always required — the engine never self-approves. */
  reviewRequired: z.literal(true),
  generatedAt: z.string(),
});
export type ExecutiveSummary = z.infer<typeof executiveSummarySchema>;

/* ---- 10 · recommendation inputs -------------------------------------------------- */

/**
 * A recommendation INPUT handed to the existing Recommendation Engine (Sprint 9).
 * C5 does not rank, price, or schedule — it only supplies evidence-backed
 * candidates for the engine that already owns that job.
 */
export const prospectRecommendationInputSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  problemStatement: z.string().max(2000),
  proposedAction: z.string().max(2000),
  category: maturityCategorySchema,
  affectedDimensions: z.array(indexDimensionSchema).default([]),
  evidenceIds: z.array(z.string()).min(1),
  opportunityIds: z.array(z.string()).default([]),
  riskIds: z.array(z.string()).default([]),
  impact: z.number().int().min(0).max(100),
  effort: z.number().int().min(0).max(100),
  confidence: evidenceConfidenceSchema,
  limitations: z.array(z.string()).default([]),
});
export type ProspectRecommendationInput = z.infer<typeof prospectRecommendationInputSchema>;

/* ---- 11 · artifacts ------------------------------------------------------------- */

export const prospectArtifactKindSchema = z.enum([
  "prospect_intelligence",
  "executive_summary",
  "transformation_readiness",
]);
export type ProspectArtifactKind = z.infer<typeof prospectArtifactKindSchema>;

/**
 * A checksummed, lineage-carrying artifact record. Deliberately SEPARATE from
 * the runtime's `PipelineArtifact` registry so C5 adds no artifact kind to the
 * persistence contract and touches no runtime, queue, or repository interface.
 */
export const prospectArtifactSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  kind: prospectArtifactKindSchema,
  version: z.number().int().positive().default(1),
  checksum: z.string(),
  generatedAt: z.string(),
  sourceArtifactIds: z.array(z.string()).default([]),
  /** Always `unvalidated` here — validation is a human review gate, not a claim. */
  validationStatus: z.enum(["valid", "invalid", "unvalidated"]).default("unvalidated"),
  reviewRequired: z.literal(true),
});
export type ProspectArtifact = z.infer<typeof prospectArtifactSchema>;

/* ---- 12 · events ----------------------------------------------------------------- */

export const prospectEventTypeSchema = z.enum([
  "prospect.profile_derived",
  "prospect.maturity_scored",
  "prospect.findings_derived",
  "prospect.opportunities_derived",
  "prospect.risks_derived",
  "prospect.readiness_computed",
  "prospect.summary_assembled",
  "prospect.artifact_created",
  "prospect.review_required",
  "prospect.evidence_insufficient",
]);
export type ProspectEventType = z.infer<typeof prospectEventTypeSchema>;

export const prospectEventSchema = z.object({
  type: prospectEventTypeSchema,
  scanId: z.string(),
  at: z.string(),
  artifactId: z.string().nullable().default(null),
  detail: z.string().max(500).nullable().default(null),
});
export type ProspectEvent = z.infer<typeof prospectEventSchema>;

/* ---- 13 · the engine result -------------------------------------------------------- */

export const prospectIntelligenceResultSchema = z.object({
  scanId: z.string(),
  profile: prospectProfileSchema,
  industry: industryClassificationSchema,
  maturity: maturityAssessmentSchema,
  strengths: z.array(prospectFindingSchema).default([]),
  weaknesses: z.array(prospectFindingSchema).default([]),
  opportunities: z.array(prospectOpportunitySchema).default([]),
  risks: z.array(prospectRiskSchema).default([]),
  readiness: transformationReadinessSchema,
  executiveSummary: executiveSummarySchema,
  recommendationInputs: z.array(prospectRecommendationInputSchema).default([]),
  artifacts: z.array(prospectArtifactSchema).default([]),
  events: z.array(prospectEventSchema).default([]),
  /** Aggregate confidence for the whole assessment. */
  confidence: evidenceConfidenceSchema,
  limitations: z.array(z.string()).default([]),
  generatedAt: z.string(),
});
export type ProspectIntelligenceResult = z.infer<typeof prospectIntelligenceResultSchema>;
