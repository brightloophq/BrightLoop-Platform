/* =============================================================================
 * AI Project Manager (Phase E · Sprint E4) — schema contracts.
 *
 * Transforms an APPROVED business strategy (E3) into an executable plan that maps
 * directly onto the Phase D execution model. Consumes E1/E2/E3 and Phase D ONLY
 * through their application services; never writes execution tables directly and
 * never invents entities outside the execution model. Additive; a new
 * `project-manager` bounded context.
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

export const planningSessionStatusSchema = z.enum(["draft", "planning", "planned", "approved", "failed", "archived"]);
export type PlanningSessionStatus = z.infer<typeof planningSessionStatusSchema>;

export const executionPlanStatusSchema = z.enum(["draft", "validated", "approved"]);
export type ExecutionPlanStatus = z.infer<typeof executionPlanStatusSchema>;

export const planPrioritySchema = z.enum(["low", "medium", "high"]);
export type PlanPriority = z.infer<typeof planPrioritySchema>;
export const planEffortSchema = z.enum(["low", "medium", "high"]);
export type PlanEffort = z.infer<typeof planEffortSchema>;

export const planDependencyKindSchema = z.enum(["blocking", "finish_to_start", "parallel", "soft"]);
export type PlanDependencyKind = z.infer<typeof planDependencyKindSchema>;

export const reviewCadenceSchema = z.enum(["weekly", "biweekly", "monthly", "per_milestone"]);
export type ReviewCadence = z.infer<typeof reviewCadenceSchema>;

export const measurementFrequencySchema = z.enum(["daily", "weekly", "monthly", "quarterly"]);
export type MeasurementFrequency = z.infer<typeof measurementFrequencySchema>;

export const resourceLevelSchema = z.enum(["low", "medium", "high"]);
export type ResourceLevel = z.infer<typeof resourceLevelSchema>;

export const executionRiskCategorySchema = z.enum(["delivery", "technical", "organizational", "resource"]);
export type ExecutionRiskCategory = z.infer<typeof executionRiskCategorySchema>;

export const executionRiskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type ExecutionRiskSeverity = z.infer<typeof executionRiskSeveritySchema>;

export const planLikelihoodSchema = z.enum(["low", "medium", "high"]);
export type PlanLikelihood = z.infer<typeof planLikelihoodSchema>;

export const planningFeedbackKindSchema = z.enum(["approval", "comment", "rejection"]);
export type PlanningFeedbackKind = z.infer<typeof planningFeedbackKindSchema>;

/* ---- planning session ------------------------------------------------------ */

export const planningSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  strategySessionId: z.string(),
  title: z.string().min(1).max(300),
  status: planningSessionStatusSchema.default("draft"),
  requestedByUserId: z.string(),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  promptId: z.string().nullable().default(null),
  planningDurationMs: z.number().int().min(0).default(0),
  aiDurationMs: z.number().int().min(0).default(0),
  retrievalDurationMs: z.number().int().min(0).default(0),
  validationDurationMs: z.number().int().min(0).default(0),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  confidence: z.number().int().min(0).max(100).default(0),
  planSize: z.number().int().min(0).default(0),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlanningSession = z.infer<typeof planningSessionSchema>;

/* ---- execution plan (append-only) ------------------------------------------ */

export const executionPlanSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  summary: z.string().default(""),
  initiativeCount: z.number().int().min(0).default(0),
  taskCount: z.number().int().min(0).default(0),
  milestoneCount: z.number().int().min(0).default(0),
  kpiCount: z.number().int().min(0).default(0),
  riskCount: z.number().int().min(0).default(0),
  criticalPathDurationDays: z.number().int().min(0).default(0),
  status: executionPlanStatusSchema.default("draft"),
  confidence: z.number().int().min(0).max(100).default(0),
  createdAt: z.string(),
});
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

/* ---- initiative / milestone / task plans (append-only) --------------------- */

