/* =============================================================================
 * Supabase Transformation Execution repositories (Phase D · Sprint D1).
 *
 * Production adapters for the three Phase D ports. Constructed per request with
 * the caller's RLS-scoped session — the adapter adds NO tenant filters; RLS
 * (layer 3) + the application capability check (layer 2) are the gates. Never
 * cache across requests.
 *
 * ██ TYPING NOTE ██
 *   Addressed through an untyped `SupabaseClient` view via a single documented
 *   cast at construction — the new tables model status as `string` in the domain
 *   schema, and the mappers are the type-safe boundary (exercised by the live
 *   pgTAP + integration suites). Mirrors `SupabaseTransformationRepository`.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Initiative, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";
import {
  err,
  mapDatabaseError,
  ok,
  type InitiativeRepository,
  type RuntimeResult,
  type TransformationActivityRepository,
  type TransformationWorkspaceRepository,
} from "@brightloop/domain";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const WS = "transformation_workspace";
const INIT = "transformation_initiative";
const ACT = "transformation_activity";

export class SupabaseTransformationWorkspaceRepository implements TransformationWorkspaceRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  async create(workspace: TransformationWorkspace): Promise<RuntimeResult<TransformationWorkspace>> {
    const { data, error } = await this.db.from(WS).insert(m.workspaceRow(workspace)).select("*").single();
    if (error) return mapDatabaseError(error, "transformationWorkspace.create");
    return ok("created", m.toWorkspace(data as Record<string, unknown>));
  }

  async getById(id: string): Promise<RuntimeResult<TransformationWorkspace | null>> {
    const { data, error } = await this.db.from(WS).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "transformationWorkspace.getById");
    return ok("found", data ? m.toWorkspace(data as Record<string, unknown>) : null);
  }

  async getBySeed(scanRunId: string, seedChecksum: string): Promise<RuntimeResult<TransformationWorkspace | null>> {
    const { data, error } = await this.db.from(WS).select("*").eq("scan_run_id", scanRunId).eq("seed_checksum", seedChecksum).maybeSingle();
    if (error) return mapDatabaseError(error, "transformationWorkspace.getBySeed");
    return ok("found", data ? m.toWorkspace(data as Record<string, unknown>) : null);
  }

  async listByClient(): Promise<RuntimeResult<TransformationWorkspace[]>> {
    // RLS scopes the visible set; no explicit client filter (internal sees all).
    const { data, error } = await this.db.from(WS).select("*").order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "transformationWorkspace.listByClient");
    return ok("found", (data ?? []).map((r) => m.toWorkspace(r as Record<string, unknown>)));
  }
}

export class SupabaseInitiativeRepository implements InitiativeRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  async createMany(initiatives: readonly Initiative[]): Promise<RuntimeResult<Initiative[]>> {
    if (initiatives.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(INIT).insert(initiatives.map(m.initiativeRow)).select("*");
    if (error) return mapDatabaseError(error, "initiative.createMany");
    return ok("created", (data ?? []).map((r) => m.toInitiative(r as Record<string, unknown>)));
  }

  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Initiative[]>> {
    const { data, error } = await this.db.from(INIT).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "initiative.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toInitiative(r as Record<string, unknown>)));
  }

  async getById(id: string): Promise<RuntimeResult<Initiative | null>> {
    const { data, error } = await this.db.from(INIT).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "initiative.getById");
    return ok("found", data ? m.toInitiative(data as Record<string, unknown>) : null);
  }

  async save(next: Initiative, expectedVersion: number): Promise<RuntimeResult<Initiative>> {
    // Optimistic concurrency: the UPDATE only matches the expected version; a
    // concurrent transition leaves zero rows → `conflict`.
    const { data, error } = await this.db
      .from(INIT)
      .update({ execution_status: next.executionStatus, version: next.version })
      .eq("id", next.id)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();
    if (error) return mapDatabaseError(error, "initiative.save");
    if (data === null) return err("conflict", "initiative.save: version mismatch (concurrent transition)");
    return ok("updated", m.toInitiative(data as Record<string, unknown>));
  }
}

export class SupabaseTransformationActivityRepository implements TransformationActivityRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  async append(record: TransformationActivity): Promise<RuntimeResult<TransformationActivity>> {
    const { data, error } = await this.db.from(ACT).insert(m.activityRow(record)).select("*").single();
    if (error) {
      // Idempotent append: a duplicate command_id means this activity already exists.
      if (error.code === "23505") {
        const existing = await this.db.from(ACT).select("*").eq("command_id", record.commandId).maybeSingle();
        if (existing.error) return mapDatabaseError(existing.error, "activity.append.reread");
        if (existing.data) return ok("replayed", m.toActivity(existing.data as Record<string, unknown>));
      }
      return mapDatabaseError(error, "activity.append");
    }
    return ok("created", m.toActivity(data as Record<string, unknown>));
  }

  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<TransformationActivity[]>> {
    const { data, error } = await this.db.from(ACT).select("*").eq("workspace_id", workspaceId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "activity.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toActivity(r as Record<string, unknown>)));
  }
}

/* ---- D3/D4 execution-management adapters ----------------------------------- */
import type { Assignment, Dependency, Review, Task } from "@brightloop/schema";
import type { AssignmentRepository, DependencyRepository, ReviewRepository, TaskRepository } from "@brightloop/domain";

