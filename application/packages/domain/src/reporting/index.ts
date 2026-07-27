/* =============================================================================
 * AI Reporting & Business Intelligence (Phase E · Sprint E6) — domain barrel.
 *
 * Executive-report lifecycle + immutable reporting builders, the analytics
 * engines (metrics, KPIs, trends, forecasts, insights — all pure), and the
 * repository ports. Reporting OBSERVES upstream outputs via their application
 * services and never modifies them, executes, plans, or regenerates strategy.
 * ========================================================================== */

export * from "./report.js";
export * from "./analytics.js";
export * from "./repository.js";
