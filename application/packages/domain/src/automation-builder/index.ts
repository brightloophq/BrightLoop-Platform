/* =============================================================================
 * AI Automation Builder (Phase E · Sprint E5) — domain barrel.
 *
 * Execution-intent lifecycle + immutable automation builders, workflow DAG
 * algorithms (cycles / reachability / topological order), the validation
 * pipeline, the dry-run simulation engine, and the repository ports. All pure.
 * The builder reaches Phase D / E1-E4 only via their application services and
 * NEVER executes, deploys, or calls an automation engine.
 * ========================================================================== */

export * from "./intent.js";
export * from "./graph.js";
export * from "./validation.js";
export * from "./simulation.js";
export * from "./repository.js";
