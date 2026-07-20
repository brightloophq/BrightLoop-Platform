/* =============================================================================
 * Competitor Intelligence Framework (Sprint 10) — barrel.
 *
 * Discovers, validates, scores, ranks, benchmarks, and compares a competitive set,
 * then feeds the result into the Intelligence Graph and Decision Science layers —
 * all pure, deterministic, and offline (no search, scraping, HTTP, or AI).
 *
 * `graph.ts` and `events.ts` are namespaced (`competitorGraph`, `competitorEvents`)
 * so they cannot collide with the graph/*, pipeline-run/*, and decision-science/*
 * modules, which remain unchanged.
 * ========================================================================== */

export * from "./candidate.js";
export * from "./identity.js";
export * from "./similarity.js";
export * from "./ranking.js";
export * from "./normalize.js";
export * from "./benchmarks.js";
export * from "./gaps.js";
export * from "./position.js";
export * from "./outputs.js";
export * from "./decision-inputs.js";
export * from "./confidence.js";
export * from "./snapshot.js";
export * as competitorGraph from "./graph.js";
export * as competitorEvents from "./events.js";
