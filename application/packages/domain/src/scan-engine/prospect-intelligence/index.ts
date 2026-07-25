/* =============================================================================
 * Prospect Intelligence Engine (Phase C · Sprint C5) — barrel.
 *
 * The missing layer between evidence and a proposal:
 *
 *   Evidence → Business Intelligence → Executive Summary
 *            → Transformation Opportunities → (Proposal Engine, elsewhere)
 *
 * Entirely PURE and deterministic. It creates no proposal, no pricing, and
 * performs no autonomous execution. Every statement links to evidence, every
 * score exposes its calculation, unknown stays unknown, unavailable stays
 * unavailable, confidence never inflates, and human review is always required.
 * ========================================================================== */

export * from "./scoring.js";
export * from "./confidence.js";
export * from "./maturity.js";
export * from "./business-profile.js";
export * from "./industry.js";
export * from "./strengths.js";
export * from "./weaknesses.js";
export * from "./opportunities.js";
export * from "./risks.js";
export * from "./transformation-readiness.js";
export * from "./executive-summary.js";
export * from "./recommendations.js";
export * from "./outputs.js";
export * from "./integration.js";

// `events` shares constructor names (`reviewRequired`, …) with other engine
// event modules, so it is namespaced — mirroring the discovery-state-machine and
// routing-health pattern used elsewhere in the domain.
export * as prospectEvents from "./events.js";
