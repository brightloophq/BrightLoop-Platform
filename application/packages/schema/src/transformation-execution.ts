/* =============================================================================
 * Transformation Execution — CONTRACTS (Phase D · Sprint D1).
 *
 * The bounded context that begins AFTER Phase C Report Assembly: a certified
 * `proposal` (ProposalIntelligenceSnapshot) becomes an executable Transformation
 * Workspace with deterministically seeded Initiatives and an append-only Activity
 * log. Distinct from the product transformation-cycle contracts — these are the
 * NEW `transformation_workspace` / `transformation_initiative` /
 * `transformation_activity` shapes; nothing here touches the certified runtime.
 *
 * D1 SCOPE: only workspace creation + initiative seeding. No workflow engine, no
 * tasks/reviews/timeline/KPIs — those are D2+. Execution has not begun; status is
 * the simple terminal-of-seed `seeded`.
 * ========================================================================== */

import { z } from "zod";
import { proposalPrioritySchema, proposalEffortSchema, proposalImpactSchema } from "./proposal-intelligence.js";

export const TRANSFORMATION_WORKSPACE_FORMULA_VERSION = "tx-workspace-1.0";

/** D1 workspace status: a freshly seeded workspace. Lifecycle arrives in D2+. */
export const transformationWorkspaceStatusSchema = z.enum(["seeded"]);
export type TransformationWorkspaceStatus = z.infer<typeof transformationWorkspaceStatusSchema>;

/**
 * Initiative execution status (D2 lifecycle). Forward-only:
 * `seeded → planned → active → completed → archived`. No other transitions.
 */
export const initiativeExecutionStatusSchema = z.enum(["seeded", "planned", "active", "completed", "archived"]);
export type InitiativeExecutionStatus = z.infer<typeof initiativeExecutionStatusSchema>;

/** Activity types: D1 seed + D2 lifecycle + D3/D4 execution-management events. */
export const transformationActivityTypeSchema = z.enum([
  // D1 seed
  "workspace_created",
  "initiative_seeded",
  // D2 initiative lifecycle
  "initiative_planned",
  "initiative_activated",
  "initiative_completed",
  "initiative_archived",
  // D3/D4 execution management
  "review_approved",
  "review_rejected",
  "review_changes_requested",
  "task_created",
  "task_updated",
  "task_completed",
  "task_blocked",
  "task_assigned",
  "task_reassigned",
  "task_unassigned",
  "dependency_linked",
  "dependency_removed",
  // D5/D6 planning & performance
  "timeline_started",
  "timeline_completed",
  "timeline_cancelled",
  "milestone_created",
  "milestone_completed",
  "milestone_missed",
  "kpi_updated",
  "progress_calculated",
  "workspace_health_calculated",
  // D7 collaboration
  "note_added",
  "user_mentioned",
  "user_subscribed",
  "user_unsubscribed",
]);
export type TransformationActivityType = z.infer<typeof transformationActivityTypeSchema>;

export const activitySubjectTypeSchema = z.enum(["workspace", "initiative", "review", "task", "dependency", "timeline", "milestone", "kpi", "progress", "note", "mention", "notification", "subscription"]);
export type ActivitySubjectType = z.infer<typeof activitySubjectTypeSchema>;

/**
 * An Initiative — a unit of executable work, seeded 1:1 from a proposal item.
 * Priority / effort / businessImpact / supportingEvidenceIds are CARRIED verbatim
 * from the proposal (traceability preserved); Phase D never recomputes them.
 */
export const initiativeSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  /** The proposal item this initiative was seeded from (lineage). */
  sourceProposalItemId: z.string(),
  title: z.string().min(1).max(200),
  objective: z.string().max(2000).nullable().default(null),
  priority: proposalPrioritySchema,
  effort: proposalEffortSchema,
  businessImpact: proposalImpactSchema,
  /** Initiative ids that must land first (mapped from proposal-item dependencies). */
  dependencies: z.array(z.string()).default([]),
  supportingEvidenceIds: z.array(z.string().max(200)).default([]),
  /** The Phase C proposal artifact this initiative traces to. */
  proposalArtifactId: z.string(),
  executionStatus: initiativeExecutionStatusSchema,
  /** Optimistic-concurrency version; bumped on every lifecycle transition (D2). */
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type Initiative = z.infer<typeof initiativeSchema>;

