/* =============================================================================
 * Competitor reference extraction (Phase C+ · Post-scan commercial) — PURE.
 *
 * Reads the persisted `discovery_manifest` envelope and surfaces the OUTBOUND
 * references the prospect's OWN site makes — external links and social links —
 * grouped by normalized domain, with the source pages that carried each one.
 *
 * This is the only "discovery" the evidence-only competitor workflow performs:
 * it never leaves the prospect's site, never fetches, never searches, never
 * infers a name. A reference is a candidate SEED, not a competitor — the
 * AIS-005 identity gate (directories/social/marketplaces/suppliers) and the
 * human-review gate decide what is real. Deterministic given the envelope.
 * ========================================================================== */

import { normalizeDomain } from "../competitor-intelligence/candidate.js";

/** A per-page record as stored in the `discovery_manifest` envelope (C3 shape). */
interface ManifestPage {
  targetId?: unknown;
  requestedUrl?: unknown;
  finalUrl?: unknown;
  outcome?: unknown;
  kind?: unknown;
  extract?: {
    externalLinks?: unknown;
    socialLinks?: unknown;
  } | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strList = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");

/** One outbound reference target, aggregated across the pages that cite it. */
export interface CompetitorReference {
  /** Normalized domain (lowercased, scheme/www stripped) — the dedupe key. */
  normalizedDomain: string;
  /** The raw URLs observed (bounded), preserved for citation. */
  urls: string[];
  /** Source page URLs (the prospect's OWN pages) that carried the reference. */
  sourcePageUrls: string[];
  /** How the reference was observed: an ordinary external link, or a social link. */
  kinds: Array<"external" | "social">;
  /** Number of distinct source pages that reference this domain. */
  pageCount: number;
}

/** A conservative cap so a pathological page cannot flood discovery. */
const MAX_REFERENCES = 200;
const MAX_URLS_PER_REF = 10;

/**
 * Extract outbound competitor-candidate references from a discovery manifest
 * envelope. Pure. Groups external + social links by normalized domain and
 * records which of the prospect's pages referenced each. Order is deterministic
 * (domain-sorted); nothing is fetched or inferred.
 */
export function extractCompetitorReferences(manifestEnvelope: Record<string, unknown>): CompetitorReference[] {
  const pages = list(manifestEnvelope["pages"]) as ManifestPage[];
  // domain → aggregation buckets (Sets keep it deterministic + delimited)
  const byDomain = new Map<
    string,
    { urls: Set<string>; sourcePages: Set<string>; kinds: Set<"external" | "social"> }
  >();

  for (const page of pages) {
    if (str(page.outcome) !== "ok") continue;
    const sourceUrl = str(page.finalUrl) || str(page.requestedUrl);
    if (sourceUrl === "") continue;
    const ex = page.extract ?? {};

    const add = (rawUrl: string, kind: "external" | "social"): void => {
      const domain = normalizeDomain(rawUrl);
      if (domain === "") return;
      const bucket = byDomain.get(domain) ?? { urls: new Set<string>(), sourcePages: new Set<string>(), kinds: new Set<"external" | "social">() };
      if (bucket.urls.size < MAX_URLS_PER_REF) bucket.urls.add(rawUrl);
      bucket.sourcePages.add(sourceUrl);
      bucket.kinds.add(kind);
      byDomain.set(domain, bucket);
    };

    for (const url of strList(ex.externalLinks)) add(url, "external");
    for (const url of strList(ex.socialLinks)) add(url, "social");
  }

  return [...byDomain.entries()]
    .map(([normalizedDomain, b]) => ({
      normalizedDomain,
      urls: [...b.urls].sort(),
      sourcePageUrls: [...b.sourcePages].sort(),
      kinds: [...b.kinds].sort(),
      pageCount: b.sourcePages.size,
    }))
    .sort((a, b) => (a.normalizedDomain < b.normalizedDomain ? -1 : a.normalizedDomain > b.normalizedDomain ? 1 : 0))
    .slice(0, MAX_REFERENCES);
}
