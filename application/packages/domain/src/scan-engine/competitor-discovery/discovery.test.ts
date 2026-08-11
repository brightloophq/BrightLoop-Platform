/* =============================================================================
 * Competitor Discovery Producer tests (Post-scan commercial workflow).
 *
 * Non-negotiables (Phase 10 · competitors):
 *   verified references → competitor artifact · directories/social/marketplaces
 *   are EXCLUDED, never asserted · no references + nothing supplied →
 *   insufficient_evidence (UNAVAILABLE), never fabricated · every asserted
 *   competitor traces to KNOWN evidence · admin-supplied competitors carry a
 *   manual_input evidence record · deterministic (identical checksum on replay).
 *
 * Pure: no clock beyond `now`, no network, no provider, no randomness.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { type EngineEvidenceItem } from "@brightloop/schema";
import { extractCompetitorReferences } from "./refs.js";
import { runCompetitorDiscovery } from "./discovery.js";

const NOW = "2026-08-09T12:00:00.000Z";
const SCAN = "scan_cd";
const PROSPECT = "acme.test";

const SERVICES_URL = "https://acme.test/services";
const HOME_URL = "https://acme.test/";

/** A crawled page as stored in the discovery_manifest envelope. */
function page(url: string, links: { external?: string[]; social?: string[] }, outcome = "ok"): Record<string, unknown> {
  return {
    targetId: url,
    requestedUrl: url,
    finalUrl: url,
    outcome,
    kind: url === HOME_URL ? "homepage" : "services",
    extract: { externalLinks: links.external ?? [], socialLinks: links.social ?? [] },
  };
}

function manifest(pages: Array<Record<string, unknown>>): Record<string, unknown> {
  return { pages, observability: { fetched: pages.length, planned: pages.length } };
}

/** A persisted `pages` evidence item whose origin matches a crawled page URL. */
function pageEvidence(id: string, url: string): EngineEvidenceItem {
  return {
    id,
    scanId: SCAN,
    source: "pages",
    state: "observed",
    timestamp: NOW,
    freshness: { ageDays: 0, band: "fresh", score: 1 },
    reliability: 0.9,
    provenance: { origin: url, collectedAt: NOW, method: "crawl", transformed: true, transformations: ["discovery-normalize"], stage: "normalization", providerId: null },
    confidence: { value: 80, band: "high", inputs: { coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1, provenanceQuality: 1 } },
    metadata: {},
    hash: `h_${id}`,
    affectedDomains: ["digital_presence"],
    citations: [url],
    visibility: "internal",
    value: { pageFetched: true },
  };
}

const BUNDLE = [pageEvidence("ev_home", HOME_URL), pageEvidence("ev_services", SERVICES_URL)];

describe("extractCompetitorReferences", () => {
  it("groups external + social references by normalized domain with source pages", () => {
    const refs = extractCompetitorReferences(
      manifest([
        page(HOME_URL, { external: ["https://rival.com/pricing"], social: ["https://www.linkedin.com/company/acme"] }),
        page(SERVICES_URL, { external: ["https://rival.com/", "https://Rival.com/about"] }),
      ]),
    );
    const rival = refs.find((r) => r.normalizedDomain === "rival.com");
    expect(rival).toBeDefined();
    expect(rival!.pageCount).toBe(2); // referenced from both pages
    expect(rival!.sourcePageUrls).toEqual([HOME_URL, SERVICES_URL]);
    expect(refs.some((r) => r.normalizedDomain === "linkedin.com" && r.kinds.includes("social"))).toBe(true);
  });

  it("ignores non-ok pages", () => {
    const refs = extractCompetitorReferences(manifest([page(SERVICES_URL, { external: ["https://rival.com/"] }, "error")]));
    expect(refs).toEqual([]);
  });
});

