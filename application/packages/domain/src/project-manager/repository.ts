/* =============================================================================
 * AI Project Manager — REPOSITORY PORTS (Phase E · Sprint E4).
 *
 * Persistence contracts; Supabase adapters live in `@brightloop/data`. The
 * planning session is versioned (optimistic concurrency); the execution plan +
 * all plan records + feedback are append-only. The PM consumes E1/E2/E3 and
 * Phase D ONLY via their application services, so no AI/knowledge/execution ports
 * appear here. RLS is the tenant boundary.
 * ========================================================================== */

import type {
  DependencyPlan, ExecutionPlan, ExecutionRisk, InitiativePlan, KpiPlan, MilestonePlan, PlanningFeedback,
  PlanningSession, ResourceEstimate, ReviewPlan, TaskPlan, TimelinePlan,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface PlanningSessionRepository {
  create(session: PlanningSession): Promise<RuntimeResult<PlanningSession>>;
  getById(id: string): Promise<RuntimeResult<PlanningSession | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<PlanningSession[]>>;
  save(next: PlanningSession, expectedVersion: number): Promise<RuntimeResult<PlanningSession>>;
}

export interface ExecutionPlanRepository {
  append(plan: ExecutionPlan): Promise<RuntimeResult<ExecutionPlan>>;
  getBySession(planningSessionId: string): Promise<RuntimeResult<ExecutionPlan | null>>;
  save(next: ExecutionPlan): Promise<RuntimeResult<ExecutionPlan>>;
}

export interface InitiativePlanRepository {
  appendMany(rows: readonly InitiativePlan[]): Promise<RuntimeResult<InitiativePlan[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<InitiativePlan[]>>;
}

export interface MilestonePlanRepository {
  appendMany(rows: readonly MilestonePlan[]): Promise<RuntimeResult<MilestonePlan[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<MilestonePlan[]>>;
}

export interface TaskPlanRepository {
  appendMany(rows: readonly TaskPlan[]): Promise<RuntimeResult<TaskPlan[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<TaskPlan[]>>;
}

export interface DependencyPlanRepository {
  appendMany(rows: readonly DependencyPlan[]): Promise<RuntimeResult<DependencyPlan[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<DependencyPlan[]>>;
}

export interface TimelinePlanRepository {
  appendMany(rows: readonly TimelinePlan[]): Promise<RuntimeResult<TimelinePlan[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<TimelinePlan[]>>;
}

export interface ReviewPlanRepository {
  append(row: ReviewPlan): Promise<RuntimeResult<ReviewPlan>>;
  getBySession(planningSessionId: string): Promise<RuntimeResult<ReviewPlan | null>>;
}

export interface KpiPlanRepository {
  appendMany(rows: readonly KpiPlan[]): Promise<RuntimeResult<KpiPlan[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<KpiPlan[]>>;
}

export interface ResourceEstimateRepository {
  appendMany(rows: readonly ResourceEstimate[]): Promise<RuntimeResult<ResourceEstimate[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<ResourceEstimate[]>>;
}

export interface ExecutionRiskRepository {
  appendMany(rows: readonly ExecutionRisk[]): Promise<RuntimeResult<ExecutionRisk[]>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<ExecutionRisk[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<ExecutionRisk[]>>;
}

export interface PlanningFeedbackRepository {
  append(row: PlanningFeedback): Promise<RuntimeResult<PlanningFeedback>>;
  listBySession(planningSessionId: string): Promise<RuntimeResult<PlanningFeedback[]>>;
}

/** The ports the Project Manager application use-cases are wired with. */
export interface ProjectManagerRepositories {
  sessions: PlanningSessionRepository;
  plans: ExecutionPlanRepository;
  initiatives: InitiativePlanRepository;
  milestones: MilestonePlanRepository;
  tasks: TaskPlanRepository;
  dependencies: DependencyPlanRepository;
  timelines: TimelinePlanRepository;
  reviews: ReviewPlanRepository;
  kpis: KpiPlanRepository;
  resources: ResourceEstimateRepository;
  risks: ExecutionRiskRepository;
  feedback: PlanningFeedbackRepository;
}
