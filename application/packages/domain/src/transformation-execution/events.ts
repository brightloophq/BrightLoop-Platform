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
] as const;
export type TransformationWorkspaceEventName = (typeof TRANSFORMATION_WORKSPACE_EVENTS)[number];
