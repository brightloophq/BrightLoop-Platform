/* =============================================================================
 * Transformation domain — the production service layer for the transformation
 * cycle (Sprint 2), built on the Sprint 1 schema + RLS.
 * ========================================================================== */

export * from "./repository.js";
export * from "./events.js";
export * from "./service.js";
// Dashboard read model — pure metrics/pipeline/attention/activity derivation.
export * from "./dashboard.js";
