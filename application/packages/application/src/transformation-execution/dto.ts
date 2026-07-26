/* =============================================================================
 * Transformation Execution — DTO boundary (Phase D · Sprint D1).
 *
 * The ONLY shapes that cross outward to the web layer. Deterministic projections
 * of the domain aggregates — no repository rows, no internal fields, no Phase C
 * envelopes. Mirrors the C1 `toScanDTO` boundary discipline.
 * ========================================================================== */

import type { Assignment, Dependency, Initiative, Review, Task, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";

export interface InitiativeDTO {
  id: string;
  title: string;
  objective: string | null;
  priority: Initiative["priority"];
  effort: Initiative["effort"];
  businessImpact: Initiative["businessImpact"];
  dependencies: string[];
  supportingEvidenceIds: string[];
  executionStatus: Initiative["executionStatus"];
  /** Optimistic-concurrency version (D2). */
  version: number;
  sourceProposalItemId: string;
}

export interface WorkspaceSummaryDTO {
  id: string;
  clientId: string | null;
  scanRunId: string;
  reportArtifactId: string | null;
  proposalArtifactId: string | null;
  title: string;
  status: TransformationWorkspace["status"];
  seedChecksum: string;
  initiativeCount: number;
  createdAt: string;
}

export interface ProgressDTO {
  total: number;
  byPriority: { critical: number; high: number; medium: number; low: number };
  byStatus: { seeded: number };
}

export interface ActivitySummaryDTO {
  id: string;
  type: TransformationActivity["type"];
  subjectType: TransformationActivity["subjectType"];
  subjectId: string;
  summary: string;
  at: string;
}

export interface WorkspaceDetailDTO {
  workspace: WorkspaceSummaryDTO;
  initiatives: InitiativeDTO[];
  progress: ProgressDTO;
  activities: ActivitySummaryDTO[];
}

export function toInitiativeDTO(i: Initiative): InitiativeDTO {
  return {
    id: i.id,
    title: i.title,
    objective: i.objective,
    priority: i.priority,
    effort: i.effort,
    businessImpact: i.businessImpact,
    dependencies: i.dependencies,
    supportingEvidenceIds: i.supportingEvidenceIds,
    executionStatus: i.executionStatus,
    version: i.version,
    sourceProposalItemId: i.sourceProposalItemId,
  };
}

/** Per-initiative read model: current state/version + its transition history. */
export interface InitiativeDetailDTO {
  initiative: InitiativeDTO;
  /** The append-only activity for this initiative, oldest first. */
  history: ActivitySummaryDTO[];
}

export function toWorkspaceSummaryDTO(w: TransformationWorkspace, initiativeCount: number): WorkspaceSummaryDTO {
  return {
    id: w.id,
    clientId: w.clientId,
    scanRunId: w.scanRunId,
    reportArtifactId: w.reportArtifactId,
    proposalArtifactId: w.proposalArtifactId,
    title: w.title,
    status: w.status,
    seedChecksum: w.seedChecksum,
    initiativeCount,
    createdAt: w.createdAt,
  };
}

export function toProgressDTO(initiatives: readonly Initiative[]): ProgressDTO {
  const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of initiatives) byPriority[i.priority] += 1;
  return { total: initiatives.length, byPriority, byStatus: { seeded: initiatives.length } };
}

export function toActivitySummaryDTO(a: TransformationActivity): ActivitySummaryDTO {
  return { id: a.id, type: a.type, subjectType: a.subjectType, subjectId: a.subjectId, summary: a.summary, at: a.at };
}

export function toWorkspaceDetailDTO(w: TransformationWorkspace, initiatives: readonly Initiative[], activities: readonly TransformationActivity[]): WorkspaceDetailDTO {
  return {
    workspace: toWorkspaceSummaryDTO(w, initiatives.length),
    initiatives: initiatives.map(toInitiativeDTO),
    progress: toProgressDTO(initiatives),
    activities: activities.map(toActivitySummaryDTO),
  };
}

/* ---- D3/D4 execution-management DTOs --------------------------------------- */

export interface ReviewDTO {
  id: string;
  initiativeId: string;
  status: Review["status"];
  note: string | null;
  decisionActorId: string | null;
  version: number;
  createdAt: string;
}
export function toReviewDTO(r: Review): ReviewDTO {
  return { id: r.id, initiativeId: r.initiativeId, status: r.status, note: r.note, decisionActorId: r.decisionActorId, version: r.version, createdAt: r.createdAt };
}

export interface TaskDTO {
  id: string;
  initiativeId: string;
  title: string;
  description: string | null;
  status: Task["status"];
  priority: Task["priority"];
  estimate: string | null;
  assigneeActorId: string | null;
  order: number;
  dependencyIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}
export function toTaskDTO(t: Task): TaskDTO {
  return { id: t.id, initiativeId: t.initiativeId, title: t.title, description: t.description, status: t.status, priority: t.priority, estimate: t.estimate, assigneeActorId: t.assigneeActorId, order: t.order, dependencyIds: t.dependencyIds, version: t.version, createdAt: t.createdAt, updatedAt: t.updatedAt };
}

