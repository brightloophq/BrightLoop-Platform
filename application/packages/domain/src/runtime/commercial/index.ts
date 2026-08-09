/* =============================================================================
 * Post-scan commercial workflow — barrel.
 *
 * A separate scheduler that runs AFTER the core 13-stage scan completes, over the
 * same durable queue primitives, sequencing commercial stages (competitor →
 * proposal → narrative → review as they land). Never re-enters the core pipeline.
 * ========================================================================== */

export * from "./stages.js";
export * from "./competitor-executor.js";
export * from "./coordinator.js";
