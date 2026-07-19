/* =============================================================================
 * L1 · Discovery Engine (PDF 27 §04) — SKELETON.
 *
 * Resolves a URL into a crawlable surface — sitemap, routes, connected
 * properties, public identifiers — and sets the scan BOUNDARY. Port only; the
 * adapter (deferred) owns fetching and MUST enforce SSRF / private-network guards.
 * The `CrawlSurface` contract lives in @brightloop/schema.
 * ========================================================================== */

import type { CrawlSurface } from "@brightloop/schema";

/** Resolves the entry URL into a bounded, crawlable surface. */
export interface DiscoveryEngine {
  /** Adapter MUST reject private/link-local/loopback hosts (SSRF) before returning. */
  resolve(input: { scanId: string; url: string }): Promise<CrawlSurface>;
}

/* ---- Sprint 5 · Discovery & Crawl Orchestration (pure contracts) ---- */
export * from "./url.js";
export * from "./resolve.js";
export * from "./security.js";
export * from "./plan.js";
export * from "./robots.js";
export * from "./session.js";
// statemachine shares `canTransition`/`shouldRetry` names with pipeline/background,
// so it is namespaced (mirrors the routing circuit/health pattern).
export * as discoveryStateMachine from "./statemachine.js";