export interface AssignmentDTO {
  id: string;
  taskId: string;
  action: Assignment["action"];
  assigneeActorId: string | null;
  assignedByActorId: string;
  at: string;
}
export function toAssignmentDTO(a: Assignment): AssignmentDTO {
  return { id: a.id, taskId: a.taskId, action: a.action, assigneeActorId: a.assigneeActorId, assignedByActorId: a.assignedByActorId, at: a.at };
}

export interface DependencyDTO {
  id: string;
  fromInitiativeId: string;
  toInitiativeId: string;
  type: Dependency["type"];
  createdAt: string;
}
export function toDependencyDTO(d: Dependency): DependencyDTO {
  return { id: d.id, fromInitiativeId: d.fromInitiativeId, toInitiativeId: d.toInitiativeId, type: d.type, createdAt: d.createdAt };
}

/** The execution read model for one initiative: reviews + tasks + readiness. */
export interface InitiativeExecutionDTO {
  initiativeId: string;
  reviews: ReviewDTO[];
  tasks: TaskDTO[];
  /** True when an approved review exists — the initiative may execute. */
  executionReady: boolean;
  taskCounts: { todo: number; in_progress: number; blocked: number; completed: number };
}

/** The workspace-level execution summary: dependency graph + per-initiative rollups. */
export interface WorkspaceExecutionDTO {
  workspaceId: string;
  dependencies: DependencyDTO[];
  reviews: ReviewDTO[];
  tasks: TaskDTO[];
  executionReadyInitiativeIds: string[];
}

/* ---- D5/D6 planning & performance DTOs ------------------------------------- */
import type { Kpi, ProgressSnapshot, Timeline, TxMilestone } from "@brightloop/schema";
import { calculateVariance } from "@brightloop/domain";

export interface TimelineDTO {
  id: string;
  initiativeId: string;
  startDate: string;
  targetEndDate: string;
  actualEndDate: string | null;
  status: Timeline["status"];
  plannedDuration: number;
  actualDuration: number | null;
  variance: number | null;
  version: number;
}
export function toInitiativeTimelineDTO(t: Timeline): TimelineDTO {
  const v = calculateVariance(t);
  return { id: t.id, initiativeId: t.initiativeId, startDate: t.startDate, targetEndDate: t.targetEndDate, actualEndDate: t.actualEndDate, status: t.status, plannedDuration: v.plannedDuration, actualDuration: v.actualDuration, variance: v.variance, version: t.version };
}

export interface MilestoneDTO {
  id: string;
  initiativeId: string;
  title: string;
  description: string | null;
  plannedDate: string;
  completedDate: string | null;
  status: TxMilestone["status"];
  order: number;
  version: number;
}
export function toMilestoneDTO(m: TxMilestone): MilestoneDTO {
  return { id: m.id, initiativeId: m.initiativeId, title: m.title, description: m.description, plannedDate: m.plannedDate, completedDate: m.completedDate, status: m.status, order: m.order, version: m.version };
}

export interface KpiDTO {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  status: Kpi["status"];
  lastUpdated: string;
  version: number;
}
export function toKpiDTO(k: Kpi): KpiDTO {
  return { id: k.id, name: k.name, target: k.target, current: k.current, unit: k.unit, status: k.status, lastUpdated: k.lastUpdated, version: k.version };
}

export interface ProgressSnapshotDTO {
  id: string;
  scope: ProgressSnapshot["scope"];
  subjectId: string;
  progress: number;
  taskCompletion: number;
  reviewCompletion: number;
  dependencyCompletion: number;
  milestoneCompletion: number;
  timelineVariance: number | null;
  health: ProgressSnapshot["health"];
  at: string;
}
export function toProgressSnapshotDTO(s: ProgressSnapshot): ProgressSnapshotDTO {
  return { id: s.id, scope: s.scope, subjectId: s.subjectId, progress: s.progress, taskCompletion: s.taskCompletion, reviewCompletion: s.reviewCompletion, dependencyCompletion: s.dependencyCompletion, milestoneCompletion: s.milestoneCompletion, timelineVariance: s.timelineVariance, health: s.health, at: s.at };
}

/** Per-initiative performance read model. */
export interface InitiativePerformanceDTO {
  initiativeId: string;
  timeline: TimelineDTO | null;
  milestones: MilestoneDTO[];
  progress: number;
  latestSnapshot: ProgressSnapshotDTO | null;
}

/** Workspace performance + health dashboard read model. */
export interface WorkspacePerformanceDTO {
  workspaceId: string;
  workspaceProgress: number;
  health: ProgressSnapshot["health"];
  healthReasons: string[];
  kpis: KpiDTO[];
  timelines: TimelineDTO[];
  milestones: MilestoneDTO[];
  initiativeProgress: { initiativeId: string; progress: number }[];
  latestSnapshots: ProgressSnapshotDTO[];
}

/** Result of a workspace-health calculation (derived, with reasons). */
export interface WorkspaceHealthDTO {
  workspaceId: string;
  health: ProgressSnapshot["health"];
  reasons: string[];
  workspaceProgress: number;
  snapshot: ProgressSnapshotDTO;
}
