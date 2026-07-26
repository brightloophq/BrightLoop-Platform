/* =============================================================================
 * Supabase AI Project Manager repositories (Phase E · Sprint E4).
 *
 * Twelve adapters (untyped-cast pattern; mappers are the boundary). The planning
 * session is versioned (optimistic concurrency); the execution plan + all plan
 * records + feedback are append-only (the plan carries a mutable status column).
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type DependencyPlanRepository, type ExecutionPlanRepository, type ExecutionRiskRepository, type InitiativePlanRepository,
  type KpiPlanRepository, type MilestonePlanRepository, type PlanningFeedbackRepository, type PlanningSessionRepository,
  type ResourceEstimateRepository, type ReviewPlanRepository, type RuntimeResult,
  type TaskPlanRepository, type TimelinePlanRepository,
} from "@brightloop/domain";
import type {
  DependencyPlan, ExecutionPlan, ExecutionRisk, InitiativePlan, KpiPlan, MilestonePlan, PlanningFeedback,
  PlanningSession, ResourceEstimate, ReviewPlan, TaskPlan, TimelinePlan,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const SESS = "planning_session";
const PLAN = "execution_plan";
const INIT = "initiative_plan";
const MILE = "milestone_plan";
const TASK = "task_plan";
const DEP = "dependency_plan";
const TL = "timeline_plan";
const RV = "review_plan";
const KPI = "kpi_plan";
const RES = "resource_estimate";
const RISK = "execution_risk";
const FB = "planning_feedback";

export class SupabasePlanningSessionRepository implements PlanningSessionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(s: PlanningSession): Promise<RuntimeResult<PlanningSession>> {
    const { data, error } = await this.db.from(SESS).insert(m.sessionRow(s)).select("*").single();
    if (error) return mapDatabaseError(error, "planningSession.create");
    return ok("created", m.toSession(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<PlanningSession | null>> {
    const { data, error } = await this.db.from(SESS).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "planningSession.getById");
    return ok("found", data ? m.toSession(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<PlanningSession[]>> {
    const { data, error } = await this.db.from(SESS).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "planningSession.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toSession(r as Record<string, unknown>)));
  }
  async save(next: PlanningSession, expectedVersion: number): Promise<RuntimeResult<PlanningSession>> {
    const { data, error } = await this.db.from(SESS).update({ status: next.status, provider: next.provider, model: next.model, planning_duration_ms: next.planningDurationMs, ai_duration_ms: next.aiDurationMs, retrieval_duration_ms: next.retrievalDurationMs, validation_duration_ms: next.validationDurationMs, token_total: next.tokenTotal, cost: next.cost, confidence: next.confidence, plan_size: next.planSize, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "planningSession.save");
    if (data === null) return err("conflict", "planningSession.save: version mismatch");
    return ok("updated", m.toSession(data as Record<string, unknown>));
  }
}

export class SupabaseExecutionPlanRepository implements ExecutionPlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(p: ExecutionPlan): Promise<RuntimeResult<ExecutionPlan>> {
    const { data, error } = await this.db.from(PLAN).insert(m.planRow(p)).select("*").single();
    if (error) return mapDatabaseError(error, "executionPlan.append");
    return ok("created", m.toPlan(data as Record<string, unknown>));
  }
  async getBySession(planningSessionId: string): Promise<RuntimeResult<ExecutionPlan | null>> {
    const { data, error } = await this.db.from(PLAN).select("*").eq("planning_session_id", planningSessionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "executionPlan.getBySession");
    return ok("found", data ? m.toPlan(data as Record<string, unknown>) : null);
  }
  async save(next: ExecutionPlan): Promise<RuntimeResult<ExecutionPlan>> {
    const { data, error } = await this.db.from(PLAN).update({ status: next.status }).eq("id", next.id).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "executionPlan.save");
    if (data === null) return err("conflict", "executionPlan.save: not found");
    return ok("updated", m.toPlan(data as Record<string, unknown>));
  }
}

function appendManyRepo<T>(db: SupabaseClient, table: string, toRow: (t: T) => Record<string, unknown>, toDomain: (r: Record<string, unknown>) => T, ctx: string) {
  return async (rows: readonly T[]): Promise<RuntimeResult<T[]>> => {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await db.from(table).insert(rows.map(toRow)).select("*");
    if (error) return mapDatabaseError(error, `${ctx}.appendMany`);
    return ok("created", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}
function listBySessionRepo<T>(db: SupabaseClient, table: string, toDomain: (r: Record<string, unknown>) => T, ctx: string, orderCol?: string) {
  return async (sessionId: string): Promise<RuntimeResult<T[]>> => {
    let q = db.from(table).select("*").eq("planning_session_id", sessionId);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) return mapDatabaseError(error, `${ctx}.listBySession`);
    return ok("found", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}

export class SupabaseInitiativePlanRepository implements InitiativePlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly InitiativePlan[]) { return appendManyRepo<InitiativePlan>(this.db, INIT, m.initiativeRow, m.toInitiative, "initiativePlan")(rows); }
  listBySession(id: string) { return listBySessionRepo<InitiativePlan>(this.db, INIT, m.toInitiative, "initiativePlan", "order_index")(id); }
}
export class SupabaseMilestonePlanRepository implements MilestonePlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly MilestonePlan[]) { return appendManyRepo<MilestonePlan>(this.db, MILE, m.milestoneRow, m.toMilestone, "milestonePlan")(rows); }
  listBySession(id: string) { return listBySessionRepo<MilestonePlan>(this.db, MILE, m.toMilestone, "milestonePlan", "order_index")(id); }
}
export class SupabaseTaskPlanRepository implements TaskPlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly TaskPlan[]) { return appendManyRepo<TaskPlan>(this.db, TASK, m.taskRow, m.toTask, "taskPlan")(rows); }
  listBySession(id: string) { return listBySessionRepo<TaskPlan>(this.db, TASK, m.toTask, "taskPlan", "order_index")(id); }
}
export class SupabaseDependencyPlanRepository implements DependencyPlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly DependencyPlan[]) { return appendManyRepo<DependencyPlan>(this.db, DEP, m.dependencyRow, m.toDependency, "dependencyPlan")(rows); }
  listBySession(id: string) { return listBySessionRepo<DependencyPlan>(this.db, DEP, m.toDependency, "dependencyPlan")(id); }
}
export class SupabaseTimelinePlanRepository implements TimelinePlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly TimelinePlan[]) { return appendManyRepo<TimelinePlan>(this.db, TL, m.timelineRow, m.toTimeline, "timelinePlan")(rows); }
  listBySession(id: string) { return listBySessionRepo<TimelinePlan>(this.db, TL, m.toTimeline, "timelinePlan")(id); }
}
export class SupabaseKpiPlanRepository implements KpiPlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly KpiPlan[]) { return appendManyRepo<KpiPlan>(this.db, KPI, m.kpiRow, m.toKpi, "kpiPlan")(rows); }
  listBySession(id: string) { return listBySessionRepo<KpiPlan>(this.db, KPI, m.toKpi, "kpiPlan")(id); }
}
export class SupabaseResourceEstimateRepository implements ResourceEstimateRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly ResourceEstimate[]) { return appendManyRepo<ResourceEstimate>(this.db, RES, m.resourceRow, m.toResource, "resourceEstimate")(rows); }
  listBySession(id: string) { return listBySessionRepo<ResourceEstimate>(this.db, RES, m.toResource, "resourceEstimate")(id); }
}

export class SupabaseReviewPlanRepository implements ReviewPlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(r: ReviewPlan): Promise<RuntimeResult<ReviewPlan>> {
    const { data, error } = await this.db.from(RV).insert(m.reviewRow(r)).select("*").single();
    if (error) return mapDatabaseError(error, "reviewPlan.append");
    return ok("created", m.toReview(data as Record<string, unknown>));
  }
  async getBySession(planningSessionId: string): Promise<RuntimeResult<ReviewPlan | null>> {
    const { data, error } = await this.db.from(RV).select("*").eq("planning_session_id", planningSessionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "reviewPlan.getBySession");
    return ok("found", data ? m.toReview(data as Record<string, unknown>) : null);
  }
}

export class SupabaseExecutionRiskRepository implements ExecutionRiskRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly ExecutionRisk[]) { return appendManyRepo<ExecutionRisk>(this.db, RISK, m.riskRow, m.toRisk, "executionRisk")(rows); }
  listBySession(id: string) { return listBySessionRepo<ExecutionRisk>(this.db, RISK, m.toRisk, "executionRisk")(id); }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<ExecutionRisk[]>> {
    const { data, error } = await this.db.from(RISK).select("*").eq("workspace_id", workspaceId);
    if (error) return mapDatabaseError(error, "executionRisk.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toRisk(r as Record<string, unknown>)));
  }
}

export class SupabasePlanningFeedbackRepository implements PlanningFeedbackRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(f: PlanningFeedback): Promise<RuntimeResult<PlanningFeedback>> {
    const { data, error } = await this.db.from(FB).insert(m.feedbackRow(f)).select("*").single();
    if (error) return mapDatabaseError(error, "planningFeedback.append");
    return ok("created", m.toFeedback(data as Record<string, unknown>));
  }
  async listBySession(planningSessionId: string): Promise<RuntimeResult<PlanningFeedback[]>> {
    const { data, error } = await this.db.from(FB).select("*").eq("planning_session_id", planningSessionId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "planningFeedback.listBySession");
    return ok("found", (data ?? []).map((r) => m.toFeedback(r as Record<string, unknown>)));
  }
}
