/* =============================================================================
 * AI Project Manager — row ↔ domain mappers (Phase E · Sprint E4). Jsonb arrays
 * (deliverables, acceptance criteria, dependency ids, gates, skills, etc.) collapse
 * defensively. The type-safe boundary.
 * ========================================================================== */

import type {
  DependencyPlan, ExecutionPlan, ExecutionRisk, InitiativePlan, KpiPlan, MilestonePlan, PlanningFeedback,
  PlanningSession, ResourceEstimate, ReviewPlan, TaskPlan, TimelinePlan,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const nint = (v: unknown): number | null => (v === null || v === undefined ? null : int(v));

export function sessionRow(s: PlanningSession): Record<string, unknown> {
  return { id: s.id, workspace_id: s.workspaceId, client_id: s.clientId, strategy_session_id: s.strategySessionId, title: s.title, status: s.status, requested_by_user_id: s.requestedByUserId, provider: s.provider, model: s.model, prompt_id: s.promptId, planning_duration_ms: s.planningDurationMs, ai_duration_ms: s.aiDurationMs, retrieval_duration_ms: s.retrievalDurationMs, validation_duration_ms: s.validationDurationMs, token_total: s.tokenTotal, cost: s.cost, currency: s.currency, confidence: s.confidence, plan_size: s.planSize, version: s.version, created_at: s.createdAt, updated_at: s.updatedAt };
}
export function toSession(r: Record<string, unknown>): PlanningSession {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), strategySessionId: String(r["strategy_session_id"]), title: String(r["title"]), status: r["status"] as PlanningSession["status"], requestedByUserId: String(r["requested_by_user_id"]), provider: nstr(r["provider"]), model: nstr(r["model"]), promptId: nstr(r["prompt_id"]), planningDurationMs: int(r["planning_duration_ms"]), aiDurationMs: int(r["ai_duration_ms"]), retrievalDurationMs: int(r["retrieval_duration_ms"]), validationDurationMs: int(r["validation_duration_ms"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), currency: String(r["currency"] ?? "USD"), confidence: int(r["confidence"]), planSize: int(r["plan_size"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function planRow(p: ExecutionPlan): Record<string, unknown> {
  return { id: p.id, planning_session_id: p.planningSessionId, workspace_id: p.workspaceId, client_id: p.clientId, summary: p.summary, initiative_count: p.initiativeCount, task_count: p.taskCount, milestone_count: p.milestoneCount, kpi_count: p.kpiCount, risk_count: p.riskCount, critical_path_duration_days: p.criticalPathDurationDays, status: p.status, confidence: p.confidence, created_at: p.createdAt };
}
export function toPlan(r: Record<string, unknown>): ExecutionPlan {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), summary: String(r["summary"] ?? ""), initiativeCount: int(r["initiative_count"]), taskCount: int(r["task_count"]), milestoneCount: int(r["milestone_count"]), kpiCount: int(r["kpi_count"]), riskCount: int(r["risk_count"]), criticalPathDurationDays: int(r["critical_path_duration_days"]), status: r["status"] as ExecutionPlan["status"], confidence: int(r["confidence"]), createdAt: String(r["created_at"]) };
}

export function initiativeRow(i: InitiativePlan): Record<string, unknown> {
  return { id: i.id, planning_session_id: i.planningSessionId, workspace_id: i.workspaceId, client_id: i.clientId, title: i.title, business_objective: i.businessObjective, expected_outcome: i.expectedOutcome, priority: i.priority, owner: i.owner, timeline_start: i.timelineStart, timeline_end: i.timelineEnd, linked_recommendation_ids: i.linkedRecommendationIds, roadmap_phase: i.roadmapPhase, linked_initiative_id: i.linkedInitiativeId, order_index: i.order, created_at: i.createdAt };
}
export function toInitiative(r: Record<string, unknown>): InitiativePlan {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), businessObjective: String(r["business_objective"] ?? ""), expectedOutcome: String(r["expected_outcome"] ?? ""), priority: r["priority"] as InitiativePlan["priority"], owner: nstr(r["owner"]), timelineStart: nstr(r["timeline_start"]), timelineEnd: nstr(r["timeline_end"]), linkedRecommendationIds: strArr(r["linked_recommendation_ids"]), roadmapPhase: nint(r["roadmap_phase"]), linkedInitiativeId: nstr(r["linked_initiative_id"]), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function milestoneRow(m: MilestonePlan): Record<string, unknown> {
  return { id: m.id, initiative_plan_id: m.initiativePlanId, planning_session_id: m.planningSessionId, workspace_id: m.workspaceId, client_id: m.clientId, title: m.title, entry_criteria: m.entryCriteria, exit_criteria: m.exitCriteria, deliverables: m.deliverables, planned_date: m.plannedDate, order_index: m.order, created_at: m.createdAt };
}
export function toMilestone(r: Record<string, unknown>): MilestonePlan {
  return { id: String(r["id"]), initiativePlanId: String(r["initiative_plan_id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), entryCriteria: String(r["entry_criteria"] ?? ""), exitCriteria: String(r["exit_criteria"] ?? ""), deliverables: strArr(r["deliverables"]), plannedDate: nstr(r["planned_date"]), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function taskRow(t: TaskPlan): Record<string, unknown> {
  return { id: t.id, initiative_plan_id: t.initiativePlanId, planning_session_id: t.planningSessionId, workspace_id: t.workspaceId, client_id: t.clientId, title: t.title, description: t.description, acceptance_criteria: t.acceptanceCriteria, owner: t.owner, priority: t.priority, effort: t.effort, dependency_task_ids: t.dependencyTaskIds, estimated_duration_days: t.estimatedDurationDays, required_knowledge: t.requiredKnowledge, related_recommendation_id: t.relatedRecommendationId, order_index: t.order, created_at: t.createdAt };
}
export function toTask(r: Record<string, unknown>): TaskPlan {
  return { id: String(r["id"]), initiativePlanId: String(r["initiative_plan_id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), description: String(r["description"] ?? ""), acceptanceCriteria: strArr(r["acceptance_criteria"]), owner: nstr(r["owner"]), priority: r["priority"] as TaskPlan["priority"], effort: r["effort"] as TaskPlan["effort"], dependencyTaskIds: strArr(r["dependency_task_ids"]), estimatedDurationDays: int(r["estimated_duration_days"], 1), requiredKnowledge: strArr(r["required_knowledge"]), relatedRecommendationId: nstr(r["related_recommendation_id"]), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function dependencyRow(d: DependencyPlan): Record<string, unknown> {
  return { id: d.id, planning_session_id: d.planningSessionId, workspace_id: d.workspaceId, client_id: d.clientId, from_task_id: d.fromTaskId, to_task_id: d.toTaskId, kind: d.kind, created_at: d.createdAt };
}
export function toDependency(r: Record<string, unknown>): DependencyPlan {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), fromTaskId: String(r["from_task_id"]), toTaskId: String(r["to_task_id"]), kind: r["kind"] as DependencyPlan["kind"], createdAt: String(r["created_at"]) };
}

export function timelineRow(t: TimelinePlan): Record<string, unknown> {
  return { id: t.id, initiative_plan_id: t.initiativePlanId, planning_session_id: t.planningSessionId, workspace_id: t.workspaceId, client_id: t.clientId, start_day: t.startDay, finish_day: t.finishDay, duration_days: t.durationDays, slack_days: t.slackDays, on_critical_path: t.onCriticalPath, created_at: t.createdAt };
}
export function toTimeline(r: Record<string, unknown>): TimelinePlan {
  return { id: String(r["id"]), initiativePlanId: String(r["initiative_plan_id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), startDay: int(r["start_day"]), finishDay: int(r["finish_day"]), durationDays: int(r["duration_days"]), slackDays: int(r["slack_days"]), onCriticalPath: r["on_critical_path"] === true, createdAt: String(r["created_at"]) };
}

export function reviewRow(x: ReviewPlan): Record<string, unknown> {
  return { id: x.id, planning_session_id: x.planningSessionId, workspace_id: x.workspaceId, client_id: x.clientId, cadence: x.cadence, approval_gates: x.approvalGates, quality_gates: x.qualityGates, success_metrics: x.successMetrics, created_at: x.createdAt };
}
export function toReview(r: Record<string, unknown>): ReviewPlan {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), cadence: r["cadence"] as ReviewPlan["cadence"], approvalGates: strArr(r["approval_gates"]), qualityGates: strArr(r["quality_gates"]), successMetrics: strArr(r["success_metrics"]), createdAt: String(r["created_at"]) };
}

export function kpiRow(k: KpiPlan): Record<string, unknown> {
  return { id: k.id, planning_session_id: k.planningSessionId, workspace_id: k.workspaceId, client_id: k.clientId, name: k.name, formula: k.formula, target: k.target, baseline: k.baseline, unit: k.unit, measurement_frequency: k.measurementFrequency, created_at: k.createdAt };
}
export function toKpi(r: Record<string, unknown>): KpiPlan {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), formula: String(r["formula"] ?? ""), target: num(r["target"]), baseline: num(r["baseline"]), unit: String(r["unit"] ?? ""), measurementFrequency: r["measurement_frequency"] as KpiPlan["measurementFrequency"], createdAt: String(r["created_at"]) };
}

export function resourceRow(x: ResourceEstimate): Record<string, unknown> {
  return { id: x.id, initiative_plan_id: x.initiativePlanId, planning_session_id: x.planningSessionId, workspace_id: x.workspaceId, client_id: x.clientId, people: x.people, skills: x.skills, cost_category: x.costCategory, complexity: x.complexity, duration_days: x.durationDays, confidence: x.confidence, created_at: x.createdAt };
}
export function toResource(r: Record<string, unknown>): ResourceEstimate {
  return { id: String(r["id"]), initiativePlanId: String(r["initiative_plan_id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), people: int(r["people"], 1), skills: strArr(r["skills"]), costCategory: r["cost_category"] as ResourceEstimate["costCategory"], complexity: r["complexity"] as ResourceEstimate["complexity"], durationDays: int(r["duration_days"], 1), confidence: int(r["confidence"]), createdAt: String(r["created_at"]) };
}

export function riskRow(x: ExecutionRisk): Record<string, unknown> {
  return { id: x.id, planning_session_id: x.planningSessionId, workspace_id: x.workspaceId, client_id: x.clientId, category: x.category, title: x.title, description: x.description, severity: x.severity, likelihood: x.likelihood, mitigation: x.mitigation, contingency: x.contingency, created_at: x.createdAt };
}
export function toRisk(r: Record<string, unknown>): ExecutionRisk {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), category: r["category"] as ExecutionRisk["category"], title: String(r["title"]), description: String(r["description"] ?? ""), severity: r["severity"] as ExecutionRisk["severity"], likelihood: r["likelihood"] as ExecutionRisk["likelihood"], mitigation: String(r["mitigation"] ?? ""), contingency: String(r["contingency"] ?? ""), createdAt: String(r["created_at"]) };
}

export function feedbackRow(f: PlanningFeedback): Record<string, unknown> {
  return { id: f.id, planning_session_id: f.planningSessionId, workspace_id: f.workspaceId, client_id: f.clientId, kind: f.kind, rating: f.rating, comment: f.comment, subject_user_id: f.subjectUserId, created_at: f.createdAt };
}
export function toFeedback(r: Record<string, unknown>): PlanningFeedback {
  return { id: String(r["id"]), planningSessionId: String(r["planning_session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as PlanningFeedback["kind"], rating: nint(r["rating"]), comment: nstr(r["comment"]), subjectUserId: String(r["subject_user_id"]), createdAt: String(r["created_at"]) };
}
