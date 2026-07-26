/* =============================================================================
 * Planning session lifecycle + plan builders (Phase E · Sprint E4) — PURE.
 *
 *   draft → planning → planned → approved ; planning → failed ; * → archived
 * Every plan record (execution plan, initiatives, milestones, tasks, deps,
 * timelines, reviews, KPIs, resources, risks, feedback) is built here and is
 * immutable once produced. All pure; the application persists them + materializes
 * approved plans into Phase D via Phase D application services.
 * ========================================================================== */

import type {
  DependencyPlan, ExecutionPlan, ExecutionRisk, ExecutionRiskCategory, ExecutionRiskSeverity, InitiativePlan,
  KpiPlan, MeasurementFrequency, MilestonePlan, PlanDependencyKind, PlanEffort, PlanLikelihood, PlanPriority,
  PlanningFeedback, PlanningFeedbackKind, PlanningSession, PlanningSessionStatus, ResourceEstimate, ResourceLevel,
  ReviewCadence, ReviewPlan, TaskPlan, TimelinePlan,
} from "@brightloop/schema";

export const PLANNING_TRANSITIONS: Record<PlanningSessionStatus, readonly PlanningSessionStatus[]> = {
  draft: ["planning", "archived"],
  planning: ["planned", "failed"],
  planned: ["approved", "archived", "planning"],
  approved: ["archived"],
  failed: ["planning", "archived"],
  archived: [],
};
export function canTransitionPlanning(from: PlanningSessionStatus, to: PlanningSessionStatus): boolean {
  return PLANNING_TRANSITIONS[from].includes(to);
}

export interface BuildPlanningSessionInput {
  id: string; workspaceId: string; clientId: string | null; strategySessionId: string; title: string; requestedByUserId: string; now: string;
}
export function buildPlanningSession(input: BuildPlanningSessionInput): PlanningSession {
  return {
    id: input.id, workspaceId: input.workspaceId, clientId: input.clientId, strategySessionId: input.strategySessionId,
    title: input.title.slice(0, 300), status: "draft", requestedByUserId: input.requestedByUserId, provider: null, model: null, promptId: null,
    planningDurationMs: 0, aiDurationMs: 0, retrievalDurationMs: 0, validationDurationMs: 0, tokenTotal: 0, cost: 0, currency: "USD",
    confidence: 0, planSize: 0, version: 1, createdAt: input.now, updatedAt: input.now,
  };
}

export interface BuildInitiativePlanInput {
  id: string; planningSessionId: string; workspaceId: string; clientId: string | null; title: string;
  businessObjective?: string; expectedOutcome?: string; priority?: PlanPriority; owner?: string | null;
  linkedRecommendationIds?: readonly string[]; roadmapPhase?: number | null; linkedInitiativeId?: string | null; order: number; now: string;
}
export function buildInitiativePlan(i: BuildInitiativePlanInput): InitiativePlan {
  return {
    id: i.id, planningSessionId: i.planningSessionId, workspaceId: i.workspaceId, clientId: i.clientId, title: i.title.slice(0, 300),
    businessObjective: i.businessObjective ?? "", expectedOutcome: i.expectedOutcome ?? "", priority: i.priority ?? "medium",
    owner: i.owner ?? null, timelineStart: null, timelineEnd: null, linkedRecommendationIds: [...(i.linkedRecommendationIds ?? [])],
    roadmapPhase: i.roadmapPhase ?? null, linkedInitiativeId: i.linkedInitiativeId ?? null, order: i.order, createdAt: i.now,
  };
}

export interface BuildMilestonePlanInput {
  id: string; initiativePlanId: string; planningSessionId: string; workspaceId: string; clientId: string | null;
  title: string; entryCriteria?: string; exitCriteria?: string; deliverables?: readonly string[]; plannedDate?: string | null; order: number; now: string;
}
export function buildMilestonePlan(m: BuildMilestonePlanInput): MilestonePlan {
  return { id: m.id, initiativePlanId: m.initiativePlanId, planningSessionId: m.planningSessionId, workspaceId: m.workspaceId, clientId: m.clientId, title: m.title.slice(0, 300), entryCriteria: m.entryCriteria ?? "", exitCriteria: m.exitCriteria ?? "", deliverables: [...(m.deliverables ?? [])], plannedDate: m.plannedDate ?? null, order: m.order, createdAt: m.now };
}

export interface BuildTaskPlanInput {
  id: string; initiativePlanId: string; planningSessionId: string; workspaceId: string; clientId: string | null;
  title: string; description?: string; acceptanceCriteria?: readonly string[]; owner?: string | null; priority?: PlanPriority;
  effort?: PlanEffort; dependencyTaskIds?: readonly string[]; estimatedDurationDays?: number; requiredKnowledge?: readonly string[];
  relatedRecommendationId?: string | null; order: number; now: string;
}
export function buildTaskPlan(t: BuildTaskPlanInput): TaskPlan {
  return {
    id: t.id, initiativePlanId: t.initiativePlanId, planningSessionId: t.planningSessionId, workspaceId: t.workspaceId, clientId: t.clientId,
    title: t.title.slice(0, 300), description: t.description ?? "", acceptanceCriteria: [...(t.acceptanceCriteria ?? [])], owner: t.owner ?? null,
    priority: t.priority ?? "medium", effort: t.effort ?? "medium", dependencyTaskIds: [...(t.dependencyTaskIds ?? [])],
    estimatedDurationDays: t.estimatedDurationDays ?? 1, requiredKnowledge: [...(t.requiredKnowledge ?? [])], relatedRecommendationId: t.relatedRecommendationId ?? null, order: t.order, createdAt: t.now,
  };
}

