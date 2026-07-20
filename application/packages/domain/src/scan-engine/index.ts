/* Scan engine — foundation (PDF 26 surface contracts) + engine skeleton (PDF 27).
 * Contracts, ports, state machines, and pure logic only. No provider adapters,
 * LLM calls, crawler, queue backend, or persistence — those are later phases.
 * See docs/design/scan-engine-architecture.md + docs/design/engine-27-architecture.md. */

/* ---- PDF 26 surface foundation ---- */
export * from "./providers.js";
export * from "./entitlements.js";
export * from "./pipeline.js";

/* ---- PDF 27 engine layers (L1–L8) ---- */
export * from "./discovery/index.js"; // L1
export * from "./crawler/index.js"; // L2
export * from "./evidence/index.js"; // L3
export * from "./graph/index.js"; // L4
export * from "./reasoning/index.js"; // L5
export * from "./recommendation/index.js"; // L6
export * from "./proposal/index.js"; // L7
export * from "./monitoring/index.js"; // L8

/* ---- orchestration + AI provider router ---- */
export * from "./orchestration/index.js";
export * from "./provider-router.js";

/* ---- AI provider execution layer (Sprint 7) ---- */
export * from "./execution/index.js";

/* ---- provider registry + cost-aware routing (Sprint 2) ---- */
export * from "./routing/index.js";