export const initiativePlanSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  businessObjective: z.string().default(""),
  expectedOutcome: z.string().default(""),
  priority: planPrioritySchema.default("medium"),
  owner: z.string().nullable().default(null),
  timelineStart: z.string().nullable().default(null),
  timelineEnd: z.string().nullable().default(null),
  linkedRecommendationIds: z.array(z.string()).default([]),
  roadmapPhase: z.number().int().positive().nullable().default(null),
  /** The Phase D initiative this plan materializes into (via app services). */
  linkedInitiativeId: z.string().nullable().default(null),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type InitiativePlan = z.infer<typeof initiativePlanSchema>;

export const milestonePlanSchema = z.object({
  id: z.string(),
  initiativePlanId: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  entryCriteria: z.string().default(""),
  exitCriteria: z.string().default(""),
  deliverables: z.array(z.string()).default([]),
  plannedDate: z.string().nullable().default(null),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type MilestonePlan = z.infer<typeof milestonePlanSchema>;

export const taskPlanSchema = z.object({
  id: z.string(),
  initiativePlanId: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  description: z.string().default(""),
  acceptanceCriteria: z.array(z.string()).default([]),
  owner: z.string().nullable().default(null),
  priority: planPrioritySchema.default("medium"),
  effort: planEffortSchema.default("medium"),
  /** Ids of other TaskPlans this task depends on. */
  dependencyTaskIds: z.array(z.string()).default([]),
  estimatedDurationDays: z.number().int().min(0).default(1),
  requiredKnowledge: z.array(z.string()).default([]),
  relatedRecommendationId: z.string().nullable().default(null),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type TaskPlan = z.infer<typeof taskPlanSchema>;

/* ---- dependency / timeline / review / kpi (append-only) -------------------- */

export const dependencyPlanSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  fromTaskId: z.string(),
  toTaskId: z.string(),
  kind: planDependencyKindSchema,
  createdAt: z.string(),
});
export type DependencyPlan = z.infer<typeof dependencyPlanSchema>;

export const timelinePlanSchema = z.object({
  id: z.string(),
  initiativePlanId: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  startDay: z.number().int().min(0),
  finishDay: z.number().int().min(0),
  durationDays: z.number().int().min(0),
  slackDays: z.number().int().min(0).default(0),
  onCriticalPath: z.boolean().default(false),
  createdAt: z.string(),
});
export type TimelinePlan = z.infer<typeof timelinePlanSchema>;

export const reviewPlanSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  cadence: reviewCadenceSchema.default("per_milestone"),
  approvalGates: z.array(z.string()).default([]),
  qualityGates: z.array(z.string()).default([]),
  successMetrics: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type ReviewPlan = z.infer<typeof reviewPlanSchema>;

export const kpiPlanSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(200),
  formula: z.string(),
  target: z.number(),
  baseline: z.number().default(0),
  unit: z.string().default(""),
  measurementFrequency: measurementFrequencySchema.default("monthly"),
  createdAt: z.string(),
});
export type KpiPlan = z.infer<typeof kpiPlanSchema>;

/* ---- resource estimate / risk / feedback (append-only) --------------------- */

export const resourceEstimateSchema = z.object({
  id: z.string(),
  initiativePlanId: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  people: z.number().int().min(0).default(1),
  skills: z.array(z.string()).default([]),
  costCategory: resourceLevelSchema.default("medium"),
  complexity: resourceLevelSchema.default("medium"),
  durationDays: z.number().int().min(0).default(1),
  confidence: z.number().int().min(0).max(100).default(0),
  createdAt: z.string(),
});
export type ResourceEstimate = z.infer<typeof resourceEstimateSchema>;

export const executionRiskSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  category: executionRiskCategorySchema,
  title: z.string().min(1).max(300),
  description: z.string().default(""),
  severity: executionRiskSeveritySchema,
  likelihood: planLikelihoodSchema,
  mitigation: z.string().default(""),
  contingency: z.string().default(""),
  createdAt: z.string(),
});
export type ExecutionRisk = z.infer<typeof executionRiskSchema>;

export const planningFeedbackSchema = z.object({
  id: z.string(),
  planningSessionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: planningFeedbackKindSchema,
  rating: z.number().int().min(1).max(5).nullable().default(null),
  comment: z.string().nullable().default(null),
  subjectUserId: z.string(),
  createdAt: z.string(),
});
export type PlanningFeedback = z.infer<typeof planningFeedbackSchema>;