/**
 * A Transformation Workspace — the engagement container seeded from a certified
 * scan. `scanRunId` + the artifact ids + `seedChecksum` are immutable lineage.
 */
export const transformationWorkspaceSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  /** The certified scan run this workspace was seeded from (immutable). */
  scanRunId: z.string(),
  reportArtifactId: z.string().nullable(),
  proposalArtifactId: z.string().nullable(),
  title: z.string().min(1).max(200),
  objectives: z.array(z.string().max(300)).default([]),
  status: transformationWorkspaceStatusSchema,
  /** Content-addressed digest of the seed — the idempotency identity. */
  seedChecksum: z.string(),
  /** Optimistic-concurrency version (D1 writes are seed-once; carried for D2+). */
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type TransformationWorkspace = z.infer<typeof transformationWorkspaceSchema>;

/** One append-only activity/audit record. Never edited or deleted. */
export const transformationActivitySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  type: transformationActivityTypeSchema,
  subjectType: activitySubjectTypeSchema,
  subjectId: z.string(),
  summary: z.string().max(400),
  /** Idempotency key — re-applying the same command is a no-op. */
  commandId: z.string(),
  /** The user who caused the activity (D7). Optional/nullable — pre-D7 activities
   * and callers that don't record an actor leave it absent. */
  actorId: z.string().nullable().optional(),
  at: z.string(),
});
export type TransformationActivity = z.infer<typeof transformationActivitySchema>;

/** The deterministic output of the seeding projection (pure, content-addressed). */
export const transformationWorkspaceSeedSchema = z.object({
  workspace: transformationWorkspaceSchema,
  initiatives: z.array(initiativeSchema).default([]),
  activities: z.array(transformationActivitySchema).default([]),
  seedChecksum: z.string(),
});
export type TransformationWorkspaceSeed = z.infer<typeof transformationWorkspaceSeedSchema>;

/* =============================================================================
 * D3 / D4 — Execution management: Review · Task · Assignment · Dependency.
 * All internal-only, client-scoped, optimistic-concurrency where mutable.
 * ========================================================================== */