const REV = "transformation_review";
const TASK = "transformation_task";
const ASG = "transformation_assignment";
const DEP = "transformation_dependency";

export class SupabaseReviewRepository implements ReviewRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(review: Review): Promise<RuntimeResult<Review>> {
    const { data, error } = await this.db.from(REV).insert(m.reviewRow(review)).select("*").single();
    if (error) return mapDatabaseError(error, "review.create");
    return ok("created", m.toReview(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<Review | null>> {
    const { data, error } = await this.db.from(REV).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "review.getById");
    return ok("found", data ? m.toReview(data as Record<string, unknown>) : null);
  }
  async listByInitiative(initiativeId: string): Promise<RuntimeResult<Review[]>> {
    const { data, error } = await this.db.from(REV).select("*").eq("initiative_id", initiativeId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "review.listByInitiative");
    return ok("found", (data ?? []).map((r) => m.toReview(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Review[]>> {
    const { data, error } = await this.db.from(REV).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "review.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toReview(r as Record<string, unknown>)));
  }
  async save(next: Review, expectedVersion: number): Promise<RuntimeResult<Review>> {
    const { data, error } = await this.db.from(REV).update({ status: next.status, note: next.note, decision_actor_id: next.decisionActorId, version: next.version }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "review.save");
    if (data === null) return err("conflict", "review.save: version mismatch");
    return ok("updated", m.toReview(data as Record<string, unknown>));
  }
}

export class SupabaseTaskRepository implements TaskRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(task: Task): Promise<RuntimeResult<Task>> {
    const { data, error } = await this.db.from(TASK).insert(m.taskRow(task)).select("*").single();
    if (error) return mapDatabaseError(error, "task.create");
    return ok("created", m.toTask(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<Task | null>> {
    const { data, error } = await this.db.from(TASK).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "task.getById");
    return ok("found", data ? m.toTask(data as Record<string, unknown>) : null);
  }
  async listByInitiative(initiativeId: string): Promise<RuntimeResult<Task[]>> {
    const { data, error } = await this.db.from(TASK).select("*").eq("initiative_id", initiativeId).order("order_index", { ascending: true });
    if (error) return mapDatabaseError(error, "task.listByInitiative");
    return ok("found", (data ?? []).map((r) => m.toTask(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Task[]>> {
    const { data, error } = await this.db.from(TASK).select("*").eq("workspace_id", workspaceId).order("order_index", { ascending: true });
    if (error) return mapDatabaseError(error, "task.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toTask(r as Record<string, unknown>)));
  }
  async save(next: Task, expectedVersion: number): Promise<RuntimeResult<Task>> {
    const { data, error } = await this.db.from(TASK).update({ title: next.title, description: next.description, status: next.status, priority: next.priority, estimate: next.estimate, assignee_actor_id: next.assigneeActorId, order_index: next.order, dependency_ids: next.dependencyIds, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "task.save");
    if (data === null) return err("conflict", "task.save: version mismatch");
    return ok("updated", m.toTask(data as Record<string, unknown>));
  }
}

export class SupabaseAssignmentRepository implements AssignmentRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(record: Assignment): Promise<RuntimeResult<Assignment>> {
    const { data, error } = await this.db.from(ASG).insert(m.assignmentRow(record)).select("*").single();
    if (error) return mapDatabaseError(error, "assignment.append");
    return ok("created", m.toAssignment(data as Record<string, unknown>));
  }
  async listByTask(taskId: string): Promise<RuntimeResult<Assignment[]>> {
    const { data, error } = await this.db.from(ASG).select("*").eq("task_id", taskId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "assignment.listByTask");
    return ok("found", (data ?? []).map((r) => m.toAssignment(r as Record<string, unknown>)));
  }
}

export class SupabaseDependencyRepository implements DependencyRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(dependency: Dependency): Promise<RuntimeResult<Dependency>> {
    const { data, error } = await this.db.from(DEP).insert(m.dependencyRow(dependency)).select("*").single();
    if (error) return mapDatabaseError(error, "dependency.create");
    return ok("created", m.toDependency(data as Record<string, unknown>));
  }
  async remove(id: string): Promise<RuntimeResult<null>> {
    const { error } = await this.db.from(DEP).delete().eq("id", id);
    if (error) return mapDatabaseError(error, "dependency.remove");
    return ok("updated", null);
  }
  async getById(id: string): Promise<RuntimeResult<Dependency | null>> {
    const { data, error } = await this.db.from(DEP).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "dependency.getById");
    return ok("found", data ? m.toDependency(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Dependency[]>> {
    const { data, error } = await this.db.from(DEP).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "dependency.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toDependency(r as Record<string, unknown>)));
  }
}

/* ---- D5/D6 planning & performance adapters --------------------------------- */
import type { Kpi, ProgressSnapshot, Timeline, TxMilestone } from "@brightloop/schema";
import type { KpiRepository, MilestoneRepository, ProgressSnapshotRepository, TimelineRepository } from "@brightloop/domain";

const TL = "transformation_timeline";
const MS = "transformation_milestone";
const KPI = "transformation_kpi";
const SNAP = "transformation_progress_snapshot";

export class SupabaseTimelineRepository implements TimelineRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(timeline: Timeline): Promise<RuntimeResult<Timeline>> {
    const { data, error } = await this.db.from(TL).insert(m.timelineRow(timeline)).select("*").single();
    if (error) return mapDatabaseError(error, "timeline.create");
    return ok("created", m.toTimeline(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<Timeline | null>> {
    const { data, error } = await this.db.from(TL).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "timeline.getById");
    return ok("found", data ? m.toTimeline(data as Record<string, unknown>) : null);
  }
  async getByInitiative(initiativeId: string): Promise<RuntimeResult<Timeline | null>> {
    const { data, error } = await this.db.from(TL).select("*").eq("initiative_id", initiativeId).maybeSingle();
    if (error) return mapDatabaseError(error, "timeline.getByInitiative");
    return ok("found", data ? m.toTimeline(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Timeline[]>> {
    const { data, error } = await this.db.from(TL).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "timeline.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toTimeline(r as Record<string, unknown>)));
  }
  async save(next: Timeline, expectedVersion: number): Promise<RuntimeResult<Timeline>> {
    const { data, error } = await this.db.from(TL).update({ status: next.status, actual_end_date: next.actualEndDate, version: next.version }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "timeline.save");
    if (data === null) return err("conflict", "timeline.save: version mismatch");
    return ok("updated", m.toTimeline(data as Record<string, unknown>));
  }
}

export class SupabaseMilestoneRepository implements MilestoneRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(milestone: TxMilestone): Promise<RuntimeResult<TxMilestone>> {
    const { data, error } = await this.db.from(MS).insert(m.milestoneRow(milestone)).select("*").single();
    if (error) return mapDatabaseError(error, "milestone.create");
    return ok("created", m.toMilestone(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<TxMilestone | null>> {
    const { data, error } = await this.db.from(MS).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "milestone.getById");
    return ok("found", data ? m.toMilestone(data as Record<string, unknown>) : null);
  }
  async listByInitiative(initiativeId: string): Promise<RuntimeResult<TxMilestone[]>> {
    const { data, error } = await this.db.from(MS).select("*").eq("initiative_id", initiativeId).order("order_index", { ascending: true });
    if (error) return mapDatabaseError(error, "milestone.listByInitiative");
    return ok("found", (data ?? []).map((r) => m.toMilestone(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<TxMilestone[]>> {
    const { data, error } = await this.db.from(MS).select("*").eq("workspace_id", workspaceId).order("order_index", { ascending: true });
    if (error) return mapDatabaseError(error, "milestone.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toMilestone(r as Record<string, unknown>)));
  }
  async save(next: TxMilestone, expectedVersion: number): Promise<RuntimeResult<TxMilestone>> {
    const { data, error } = await this.db.from(MS).update({ status: next.status, completed_date: next.completedDate, title: next.title, description: next.description, planned_date: next.plannedDate, order_index: next.order, version: next.version }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "milestone.save");
    if (data === null) return err("conflict", "milestone.save: version mismatch");
    return ok("updated", m.toMilestone(data as Record<string, unknown>));
  }
}

export class SupabaseKpiRepository implements KpiRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(kpi: Kpi): Promise<RuntimeResult<Kpi>> {
    const { data, error } = await this.db.from(KPI).insert(m.kpiRow(kpi)).select("*").single();
    if (error) return mapDatabaseError(error, "kpi.create");
    return ok("created", m.toKpi(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<Kpi | null>> {
    const { data, error } = await this.db.from(KPI).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "kpi.getById");
    return ok("found", data ? m.toKpi(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Kpi[]>> {
    const { data, error } = await this.db.from(KPI).select("*").eq("workspace_id", workspaceId).order("name", { ascending: true });
    if (error) return mapDatabaseError(error, "kpi.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toKpi(r as Record<string, unknown>)));
  }
  async save(next: Kpi, expectedVersion: number): Promise<RuntimeResult<Kpi>> {
    const { data, error } = await this.db.from(KPI).update({ current: next.current, status: next.status, last_updated: next.lastUpdated, version: next.version }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "kpi.save");
    if (data === null) return err("conflict", "kpi.save: version mismatch");
    return ok("updated", m.toKpi(data as Record<string, unknown>));
  }
}

export class SupabaseProgressSnapshotRepository implements ProgressSnapshotRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(snapshot: ProgressSnapshot): Promise<RuntimeResult<ProgressSnapshot>> {
    const { data, error } = await this.db.from(SNAP).insert(m.progressSnapshotRow(snapshot)).select("*").single();
    if (error) return mapDatabaseError(error, "progressSnapshot.append");
    return ok("created", m.toProgressSnapshot(data as Record<string, unknown>));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<ProgressSnapshot[]>> {
    const { data, error } = await this.db.from(SNAP).select("*").eq("workspace_id", workspaceId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "progressSnapshot.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toProgressSnapshot(r as Record<string, unknown>)));
  }
  async listBySubject(subjectId: string): Promise<RuntimeResult<ProgressSnapshot[]>> {
    const { data, error } = await this.db.from(SNAP).select("*").eq("subject_id", subjectId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "progressSnapshot.listBySubject");
    return ok("found", (data ?? []).map((r) => m.toProgressSnapshot(r as Record<string, unknown>)));
  }
}
