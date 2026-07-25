/* =============================================================================
 * Transformation Execution — EVENT TAXONOMY (Phase D · Sprint D1).
 *
 * The append-only activity types this context records. D1 emits only the seed
 * events; the execution/workflow events arrive in D2+. Distinct from the product
 * transformation-cycle `TRANSFORMATION_EVENTS`.
 * ========================================================================== */

export const TRANSFORMATION_WORKSPACE_EVENTS = ["workspace.created", "initiative.seeded"] as const;
export type TransformationWorkspaceEventName = (typeof TRANSFORMATION_WORKSPACE_EVENTS)[number];
