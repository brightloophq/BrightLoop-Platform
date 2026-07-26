/* =============================================================================
 * Transformation Execution — EVENT TAXONOMY (Phase D · Sprint D1).
 *
 * The append-only activity types this context records. D1 emits only the seed
 * events; the execution/workflow events arrive in D2+. Distinct from the product
 * transformation-cycle `TRANSFORMATION_EVENTS`.
 * ========================================================================== */

export const TRANSFORMATION_WORKSPACE_EVENTS = [
  // D1 · seed
  "workspace.created",
  "initiative.seeded",
  // D2 · initiative lifecycle
  "initiative.planned",
  "initiative.activated",
  "initiative.completed",
  "initiative.archived",
  // D3/D4 · execution management
  "review.approved",
  "review.rejected",
  "review.changes_requested",
  "task.created",
  "task.updated",
  "task.completed",
  "task.blocked",
  "task.assigned",
  "task.reassigned",
  "task.unassigned",
  "dependency.linked",
  "dependency.removed",
  // D5/D6 · planning & performance
  "timeline.started",
  "timeline.completed",
  "timeline.cancelled",
  "milestone.created",
  "milestone.completed",
  "milestone.missed",
  "kpi.updated",
  "progress.calculated",
  "workspace.health_calculated",
] as const;
export type TransformationWorkspaceEventName = (typeof TRANSFORMATION_WORKSPACE_EVENTS)[number];
