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
