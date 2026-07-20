/* =============================================================================
 * Recommendation Engine & Decision Science (Sprint 9) — barrel.
 *
 * Turns Sprint-8 recommendation candidates into scored, ranked, dependency-aware,
 * portfolio-selected, scenario-compared, review-ready decisions — all pure and
 * deterministic per AIS-003. Named `decision-science` so it does not collide with
 * the Sprint-1 `recommendation/` module (tier ranking over `EngineMove`), which is
 * unchanged. `events.ts` is namespaced (`recommendationEvents`).
 * ========================================================================== */

export * from "./model.js";
export * from "./factors.js";
export * from "./uncertainty.js";
export * from "./expected-value.js";
export * from "./priority.js";
export * from "./dependencies.js";
export * from "./ranking.js";
export * from "./portfolio.js";
export * from "./scenarios.js";
export * from "./sensitivity.js";
export * from "./brief.js";
export * from "./integration.js";
export * as recommendationEvents from "./events.js";
