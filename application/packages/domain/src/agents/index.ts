/* =============================================================================
 * AI Agents & Multi-Agent Orchestration (Phase E · Sprint E7) — domain barrel.
 *
 * Lifecycle state machines, the capability registry, the task-graph validator +
 * claim semantics, the deterministic mission planner, guardrails/budgets, the
 * prompt-injection defense, evaluation scoring, stable hashing, immutable
 * builders, and the repository ports. All pure. Agents ORCHESTRATE Phase D +
 * E1–E6 only via their application services; they never duplicate that
 * intelligence, import upstream repositories, or reach outside.
 * ========================================================================== */

export * from "./lifecycle.js";
export * from "./capabilities.js";
export * from "./taskgraph.js";
export * from "./planner.js";
export * from "./guardrails.js";
export * from "./injection.js";
export * from "./evaluation.js";
export * from "./hash.js";
export * from "./builders.js";
export * from "./repository.js";
