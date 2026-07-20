/* =============================================================================
 * Report & Narrative Engine (Sprint 12) — barrel.
 *
 * Turns validated structured artifacts into audience-specific, citation-safe
 * narrative sections. Pure and deterministic: every sentence comes from a
 * template bound to structured data — no free-form prose, no PDF, no HTML, no UI,
 * no email, no live AI.
 *
 * `events.ts` is namespaced (`narrativeEvents`) alongside the other event modules.
 * ========================================================================== */

export * from "./request.js";
export * from "./policy.js";
export * from "./claims.js";
export * from "./citations.js";
export * from "./sections.js";
export * from "./redaction.js";
export * from "./builders.js";
export * from "./artifact.js";
export * from "./integration.js";
export * as narrativeEvents from "./events.js";
