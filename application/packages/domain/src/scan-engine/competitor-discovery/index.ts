/* =============================================================================
 * Competitor Discovery (Post-scan commercial workflow) — barrel.
 *
 * Evidence-only competitor discovery: extract the prospect's own outbound
 * references, gate them through AIS-005 identity validation, and mint verified
 * competitor evidence for the deterministic C8 Competitor Intelligence step.
 * Pure, deterministic, offline (no search, scraping, HTTP, or AI).
 * ========================================================================== */

export * from "./refs.js";
export * from "./discovery.js";
