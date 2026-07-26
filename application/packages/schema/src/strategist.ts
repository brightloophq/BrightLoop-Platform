/* =============================================================================
 * AI Strategist (Phase E · Sprint E3) — schema contracts.
 *
 * A business-transformation consultant: analyzes an organization, reasons over
 * its knowledge (via E2), executes prompts (via E1), and produces STRUCTURED
 * transformation recommendations — never free-form. Consumes E1/E2 only through
 * their public application services. Additive; a new `strategist` bounded context.
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

export const strategySessionStatusSchema = z.enum(["draft", "analyzing", "completed", "failed", "archived"]);
export type StrategySessionStatus = z.infer<typeof strategySessionStatusSchema>;

export const businessDimensionSchema = z.enum([
  "company_profile", "industry", "services", "operations", "sales", "marketing", "branding",
  "customer_journey", "automation_maturity", "technology", "team_structure", "documentation_quality",
  "risk", "growth", "competitive_advantage", "bottlenecks",
]);
export type BusinessDimension = z.infer<typeof businessDimensionSchema>;

export const findingCategorySchema = z.enum(["strength", "weakness", "opportunity", "risk", "bottleneck", "advantage"]);
export type FindingCategory = z.infer<typeof findingCategorySchema>;

export const impactLevelSchema = z.enum(["low", "medium", "high"]);
export type ImpactLevel = z.infer<typeof impactLevelSchema>;
export const effortLevelSchema = z.enum(["low", "medium", "high"]);
export type EffortLevel = z.infer<typeof effortLevelSchema>;

export const strategyRiskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type StrategyRiskSeverity = z.infer<typeof strategyRiskSeveritySchema>;
export const likelihoodSchema = z.enum(["low", "medium", "high"]);
export type Likelihood = z.infer<typeof likelihoodSchema>;

export const strategyFeedbackKindSchema = z.enum(["approval", "comment", "rejection"]);
export type StrategyFeedbackKind = z.infer<typeof strategyFeedbackKindSchema>;

/* ---- session --------------------------------------------------------------- */

export const strategySessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  status: strategySessionStatusSchema.default("draft"),
  /** The captured request (a value object, not its own table). */
  goal: z.string().default(""),
  collectionIds: z.array(z.string()).default([]),
  dimensions: z.array(businessDimensionSchema).default([]),
  requestedByUserId: z.string(),
  promptId: z.string().nullable().default(null),
  promptVersion: z.number().int().positive().nullable().default(null),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  analysisDurationMs: z.number().int().min(0).default(0),
  retrievalCount: z.number().int().min(0).default(0),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  /** Overall confidence in the strategy (0–100). */
  confidence: z.number().int().min(0).max(100).default(0),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StrategySession = z.infer<typeof strategySessionSchema>;

/* ---- analysis (append-only) ------------------------------------------------ */

export const strategyAnalysisSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  executiveSummary: z.string().default(""),
  currentState: z.string().default(""),
  expectedImpact: z.string().default(""),
  confidence: z.number().int().min(0).max(100).default(0),
  confidenceReason: z.string().default(""),
  missingInformation: z.array(z.string()).default([]),
  /** Structured clarification questions (asked when confidence is low). */
  clarifications: z.array(z.object({ question: z.string(), dimension: businessDimensionSchema.nullable().default(null) })).default([]),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  promptVersion: z.number().int().positive().nullable().default(null),
  tokensUsed: z.number().int().min(0).default(0),
  retrievalLatencyMs: z.number().int().min(0).default(0),
  aiDurationMs: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type StrategyAnalysis = z.infer<typeof strategyAnalysisSchema>;

/* ---- findings / opportunities (append-only) -------------------------------- */

/** A business finding. Opportunities are findings with `category = 'opportunity'`. */
export const businessFindingSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  dimension: businessDimensionSchema,
  category: findingCategorySchema,
  title: z.string().min(1).max(300),
  detail: z.string().default(""),
  businessImpact: impactLevelSchema.default("medium"),
  confidence: z.number().int().min(0).max(100).default(0),
  evidenceCount: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type BusinessFinding = z.infer<typeof businessFindingSchema>;

/* ---- risk (append-only) ---------------------------------------------------- */

export const riskAssessmentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  description: z.string().default(""),
  severity: strategyRiskSeveritySchema,
  likelihood: likelihoodSchema,
  mitigation: z.string().default(""),
  confidence: z.number().int().min(0).max(100).default(0),
  createdAt: z.string(),
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

/* ---- recommendation (append-only) ------------------------------------------ */

export const strategyRecommendationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  description: z.string().default(""),
  reasoning: z.string().default(""),
  /** Derived priority 0–100 (see StrategyPriorityScore for the factor breakdown). */
  priority: z.number().int().min(0).max(100).default(0),
  effort: effortLevelSchema.default("medium"),
  expectedImpact: impactLevelSchema.default("medium"),
  dependencies: z.array(z.string()).default([]),
  confidence: z.number().int().min(0).max(100).default(0),
  recommendedOwner: z.string().nullable().default(null),
  estimatedTimeline: z.string().nullable().default(null),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type StrategyRecommendation = z.infer<typeof strategyRecommendationSchema>;

/* ---- priority score (append-only) ------------------------------------------ */

export const strategyPriorityScoreSchema = z.object({
  id: z.string(),
  recommendationId: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  businessImpact: z.number().int().min(0).max(100),
  implementationEffort: z.number().int().min(0).max(100),
  urgency: z.number().int().min(0).max(100),
  riskReduction: z.number().int().min(0).max(100),
  customerValue: z.number().int().min(0).max(100),
  strategicAlignment: z.number().int().min(0).max(100),
  automationPotential: z.number().int().min(0).max(100),
  total: z.number().int().min(0).max(100),
  createdAt: z.string(),
});
export type StrategyPriorityScore = z.infer<typeof strategyPriorityScoreSchema>;

/* ---- roadmap (append-only) ------------------------------------------------- */

export const roadmapPhaseSchema = z.object({
  phase: z.number().int().positive(),
  name: z.string(),
  goals: z.array(z.string()).default([]),
  initiatives: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  expectedOutcomes: z.array(z.string()).default([]),
});
export type RoadmapPhase = z.infer<typeof roadmapPhaseSchema>;

export const transformationRoadmapSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  phases: z.array(roadmapPhaseSchema).default([]),
  createdAt: z.string(),
});
export type TransformationRoadmap = z.infer<typeof transformationRoadmapSchema>;

/* ---- citation (append-only) ------------------------------------------------ */

export const strategyCitationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** The finding or recommendation this citation supports (one is set). */
  findingId: z.string().nullable().default(null),
  recommendationId: z.string().nullable().default(null),
  documentId: z.string(),
  collectionId: z.string(),
  chunkId: z.string(),
  page: z.number().int().min(0).nullable().default(null),
  heading: z.string().nullable().default(null),
  similarity: z.number(),
  createdAt: z.string(),
});
export type StrategyCitation = z.infer<typeof strategyCitationSchema>;

/* ---- feedback (append-only) ------------------------------------------------ */

export const strategyFeedbackSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: strategyFeedbackKindSchema,
  rating: z.number().int().min(1).max(5).nullable().default(null),
  comment: z.string().nullable().default(null),
  subjectUserId: z.string(),
  createdAt: z.string(),
});
export type StrategyFeedback = z.infer<typeof strategyFeedbackSchema>;
