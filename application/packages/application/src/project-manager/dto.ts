/* =============================================================================
 * AI Project Manager DTOs (Phase E · Sprint E4) — the outward boundary.
 * ========================================================================== */

import type {
  DependencyPlan, ExecutionPlan, ExecutionRisk, InitiativePlan, KpiPlan, MilestonePlan, PlanningFeedback,
  PlanningSession, ResourceEstimate, ReviewPlan, TaskPlan, TimelinePlan,
} from "@brightloop/schema";

export interface PlanningSessionDTO {
  id: string; strategySessionId: string; title: string; status: PlanningSession["status"];
  confidence: number; planSize: number; provider: string | null; model: string | null;
  planningDurationMs: number; aiDurationMs: number; retrievalDurationMs: number; validationDurationMs: number;
  tokenTotal: number; cost: number; currency: string; version: number; createdAt: string; updatedAt: string;
}
export const toPlanningSessionDTO = (s: PlanningSession): PlanningSessionDTO => ({ id: s.id, strategySessionId: s.strategySessionId, title: s.title, status: s.status, confidence: s.confidence, planSize: s.planSize, provider: s.provider, model: s.model, planningDurationMs: s.planningDurationMs, aiDurationMs: s.aiDurationMs, retrievalDurationMs: s.retrievalDurationMs, validationDurationMs: s.validationDurationMs, tokenTotal: s.tokenTotal, cost: s.cost, currency: s.currency, version: s.version, createdAt: s.createdAt, updatedAt: s.updatedAt });

export interface ExecutionPlanDTO {
  id: string; planningSessionId: string; summary: string; initiativeCount: number; taskCount: number;
  milestoneCount: number; kpiCount: number; riskCount: number; criticalPathDurationDays: number; status: ExecutionPlan["status"]; confidence: number;
}
export const toExecutionPlanDTO = (p: ExecutionPlan): ExecutionPlanDTO => ({ id: p.id, planningSessionId: p.planningSessionId, summary: p.summary, initiativeCount: p.initiativeCount, taskCount: p.taskCount, milestoneCount: p.milestoneCount, kpiCount: p.kpiCount, riskCount: p.riskCount, criticalPathDurationDays: p.criticalPathDurationDays, status: p.status, confidence: p.confidence });

export interface InitiativePlanDTO { id: string; title: string; businessObjective: string; expectedOutcome: string; priority: InitiativePlan["priority"]; owner: string | null; roadmapPhase: number | null; linkedRecommendationIds: string[]; linkedInitiativeId: string | null; order: number; }
export const toInitiativePlanDTO = (i: InitiativePlan): InitiativePlanDTO => ({ id: i.id, title: i.title, businessObjective: i.businessObjective, expectedOutcome: i.expectedOutcome, priority: i.priority, owner: i.owner, roadmapPhase: i.roadmapPhase, linkedRecommendationIds: i.linkedRecommendationIds, linkedInitiativeId: i.linkedInitiativeId, order: i.order });

export interface MilestonePlanDTO { id: string; initiativePlanId: string; title: string; entryCriteria: string; exitCriteria: string; deliverables: string[]; plannedDate: string | null; order: number; }
export const toMilestonePlanDTO = (m: MilestonePlan): MilestonePlanDTO => ({ id: m.id, initiativePlanId: m.initiativePlanId, title: m.title, entryCriteria: m.entryCriteria, exitCriteria: m.exitCriteria, deliverables: m.deliverables, plannedDate: m.plannedDate, order: m.order });

export interface TaskPlanDTO {
  id: string; initiativePlanId: string; title: string; description: string; acceptanceCriteria: string[];
  owner: string | null; priority: TaskPlan["priority"]; effort: TaskPlan["effort"]; dependencyTaskIds: string[];
  estimatedDurationDays: number; requiredKnowledge: string[]; relatedRecommendationId: string | null; order: number;
}
export const toTaskPlanDTO = (t: TaskPlan): TaskPlanDTO => ({ id: t.id, initiativePlanId: t.initiativePlanId, title: t.title, description: t.description, acceptanceCriteria: t.acceptanceCriteria, owner: t.owner, priority: t.priority, effort: t.effort, dependencyTaskIds: t.dependencyTaskIds, estimatedDurationDays: t.estimatedDurationDays, requiredKnowledge: t.requiredKnowledge, relatedRecommendationId: t.relatedRecommendationId, order: t.order });

