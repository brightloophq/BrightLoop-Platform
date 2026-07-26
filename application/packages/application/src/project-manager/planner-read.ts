/* =============================================================================
 * AI Project Manager read models (Phase E · Sprint E4).
 *
 * Read-only projections: execution dashboard, the full structured plan, planning
 * sessions, initiative/milestone/task plans, timeline view, dependency graph,
 * risk register, and KPI dashboard. Load-then-authorize; DTOs only.
 * ========================================================================== */

import { authorize, requireProjectManager, PLANNING_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toDependencyPlanDTO, toExecutionPlanDTO, toExecutionRiskDTO, toInitiativePlanDTO, toKpiPlanDTO, toMilestonePlanDTO,
  toPlanningFeedbackDTO, toPlanningSessionDTO, toResourceEstimateDTO, toReviewPlanDTO, toTaskPlanDTO, toTimelinePlanDTO,
  type DependencyPlanDTO, type ExecutionDashboardDTO, type ExecutionPlanResultDTO, type ExecutionRiskDTO,
  type InitiativePlanDTO, type KpiPlanDTO, type MilestonePlanDTO, type PlanningFeedbackDTO, type PlanningSessionDTO,
  type TaskPlanDTO, type TimelinePlanDTO,
} from "./dto.js";

async function loadSession(ctx: AppContext, sessionId: string) {
  const pm = requireProjectManager(ctx);
  const session = unwrap(await pm.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("planning session");
  authorize(ctx.actor, PLANNING_READ_CAP, session.clientId);
  return { pm, session };
}

export async function listPlanningSessions(ctx: AppContext, rawWorkspaceId: unknown): Promise<PlanningSessionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const pm = requireProjectManager(ctx);
  authorize(ctx.actor, PLANNING_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await pm.sessions.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toPlanningSessionDTO);
}

export async function getExecutionDashboard(ctx: AppContext, rawSessionId: unknown): Promise<ExecutionDashboardDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId);
  const [plan, initiatives, tasks, milestones, kpis, risks] = await Promise.all([
    pm.plans.getBySession(sessionId).then(unwrap), pm.initiatives.listBySession(sessionId).then(unwrap),
    pm.tasks.listBySession(sessionId).then(unwrap), pm.milestones.listBySession(sessionId).then(unwrap),
    pm.kpis.listBySession(sessionId).then(unwrap), pm.risks.listBySession(sessionId).then(unwrap),
  ]);
  return { session: toPlanningSessionDTO(session), plan: plan ? toExecutionPlanDTO(plan) : null, initiativeCount: initiatives.length, taskCount: tasks.length, milestoneCount: milestones.length, kpiCount: kpis.length, riskCount: risks.length };
}

/** The complete STRUCTURED execution plan for a session. */
export async function getExecutionPlanResult(ctx: AppContext, rawSessionId: unknown): Promise<ExecutionPlanResultDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm, session } = await loadSession(ctx, sessionId);
  const [plan, initiatives, milestones, tasks, dependencies, timelines, review, kpis, resources, risks] = await Promise.all([
    pm.plans.getBySession(sessionId).then(unwrap), pm.initiatives.listBySession(sessionId).then(unwrap),
    pm.milestones.listBySession(sessionId).then(unwrap), pm.tasks.listBySession(sessionId).then(unwrap),
    pm.dependencies.listBySession(sessionId).then(unwrap), pm.timelines.listBySession(sessionId).then(unwrap),
    pm.reviews.getBySession(sessionId).then(unwrap), pm.kpis.listBySession(sessionId).then(unwrap),
    pm.resources.listBySession(sessionId).then(unwrap), pm.risks.listBySession(sessionId).then(unwrap),
  ]);
  return {
    session: toPlanningSessionDTO(session), plan: plan ? toExecutionPlanDTO(plan) : null,
    initiatives: [...initiatives].sort((a, b) => a.order - b.order).map(toInitiativePlanDTO),
    milestones: milestones.map(toMilestonePlanDTO),
    tasks: [...tasks].sort((a, b) => a.order - b.order).map(toTaskPlanDTO),
    dependencies: dependencies.map(toDependencyPlanDTO),
    timelines: timelines.map(toTimelinePlanDTO),
    review: review ? toReviewPlanDTO(review) : null,
    kpis: kpis.map(toKpiPlanDTO),
    resources: resources.map(toResourceEstimateDTO),
    risks: risks.map(toExecutionRiskDTO),
  };
}

export async function listInitiativePlans(ctx: AppContext, rawSessionId: unknown): Promise<InitiativePlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return [...unwrap(await pm.initiatives.listBySession(sessionId))].sort((a, b) => a.order - b.order).map(toInitiativePlanDTO);
}

export async function listMilestonePlans(ctx: AppContext, rawSessionId: unknown): Promise<MilestonePlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return unwrap(await pm.milestones.listBySession(sessionId)).map(toMilestonePlanDTO);
}

export async function listTaskPlans(ctx: AppContext, rawSessionId: unknown): Promise<TaskPlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return [...unwrap(await pm.tasks.listBySession(sessionId))].sort((a, b) => a.order - b.order).map(toTaskPlanDTO);
}

/** Timeline view: the per-initiative CPM timelines (critical path flagged). */
export async function getTimelineView(ctx: AppContext, rawSessionId: unknown): Promise<TimelinePlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return [...unwrap(await pm.timelines.listBySession(sessionId))].sort((a, b) => a.startDay - b.startDay).map(toTimelinePlanDTO);
}

/** Dependency graph: the task dependency edges. */
export async function getDependencyGraph(ctx: AppContext, rawSessionId: unknown): Promise<DependencyPlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return unwrap(await pm.dependencies.listBySession(sessionId)).map(toDependencyPlanDTO);
}

/** Risk register for a workspace (all plans), most severe first. */
export async function getExecutionRiskRegister(ctx: AppContext, rawWorkspaceId: unknown): Promise<ExecutionRiskDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const pm = requireProjectManager(ctx);
  authorize(ctx.actor, PLANNING_READ_CAP, ctx.actor.clientId);
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...unwrap(await pm.risks.listByWorkspace(workspaceId))].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4)).map(toExecutionRiskDTO);
}

/** KPI dashboard: the planned KPIs for a session. */
export async function getKpiDashboard(ctx: AppContext, rawSessionId: unknown): Promise<KpiPlanDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return unwrap(await pm.kpis.listBySession(sessionId)).map(toKpiPlanDTO);
}

export async function listPlanningFeedback(ctx: AppContext, rawSessionId: unknown): Promise<PlanningFeedbackDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { pm } = await loadSession(ctx, sessionId);
  return [...unwrap(await pm.feedback.listBySession(sessionId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toPlanningFeedbackDTO);
}
