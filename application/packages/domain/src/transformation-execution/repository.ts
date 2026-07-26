/* =============================================================================
 * Transformation Execution — REPOSITORY PORTS (Phase D · Sprint D1).
 *
 * The persistence contracts the application layer depends on. Ports only — the
 * Supabase adapters live in `@brightloop/data`. Every method returns a
 * `RuntimeResult` (never throws a raw DB error), mirroring the Phase B runtime
 * repositories. RLS remains the real tenant boundary; the adapters add no filters.
 *
 * D1 scope: create-once + read. Optimistic-concurrency `save`/transitions arrive
 * with the workflow engine in D2+.
 * ========================================================================== */

import type { Assignment, Dependency, Initiative, Review, Task, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface TransformationWorkspaceRepository {
  /** Persist a freshly seeded workspace. Idempotent on `(scanRunId, seedChecksum)`. */
  create(workspace: TransformationWorkspace): Promise<RuntimeResult<TransformationWorkspace>>;
  getById(id: string): Promise<RuntimeResult<TransformationWorkspace | null>>;
  /** The idempotency lookup: an existing workspace for this exact seed, or null. */
  getBySeed(scanRunId: string, seedChecksum: string): Promise<RuntimeResult<TransformationWorkspace | null>>;
  listByClient(clientId: string | null): Promise<RuntimeResult<TransformationWorkspace[]>>;
}

export interface InitiativeRepository {
  /** Persist the seeded initiatives for a workspace (idempotent per initiative id). */
  createMany(initiatives: readonly Initiative[]): Promise<RuntimeResult<Initiative[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Initiative[]>>;
  /** Load a single initiative by id (D2 lifecycle). */
  getById(id: string): Promise<RuntimeResult<Initiative | null>>;
  /**
   * Persist a transitioned initiative under optimistic concurrency (D2). The write
   * must match `expectedVersion`; a mismatch returns `conflict` (a concurrent
   * transition won). `next.version` is the new version to store.
   */
  save(next: Initiative, expectedVersion: number): Promise<RuntimeResult<Initiative>>;
}

export interface TransformationActivityRepository {
  /** Append one activity record. Idempotent on `commandId` — replays are no-ops. */
  append(record: TransformationActivity): Promise<RuntimeResult<TransformationActivity>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<TransformationActivity[]>>;
}

/* ---- D3/D4 execution-management ports -------------------------------------- */

export interface ReviewRepository {
  create(review: Review): Promise<RuntimeResult<Review>>;
  getById(id: string): Promise<RuntimeResult<Review | null>>;
  listByInitiative(initiativeId: string): Promise<RuntimeResult<Review[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Review[]>>;
  /** Optimistic-concurrency decision write; a version mismatch returns `conflict`. */
  save(next: Review, expectedVersion: number): Promise<RuntimeResult<Review>>;
}

export interface TaskRepository {
  create(task: Task): Promise<RuntimeResult<Task>>;
  getById(id: string): Promise<RuntimeResult<Task | null>>;
  listByInitiative(initiativeId: string): Promise<RuntimeResult<Task[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Task[]>>;
  /** Optimistic-concurrency write (status / fields / assignee); mismatch → `conflict`. */
  save(next: Task, expectedVersion: number): Promise<RuntimeResult<Task>>;
}

export interface AssignmentRepository {
  /** Append one immutable assignment record (history is never edited). */
  append(record: Assignment): Promise<RuntimeResult<Assignment>>;
  listByTask(taskId: string): Promise<RuntimeResult<Assignment[]>>;
}

export interface DependencyRepository {
  create(dependency: Dependency): Promise<RuntimeResult<Dependency>>;
  remove(id: string): Promise<RuntimeResult<null>>;
  getById(id: string): Promise<RuntimeResult<Dependency | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Dependency[]>>;
}

/** The ports the Phase D application use-cases are wired with (D1 → D4). */
export interface TransformationExecutionRepositories {
  workspaces: TransformationWorkspaceRepository;
  initiatives: InitiativeRepository;
  activities: TransformationActivityRepository;
  reviews: ReviewRepository;
  tasks: TaskRepository;
  assignments: AssignmentRepository;
  dependencies: DependencyRepository;
  timelines: TimelineRepository;
  milestones: MilestoneRepository;
  kpis: KpiRepository;
  progress: ProgressSnapshotRepository;
}

/* ---- D5/D6 planning & performance ports ------------------------------------ */
import type { Kpi, ProgressSnapshot, Timeline, TxMilestone } from "@brightloop/schema";

export interface TimelineRepository {
  create(timeline: Timeline): Promise<RuntimeResult<Timeline>>;
  getById(id: string): Promise<RuntimeResult<Timeline | null>>;
  getByInitiative(initiativeId: string): Promise<RuntimeResult<Timeline | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Timeline[]>>;
  save(next: Timeline, expectedVersion: number): Promise<RuntimeResult<Timeline>>;
}

export interface MilestoneRepository {
  create(milestone: TxMilestone): Promise<RuntimeResult<TxMilestone>>;
  getById(id: string): Promise<RuntimeResult<TxMilestone | null>>;
  listByInitiative(initiativeId: string): Promise<RuntimeResult<TxMilestone[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<TxMilestone[]>>;
  save(next: TxMilestone, expectedVersion: number): Promise<RuntimeResult<TxMilestone>>;
}

export interface KpiRepository {
  create(kpi: Kpi): Promise<RuntimeResult<Kpi>>;
  getById(id: string): Promise<RuntimeResult<Kpi | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Kpi[]>>;
  save(next: Kpi, expectedVersion: number): Promise<RuntimeResult<Kpi>>;
}

export interface ProgressSnapshotRepository {
  /** Append one immutable snapshot (history is never edited). */
  append(snapshot: ProgressSnapshot): Promise<RuntimeResult<ProgressSnapshot>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<ProgressSnapshot[]>>;
  listBySubject(subjectId: string): Promise<RuntimeResult<ProgressSnapshot[]>>;
}
