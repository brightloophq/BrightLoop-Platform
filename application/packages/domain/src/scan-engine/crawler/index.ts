/* =============================================================================
 * L2 · Crawler Engine (PDF 27 §04) — SKELETON.
 *
 * Fetches pages and assets under budget + rate limits, rendering where needed,
 * and captures the RAW signals higher layers interpret. Raw capture only — no
 * interpretation (Law: evidence_before_reasoning). Port only; no fetching here.
 * The `CrawlBudget` / `RawCapture` contracts live in @brightloop/schema.
 * ========================================================================== */

import type { CrawlSurface, CrawlBudget, RawCapture } from "@brightloop/schema";

/** Fetches the discovered surface within budget; returns raw captures only. */
export interface CrawlerEngine {
  crawl(input: { surface: CrawlSurface; budget?: CrawlBudget }): Promise<RawCapture[]>;
}
