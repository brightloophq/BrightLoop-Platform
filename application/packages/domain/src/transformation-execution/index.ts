/* =============================================================================
 * Transformation Execution (Phase D) — domain barrel.
 *
 * The bounded context that begins after Phase C Report Assembly. D1: the pure
 * seeding projection + the repository ports + the event taxonomy. Additive — it
 * touches no Phase A–C domain module and no certified runtime.
 * ========================================================================== */

export * from "./seed.js";
export * from "./lifecycle.js";
export * from "./review.js";
export * from "./task.js";
export * from "./dependency.js";
export * from "./timeline.js";
export * from "./milestone.js";
export * from "./kpi.js";
export * from "./progress.js";
export * from "./health.js";
export * from "./repository.js";
export * from "./events.js";
