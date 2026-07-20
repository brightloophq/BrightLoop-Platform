/* =============================================================================
 * End-to-End Business Intelligence Pipeline (Sprint 8) — barrel.
 *
 * The canonical internal scan pipeline wiring the Phase-A layers together. Named
 * `pipeline-run` so it does not collide with the Sprint-1 `pipeline.ts`
 * (PDF-26 `SCAN_PIPELINE` stage order), which remains untouched. `events.ts` is
 * namespaced (`pipelineEvents`) alongside the other event modules.
 * ========================================================================== */

export * from "./run.js";
export * from "./stages.js";
export * from "./artifacts.js";
export * from "./checkpoint.js";
export * from "./failure.js";
export * from "./budget.js";
export * from "./findings.js";
export * from "./candidates.js";
export * from "./report.js";
export * from "./runner.js";
export * as pipelineEvents from "./events.js";