export interface DependencyPlanDTO { id: string; fromTaskId: string; toTaskId: string; kind: DependencyPlan["kind"]; }
export const toDependencyPlanDTO = (d: DependencyPlan): DependencyPlanDTO => ({ id: d.id, fromTaskId: d.fromTaskId, toTaskId: d.toTaskId, kind: d.kind });

export interface TimelinePlanDTO { id: string; initiativePlanId: string; startDay: number; finishDay: number; durationDays: number; slackDays: number; onCriticalPath: boolean; }
export const toTimelinePlanDTO = (t: TimelinePlan): TimelinePlanDTO => ({ id: t.id, initiativePlanId: t.initiativePlanId, startDay: t.startDay, finishDay: t.finishDay, durationDays: t.durationDays, slackDays: t.slackDays, onCriticalPath: t.onCriticalPath });

export interface ReviewPlanDTO { id: string; cadence: ReviewPlan["cadence"]; approvalGates: string[]; qualityGates: string[]; successMetrics: string[]; }
export const toReviewPlanDTO = (r: ReviewPlan): ReviewPlanDTO => ({ id: r.id, cadence: r.cadence, approvalGates: r.approvalGates, qualityGates: r.qualityGates, successMetrics: r.successMetrics });

export interface KpiPlanDTO { id: string; name: string; formula: string; target: number; baseline: number; unit: string; measurementFrequency: KpiPlan["measurementFrequency"]; }
export const toKpiPlanDTO = (k: KpiPlan): KpiPlanDTO => ({ id: k.id, name: k.name, formula: k.formula, target: k.target, baseline: k.baseline, unit: k.unit, measurementFrequency: k.measurementFrequency });

export interface ResourceEstimateDTO { id: string; initiativePlanId: string; people: number; skills: string[]; costCategory: ResourceEstimate["costCategory"]; complexity: ResourceEstimate["complexity"]; durationDays: number; confidence: number; }
export const toResourceEstimateDTO = (r: ResourceEstimate): ResourceEstimateDTO => ({ id: r.id, initiativePlanId: r.initiativePlanId, people: r.people, skills: r.skills, costCategory: r.costCategory, complexity: r.complexity, durationDays: r.durationDays, confidence: r.confidence });

export interface ExecutionRiskDTO { id: string; category: ExecutionRisk["category"]; title: string; description: string; severity: ExecutionRisk["severity"]; likelihood: ExecutionRisk["likelihood"]; mitigation: string; contingency: string; }
export const toExecutionRiskDTO = (r: ExecutionRisk): ExecutionRiskDTO => ({ id: r.id, category: r.category, title: r.title, description: r.description, severity: r.severity, likelihood: r.likelihood, mitigation: r.mitigation, contingency: r.contingency });

export interface PlanningFeedbackDTO { id: string; kind: PlanningFeedback["kind"]; rating: number | null; comment: string | null; subjectUserId: string; createdAt: string; }
export const toPlanningFeedbackDTO = (f: PlanningFeedback): PlanningFeedbackDTO => ({ id: f.id, kind: f.kind, rating: f.rating, comment: f.comment, subjectUserId: f.subjectUserId, createdAt: f.createdAt });

export interface PlanValidationDTO { ok: boolean; issues: string[]; }

/** The complete structured execution plan. */
export interface ExecutionPlanResultDTO {
  session: PlanningSessionDTO;
  plan: ExecutionPlanDTO | null;
  initiatives: InitiativePlanDTO[];
  milestones: MilestonePlanDTO[];
  tasks: TaskPlanDTO[];
  dependencies: DependencyPlanDTO[];
  timelines: TimelinePlanDTO[];
  review: ReviewPlanDTO | null;
  kpis: KpiPlanDTO[];
  resources: ResourceEstimateDTO[];
  risks: ExecutionRiskDTO[];
}

export interface ApprovalResultDTO { planningSessionId: string; materialized: { tasks: number; milestones: number; timelines: number; kpis: number; reviews: number; dependencies: number }; }

export interface ExecutionDashboardDTO { session: PlanningSessionDTO; plan: ExecutionPlanDTO | null; initiativeCount: number; taskCount: number; milestoneCount: number; kpiCount: number; riskCount: number; }
