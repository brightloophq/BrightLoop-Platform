/* =============================================================================
 * Evidence handoff (Phase C · Sprint C3 §9) — crawler output → Evidence Engine.
 *
 * Translates crawled page records into evidence ingress compatible with the
 * existing Evidence Engine. Observed website data → Observed; a page that failed
 * or was unavailable stays Unavailable. Every item carries source URL, timestamp,
 * method, checksum, and provenance. NO competitor inference, NO reasoning, NO
 * recommendations happen here — the crawler only collects and provenances.
 * ========================================================================== */

import { sourceForKind, toEvidenceIngress } from "@brightloop/domain";
import type { CrawlPathKind, DiscoveryResult, EvidenceIngress, EvidenceSource, EvidenceState } from "@brightloop/schema";
import type { PageRecord } from "./crawl.js";

/** A provenanced, state-classified evidence item derived from one crawled page. */
export interface CrawledEvidenceItem {
  targetId: string;
  url: string;
  finalUrl: string;
  kind: CrawlPathKind;
  source: EvidenceSource;
  /** observed (fetched) / unavailable (failed or excluded). Never fabricated. */
  state: EvidenceState;
  method: "crawl";
  stage: "discovery";
  status: number | null;
  checksum: string | null;
  collectedAt: string;
  freshness: string | null;
  reason: string | null;
}

export interface CrawledEvidence {
  scanId: string;
  /** The canonical ingress the Evidence Engine consumes (allowed targets). */
  ingress: EvidenceIngress;
  /** Per-page evidence records, including unavailable pages. */
  items: CrawledEvidenceItem[];
}

function stateFor(page: PageRecord): EvidenceState {
  return page.outcome === "ok" ? "observed" : "unavailable";
}

/**
 * Build the evidence handoff from a discovery result + its crawled pages. The
 * canonical `EvidenceIngress` comes from the pure Phase-A mapping; the per-page
 * `items` add fetch outcome, checksum, freshness, and state without inventing
 * anything for pages that were never successfully fetched.
 */
export function toCrawledEvidence(result: DiscoveryResult, pages: PageRecord[]): CrawledEvidence {
  const items: CrawledEvidenceItem[] = pages.map((p) => ({
    targetId: p.targetId,
    url: p.requestedUrl,
    finalUrl: p.finalUrl,
    kind: p.kind,
    source: sourceForKind(p.kind),
    state: stateFor(p),
    method: "crawl",
    stage: "discovery",
    status: p.status,
    checksum: p.checksum,
    collectedAt: p.collectedAt,
    freshness: p.lastModified,
    reason: p.reason,
  }));

  return { scanId: result.scanId, ingress: toEvidenceIngress(result), items };
}