export function buildDependencyPlan(id: string, planningSessionId: string, workspaceId: string, clientId: string | null, fromTaskId: string, toTaskId: string, kind: PlanDependencyKind, now: string): DependencyPlan {
  return { id, planningSessionId, workspaceId, clientId, fromTaskId, toTaskId, kind, createdAt: now };
}

export function buildTimelinePlan(id: string, initiativePlanId: string, planningSessionId: string, workspaceId: string, clientId: string | null, startDay: number, finishDay: number, durationDays: number, slackDays: number, onCriticalPath: boolean, now: string): TimelinePlan {
  return { id, initiativePlanId, planningSessionId, workspaceId, clientId, startDay, finishDay, durationDays, slackDays, onCriticalPath, createdAt: now };
}

export interface BuildReviewPlanInput { id: string; planningSessionId: string; workspaceId: string; clientId: string | null; cadence?: ReviewCadence; approvalGates?: readonly string[]; qualityGates?: readonly string[]; successMetrics?: readonly string[]; now: string; }
export function buildReviewPlan(r: BuildReviewPlanInput): ReviewPlan {
  return { id: r.id, planningSessionId: r.planningSessionId, workspaceId: r.workspaceId, clientId: r.clientId, cadence: r.cadence ?? "per_milestone", approvalGates: [...(r.approvalGates ?? [])], qualityGates: [...(r.qualityGates ?? [])], successMetrics: [...(r.successMetrics ?? [])], createdAt: r.now };
}

export interface BuildKpiPlanInput { id: string; planningSessionId: string; workspaceId: string; clientId: string | null; name: string; formula: string; target: number; baseline?: number; unit?: string; measurementFrequency?: MeasurementFrequency; now: string; }
export function buildKpiPlan(k: BuildKpiPlanInput): KpiPlan {
  return { id: k.id, planningSessionId: k.planningSessionId, workspaceId: k.workspaceId, clientId: k.clientId, name: k.name.slice(0, 200), formula: k.formula, target: k.target, baseline: k.baseline ?? 0, unit: k.unit ?? "", measurementFrequency: k.measurementFrequency ?? "monthly", createdAt: k.now };
}

export interface BuildResourceEstimateInput { id: string; initiativePlanId: string; planningSessionId: string; workspaceId: string; clientId: string | null; people?: number; skills?: readonly string[]; costCategory?: ResourceLevel; complexity?: ResourceLevel; durationDays?: number; confidence?: number; now: string; }
export function buildResourceEstimate(r: BuildResourceEstimateInput): ResourceEstimate {
  return { id: r.id, initiativePlanId: r.initiativePlanId, planningSessionId: r.planningSessionId, workspaceId: r.workspaceId, clientId: r.clientId, people: r.people ?? 1, skills: [...(r.skills ?? [])], costCategory: r.costCategory ?? "medium", complexity: r.complexity ?? "medium", durationDays: r.durationDays ?? 1, confidence: r.confidence ?? 0, createdAt: r.now };
}

export interface BuildExecutionRiskInput { id: string; planningSessionId: string; workspaceId: string; clientId: string | null; category: ExecutionRiskCategory; title: string; description?: string; severity: ExecutionRiskSeverity; likelihood: PlanLikelihood; mitigation?: string; contingency?: string; now: string; }
export function buildExecutionRisk(r: BuildExecutionRiskInput): ExecutionRisk {
  return { id: r.id, planningSessionId: r.planningSessionId, workspaceId: r.workspaceId, clientId: r.clientId, category: r.category, title: r.title.slice(0, 300), description: r.description ?? "", severity: r.severity, likelihood: r.likelihood, mitigation: r.mitigation ?? "", contingency: r.contingency ?? "", createdAt: r.now };
}

export function buildPlanningFeedback(id: string, planningSessionId: string, workspaceId: string, clientId: string | null, kind: PlanningFeedbackKind, rating: number | null, comment: string | null, subjectUserId: string, now: string): PlanningFeedback {
  return { id, planningSessionId, workspaceId, clientId, kind, rating, comment, subjectUserId, createdAt: now };
}

export interface BuildExecutionPlanInput {
  id: string; planningSessionId: string; workspaceId: string; clientId: string | null; summary: string;
  initiativeCount: number; taskCount: number; milestoneCount: number; kpiCount: number; riskCount: number;
  criticalPathDurationDays: number; confidence: number; now: string;
}
export function buildExecutionPlan(p: BuildExecutionPlanInput): ExecutionPlan {
  return { id: p.id, planningSessionId: p.planningSessionId, workspaceId: p.workspaceId, clientId: p.clientId, summary: p.summary, initiativeCount: p.initiativeCount, taskCount: p.taskCount, milestoneCount: p.milestoneCount, kpiCount: p.kpiCount, riskCount: p.riskCount, criticalPathDurationDays: p.criticalPathDurationDays, status: "draft", confidence: p.confidence, createdAt: p.now };
}
