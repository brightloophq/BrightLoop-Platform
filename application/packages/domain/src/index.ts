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

// Transformation cycle — service layer, repository port, and event taxonomy.
export * from "./transformation/index.js";
// Core surfaces (Phase 1B) — Business Scan / Activation / Console.
export * from "./core-surfaces/index.js";
// Scan engine foundation — provider ports, entitlements, pipeline (engine deferred).
export * from "./scan-engine/index.js";
export * from "./transformation-execution/index.js";
// Collaboration & operational awareness (Phase D · D7).
export * from "./collaboration/index.js";
// AI Foundation (Phase E · E1) — provider-agnostic AI substrate.
export * from "./ai-foundation/index.js";
// Knowledge Base / RAG (Phase E · E2) — workspace-scoped retrieval substrate.
export * from "./knowledge/index.js";
// AI Strategist (Phase E · E3) — structured business-transformation reasoning.
export * from "./strategist/index.js";
// AI Project Manager (Phase E · E4) — strategy → executable plan (→ Phase D).
export * from "./project-manager/index.js";
// AI Automation Builder (Phase E · E5) — approved plan → automation workflows.
export * from "./automation-builder/index.js";
// AI Reporting & BI (Phase E · E6) — observe upstream outputs → executive reports.
export * from "./reporting/index.js";
// AI Agents (Phase E · E7) — orchestrate E1–E6 + Phase D via capability registry.
export * from "./agents/index.js";
// Runtime persistence (Phase B) — repository port + result model.
export * from "./runtime/index.js";
