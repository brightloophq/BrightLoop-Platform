/* =============================================================================
 * @brightloop/domain — the service layer.
 * Layer 2 of the three-layer integrity model: capability checks + transition
 * guards + domain events + integration adapters. Every mutation that changes a
 * `status` goes through here; clients never write status directly.
 *
 * Also home to the repository PORTS and the pure business logic behind them —
 * the UI depends on these interfaces, never on a persistence implementation.
 * ========================================================================== */

export * from "./errors.js";
export * from "./guard.js";
export * from "./capabilities.js";
export * from "./events.js";
export * from "./adapters/payment.js";
export * from "./adapters/signature.js";
export * from "./adapters/email.js";
export * from "./adapters/automation.js";

// Reputation — publish gate, metric gate, query/sort/paginate/aggregate.
export * from "./reputation/query.js";
// Reputation SEO — canonical URLs + JSON-LD. Fail-closed on unpublished content.
export * from "./reputation/seo.js";
// Portfolio filter-rail facet counts.
export * from "./reputation/facets.js";

// Catalog — estimate ranges (never quotes), ordering, money formatting.
export * from "./catalog/pricing.js";

// Analytics — event taxonomy + pure aggregation.
export * from "./analytics/events.js";
export * from "./analytics/funnel.js";

// Funnel — assessment scoring + configurator (Keep/Improve/Replace/Create).
export * from "./funnel/assessment.js";
export * from "./funnel/configurator.js";

// Quotes — totals + the draft-quote-gate definition shared with RLS.
export * from "./quotes/quote.js";

// Repository ports.
export * from "./repositories/reputation.js";
export * from "./repositories/catalog.js";