/* ---- Review (D3) ----------------------------------------------------------- */
export const reviewStatusSchema = z.enum(["pending", "changes_requested", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

/** A review/approval gate against one initiative. `approved`/`rejected` terminal. */
export const reviewSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  initiativeId: z.string(),
  clientId: z.string().nullable(),
  status: reviewStatusSchema,
  note: z.string().max(2000).nullable().default(null),
  decisionActorId: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

/* ---- Task (D4) ------------------------------------------------------------- */
export const taskStatusSchema = z.enum(["todo", "in_progress", "blocked", "completed"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** A unit of execution work under one initiative. */
export const taskSchema = z.object({
  id: z.string(),
  initiativeId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  status: taskStatusSchema,
  priority: taskPrioritySchema.default("medium"),
  /** A free-form effort estimate (e.g. "2d", "M") — bounded, optional. */
  estimate: z.string().max(40).nullable().default(null),
  /** The current owner (mirrors the latest Assignment); null when unassigned. */
  assigneeActorId: z.string().nullable().default(null),
  /** Stable ordering within an initiative. */
  order: z.number().int().nonnegative().default(0),
  /** Other task ids this task depends on (within the same initiative). */
  dependencyIds: z.array(z.string()).default([]),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

/* ---- Assignment (D4, append-only history) ---------------------------------- */
export const assignmentActionSchema = z.enum(["assigned", "reassigned", "unassigned"]);
export type AssignmentAction = z.infer<typeof assignmentActionSchema>;

/** An immutable ownership-change record for a task. History is never edited. */
export const assignmentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  action: assignmentActionSchema,
  /** The new owner (null on `unassigned`). */
  assigneeActorId: z.string().nullable().default(null),
  assignedByActorId: z.string(),
  at: z.string(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

/* ---- Dependency (D3, initiative → initiative graph) ------------------------- */
export const dependencyTypeSchema = z.enum(["depends_on", "blocks"]);
export type DependencyType = z.infer<typeof dependencyTypeSchema>;

/** A managed dependency edge between two initiatives in the same workspace. */
export const dependencySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  fromInitiativeId: z.string(),
  toInitiativeId: z.string(),
  type: dependencyTypeSchema,
  createdAt: z.string(),
});
export type Dependency = z.infer<typeof dependencySchema>;

/* =============================================================================
 * D5 / D6 — Planning & Performance: Timeline · Milestone · KPI · ProgressSnapshot.
 * Progress and health are DERIVED (never manually edited); snapshots are
 * append-only, point-in-time. All internal-only, client-scoped.
 * ========================================================================== */

/* ---- Timeline (D5) --------------------------------------------------------- */
export const timelineStatusSchema = z.enum(["planned", "active", "completed", "cancelled"]);
export type TimelineStatus = z.infer<typeof timelineStatusSchema>;

/** The execution schedule for one initiative. Durations/variance are derived. */
export const timelineSchema = z.object({
  id: z.string(),
  initiativeId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  /** ISO dates. `targetEndDate` must not precede `startDate` (validated). */
  startDate: z.string(),
  targetEndDate: z.string(),
  actualEndDate: z.string().nullable().default(null),
  status: timelineStatusSchema,
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type Timeline = z.infer<typeof timelineSchema>;

/* ---- Milestone (D5) — `Tx`-prefixed to avoid the product `Milestone`. ------- */
export const txMilestoneStatusSchema = z.enum(["pending", "completed", "missed"]);
export type TxMilestoneStatus = z.infer<typeof txMilestoneStatusSchema>;

export const txMilestoneSchema = z.object({
  id: z.string(),
  initiativeId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  plannedDate: z.string(),
  completedDate: z.string().nullable().default(null),
  status: txMilestoneStatusSchema,
  order: z.number().int().nonnegative().default(0),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type TxMilestone = z.infer<typeof txMilestoneSchema>;

/* ---- KPI (D6) -------------------------------------------------------------- */
export const kpiStatusSchema = z.enum(["on_track", "at_risk", "off_track"]);
export type KpiStatus = z.infer<typeof kpiStatusSchema>;

/** A measurable indicator. `status` is DERIVED from target vs current. */
export const kpiSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  name: z.string().min(1).max(160),
  target: z.number(),
  current: z.number(),
  unit: z.string().max(40).default(""),
  status: kpiStatusSchema,
  lastUpdated: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type Kpi = z.infer<typeof kpiSchema>;

/* ---- Progress Snapshot (D6, append-only, point-in-time) -------------------- */
export const progressScopeSchema = z.enum(["initiative", "workspace"]);
export type ProgressScope = z.infer<typeof progressScopeSchema>;

export const workspaceHealthSchema = z.enum(["healthy", "warning", "critical"]);
export type WorkspaceHealth = z.infer<typeof workspaceHealthSchema>;

/** An immutable point-in-time metrics snapshot. Percentages are 0–100 integers. */
export const progressSnapshotSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  scope: progressScopeSchema,
  /** The initiative id (scope=initiative) or the workspace id (scope=workspace). */
  subjectId: z.string(),
  progress: z.number().int().min(0).max(100),
  taskCompletion: z.number().int().min(0).max(100),
  reviewCompletion: z.number().int().min(0).max(100),
  dependencyCompletion: z.number().int().min(0).max(100),
  milestoneCompletion: z.number().int().min(0).max(100),
  /** Timeline variance in whole days (negative = ahead, positive = late); null if none. */
  timelineVariance: z.number().int().nullable().default(null),
  health: workspaceHealthSchema.nullable().default(null),
  at: z.string(),
});
export type ProgressSnapshot = z.infer<typeof progressSnapshotSchema>;