describe("runCompetitorDiscovery — verified references", () => {
  it("mints competitor evidence for a validated site reference and produces an AVAILABLE snapshot", () => {
    const out = runCompetitorDiscovery({
      scanId: SCAN,
      clientId: null,
      prospectDomain: PROSPECT,
      manifestEnvelope: manifest([page(SERVICES_URL, { external: ["https://rival.com/"] })]),
      evidenceBundle: BUNDLE,
      now: NOW,
    });

    expect(out.counts.validated).toBe(1);
    expect(out.competitorEvidence).toHaveLength(1);
    expect(out.snapshot.status).toBe("available");
    expect(out.snapshot.competitors.map((c) => c.name)).toContain("rival.com");
    expect(out.snapshot.reviewRequired).toBe(true);

    // Provenance preserved: the competitor evidence cites the KNOWN page evidence id.
    const ev = out.competitorEvidence[0]!;
    expect(ev.source).toBe("competitors");
    expect(ev.state).toBe("inferred"); // rivalry is inferred, never asserted as fact
    expect((ev.value["supportingEvidenceIds"] as string[])).toContain("ev_services");
    // No invented competitive claim.
    expect(ev.value["signal"]).toBeUndefined();
    expect(ev.value["statement"]).toBeUndefined();
  });

  it("is deterministic — identical inputs yield an identical snapshot checksum", () => {
    const params = {
      scanId: SCAN,
      clientId: null,
      prospectDomain: PROSPECT,
      manifestEnvelope: manifest([page(SERVICES_URL, { external: ["https://rival.com/"] })]),
      evidenceBundle: BUNDLE,
      now: NOW,
    };
    const a = runCompetitorDiscovery(params);
    const b = runCompetitorDiscovery(params);
    expect(a.snapshot.checksum).toBe(b.snapshot.checksum);
  });
});

describe("runCompetitorDiscovery — never invents (identity gate)", () => {
  it("excludes directories, social networks, marketplaces, and the prospect itself", () => {
    const out = runCompetitorDiscovery({
      scanId: SCAN,
      clientId: null,
      prospectDomain: PROSPECT,
      manifestEnvelope: manifest([
        page(HOME_URL, {
          external: ["https://amazon.com/shop", "https://acme.test/blog"],
          social: ["https://linkedin.com/acme", "https://facebook.com/acme", "https://x.com/acme"],
        }),
      ]),
      evidenceBundle: BUNDLE,
      now: NOW,
    });

    // None of the blocklisted / self domains become asserted competitors.
    const names = out.snapshot.competitors.map((c) => c.name);
    expect(names).not.toContain("amazon.com");
    expect(names).not.toContain("linkedin.com");
    expect(names).not.toContain("facebook.com");
    expect(names).not.toContain("acme.test");
    expect(out.counts.validated).toBe(0);
    // The identity gate recorded them as rejected/excluded, not silently dropped.
    expect(out.counts.rejectedOrExcluded).toBeGreaterThan(0);
    expect(out.competitorEvidence).toHaveLength(0);
  });

  it("no references and nothing supplied → UNAVAILABLE / insufficient evidence (a completed outcome)", () => {
    const out = runCompetitorDiscovery({
      scanId: SCAN,
      clientId: null,
      prospectDomain: PROSPECT,
      manifestEnvelope: manifest([page(HOME_URL, { external: [], social: [] })]),
      evidenceBundle: BUNDLE,
      now: NOW,
    });
    expect(out.counts.discovered).toBe(0);
    expect(out.snapshot.status).toBe("unavailable");
    expect(out.snapshot.reason).toBe("no_competitor_evidence");
    expect(out.competitorEvidence).toHaveLength(0);
  });
});

describe("runCompetitorDiscovery — admin-supplied", () => {
  it("records a manual_input evidence item and asserts the supplied competitor", () => {
    const out = runCompetitorDiscovery({
      scanId: SCAN,
      clientId: null,
      prospectDomain: PROSPECT,
      manifestEnvelope: manifest([page(HOME_URL, { external: [] })]),
      manualCompetitorDomains: ["https://competitor-two.com"],
      evidenceBundle: BUNDLE,
      now: NOW,
    });

    expect(out.manualEvidence).toHaveLength(1);
    expect(out.manualEvidence[0]!.source).toBe("manual_input");
    expect(out.counts.validated).toBe(1);
    expect(out.snapshot.status).toBe("available");
    expect(out.snapshot.competitors.map((c) => c.name)).toContain("competitor-two.com");

    // The competitor evidence cites the manual_input evidence id (its provenance).
    const supporting = out.competitorEvidence[0]!.value["supportingEvidenceIds"] as string[];
    expect(supporting).toContain(out.manualEvidence[0]!.id);
  });

  it("excludes an admin-supplied domain that is itself a directory", () => {
    const out = runCompetitorDiscovery({
      scanId: SCAN,
      clientId: null,
      prospectDomain: PROSPECT,
      manualCompetitorDomains: ["yelp.com"],
      evidenceBundle: BUNDLE,
      now: NOW,
    });
    expect(out.counts.validated).toBe(0);
    expect(out.snapshot.status).toBe("unavailable");
  });
});
