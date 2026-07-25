/* =============================================================================
 * Evidence normalization bridge (Phase C · Sprint C6) — PURE.
 *
 * The impedance match between the C3 crawler and the Phase-A intelligence
 * engines. The crawler produces a `discovery_manifest` whose pages carry a
 * sanitized `extract` (title, headings, links, forms, SEO + accessibility
 * signals). The engines consume `EngineEvidenceItem`s whose `value` payload
 * carries the NAMED SIGNALS the Prospect-Intelligence registry reads.
 *
 * This module DERIVES observed signals from crawled pages and nothing more:
 *   - a signal is set ONLY when the crawl actually observed it;
 *   - an unobserved signal key is simply ABSENT, so the downstream registry
 *     excludes it (never a fabricated zero);
 *   - a page that failed to fetch contributes an `unavailable` item, never a
 *     signal.
 *
 * It invents no value and re-implements no scoring — it calls the existing
 * `normalizeEvidence` constructor, so freshness, reliability, provenance and
 * confidence come from the Evidence Engine, not from here. Pure given `now`.
 * ========================================================================== */

import { normalizeEvidence } from "@brightloop/domain";
import type { EngineEvidenceItem, IndexDimension } from "@brightloop/schema";

/** A per-page record as stored in the `discovery_manifest` envelope (C3 shape). */
interface ManifestPage {
  targetId?: unknown;
  requestedUrl?: unknown;
  finalUrl?: unknown;
  status?: unknown;
  kind?: unknown;
  outcome?: unknown;
  reason?: unknown;
  bytes?: unknown;
  lastModified?: unknown;
  collectedAt?: unknown;
  extract?: {
    title?: unknown;
    metaDescription?: unknown;
    canonicalUrl?: unknown;
    language?: unknown;
    headings?: unknown;
    visibleText?: unknown;
    internalLinks?: unknown;
    externalLinks?: unknown;
    forms?: unknown;
    emails?: unknown;
    phones?: unknown;
    socialLinks?: unknown;
    jsonLdTypes?: unknown;
    seo?: { hasTitle?: unknown; hasMetaDescription?: unknown; hasCanonical?: unknown; hasH1?: unknown; h1Count?: unknown; wordCount?: unknown };
    accessibility?: { imageCount?: unknown; imagesWithAlt?: unknown; hasLangAttribute?: unknown; hasViewportMeta?: unknown };
  } | null;
}

/* ---- small, total coercions ------------------------------------------------- */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const bool = (v: unknown): boolean => v === true;
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strList = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string" && x !== "");

/** A conservative per-page payload budget (bytes) for the performance signal. */
const PAYLOAD_BUDGET = 2_000_000;

/** Which Index dimensions a website/pages evidence item informs. */
const WEBSITE_DIMENSIONS: IndexDimension[] = ["digital_presence", "marketing", "brand"];
const PAGE_DIMENSIONS: IndexDimension[] = ["digital_presence"];

function okPages(pages: ManifestPage[]): ManifestPage[] {
  return pages.filter((p) => str(p.outcome) === "ok");
}

/** Signals derived from ONE page's extract (page-level view). */
function pageSignals(page: ManifestPage): Record<string, unknown> {
  const ex = page.extract ?? {};
  const seo = ex.seo ?? {};
  const a11y = ex.accessibility ?? {};
  const value: Record<string, unknown> = {
    pageFetched: true,
    hasTitle: bool(seo.hasTitle) || str(ex.title) !== "",
    hasMetaDescription: bool(seo.hasMetaDescription),
    hasCanonical: bool(seo.hasCanonical),
    hasSingleH1: int(seo.h1Count) === 1,
    wordCount: int(seo.wordCount),
    headingCount: strList(ex.headings).length,
    jsonLdTypeCount: strList(ex.jsonLdTypes).length,
    hasOrganizationSchema: strList(ex.jsonLdTypes).some((t) => t.toLowerCase() === "organization"),
    socialLinkCount: strList(ex.socialLinks).length,
    formCount: list(ex.forms).length,
    imageCount: int(a11y.imageCount),
    imagesWithAlt: int(a11y.imagesWithAlt),
    hasLangAttribute: bool(a11y.hasLangAttribute),
    hasViewportMeta: bool(a11y.hasViewportMeta),
    internalLinkCount: strList(ex.internalLinks).length,
    hasContactDetails: strList(ex.emails).length > 0 || strList(ex.phones).length > 0,
    isHttps: str(page.finalUrl).startsWith("https://") || str(page.requestedUrl).startsWith("https://"),
    // performance: transferred weight against a conservative budget
    payloadBudget: PAYLOAD_BUDGET,
    payloadBudgetRemaining: Math.max(0, PAYLOAD_BUDGET - int(page.bytes)),
  };
  // Text fields for industry classification — only when present.
  const title = str(ex.title);
  const meta = str(ex.metaDescription);
  const text = str(ex.visibleText);
  const headingText = strList(ex.headings).join(" ");
  if (title !== "") value["siteTitle"] = title;
  if (meta !== "") value["metaDescription"] = meta;
  if (text !== "") value["visibleText"] = text;
  if (headingText !== "") value["headingText"] = headingText;
  return value;
}

/** Site-wide signals aggregated across every fetched page. */
function siteSignals(pages: ManifestPage[], summary: { pagesFetched: number; pagesPlanned: number }): Record<string, unknown> {
  const ok = okPages(pages);
  const kinds = new Set(ok.map((p) => str(p.kind)));
  const social = new Set<string>();
  let contact = false;
  let orgSchema = false;
  let freshness = false;
  let policyPages = 0;
  const homepage = ok.find((p) => str(p.kind) === "homepage") ?? ok[0];

  for (const p of ok) {
    const ex = p.extract ?? {};
    for (const s of strList(ex.socialLinks)) social.add(s);
    if (strList(ex.emails).length > 0 || strList(ex.phones).length > 0) contact = true;
    if (strList(ex.jsonLdTypes).some((t) => t.toLowerCase() === "organization")) orgSchema = true;
    if (str(p.lastModified) !== "") freshness = true;
    if (str(p.kind) === "legal") policyPages += 1;
  }

  const homeEx = homepage?.extract ?? {};
  const homeA11y = homeEx.accessibility ?? {};
  const homeSeo = homeEx.seo ?? {};

  const value: Record<string, unknown> = {
    pageFetched: ok.length > 0,
    pagesFetched: summary.pagesFetched,
    pagesPlanned: summary.pagesPlanned,
    hasTitle: bool(homeSeo.hasTitle) || str(homeEx.title) !== "",
    hasViewportMeta: bool(homeA11y.hasViewportMeta),
    hasLangAttribute: bool(homeA11y.hasLangAttribute),
    isHttps: str(homepage?.finalUrl).startsWith("https://"),
    hasContactDetails: contact,
    hasContactPage: kinds.has("contact"),
    hasServicesPage: kinds.has("services"),
    hasPricingPage: kinds.has("pricing"),
    hasAboutPage: kinds.has("about"),
    hasBlog: kinds.has("blog"),
    policyPageCount: policyPages,
    socialLinkCount: social.size,
    hasOrganizationSchema: orgSchema,
    hasFreshnessSignal: freshness,
    internalLinkCount: strList(homeEx.internalLinks).length,
  };

  // Business-name + url signals for the profile — observed only.
  const title = str(homeEx.title);
  if (title !== "") value["businessName"] = title.split(/[|\-–—·]/)[0]!.trim() || title;
  if (title !== "") value["siteTitle"] = title;
  const url = str(homepage?.finalUrl) || str(homepage?.requestedUrl);
  if (url !== "") value["siteUrl"] = url;
  const canonical = str(homeEx.canonicalUrl);
  if (canonical !== "") value["canonicalUrl"] = canonical;
  const meta = str(homeEx.metaDescription);
  if (meta !== "") value["metaDescription"] = meta;
  const text = str(homeEx.visibleText);
  if (text !== "") value["visibleText"] = text;
  return value;
}

export interface BridgeResult {
  items: EngineEvidenceItem[];
  /** Pages that could not be fetched — represented as `unavailable`, never scored. */
  unavailableCount: number;
  observedCount: number;
}

/**
 * Normalize a `discovery_manifest` envelope into engine evidence.
 *
 * Produces one aggregate `website` item plus one `pages` item per successfully
 * fetched page, and one `unavailable` `pages` item per failed page (carrying no
 * signal). Deterministic given `now` and a deterministic `idFor`.
 */
export function normalizeDiscoveryToEvidence(
  manifestEnvelope: Record<string, unknown>,
  scanId: string,
  now: string,
  idFor: (suffix: string) => string,
): BridgeResult {
  const pages = list(manifestEnvelope["pages"]) as ManifestPage[];
  const observability = (manifestEnvelope["observability"] ?? {}) as Record<string, unknown>;
  const summary = { pagesFetched: int(observability["fetched"]), pagesPlanned: int(observability["planned"]) };

  const ok = okPages(pages);
  const items: EngineEvidenceItem[] = [];

  // Aggregate site-level item.
  if (pages.length > 0) {
    const homepage = ok.find((p) => str(p.kind) === "homepage") ?? ok[0] ?? pages[0]!;
    items.push(
      normalizeEvidence(
        {
          id: idFor("website"),
          scanId,
          source: "website",
          state: ok.length > 0 ? "observed" : "unavailable",
          timestamp: str(homepage.collectedAt) || now,
          provenance: { origin: str(homepage.finalUrl) || str(homepage.requestedUrl), collectedAt: str(homepage.collectedAt) || now, method: "crawl", transformed: true, transformations: ["discovery-normalize"], stage: "normalization", providerId: null },
          value: siteSignals(pages, summary),
          affectedDomains: WEBSITE_DIMENSIONS,
          citations: [str(homepage.finalUrl) || str(homepage.requestedUrl)].filter((c) => c !== ""),
        },
        now,
      ),
    );
  }

  // Per-page items.
  for (const page of pages) {
    const isOk = str(page.outcome) === "ok";
    const origin = str(page.finalUrl) || str(page.requestedUrl);
    items.push(
      normalizeEvidence(
        {
          id: idFor(`page-${str(page.targetId) || String(items.length)}`),
          scanId,
          source: "pages",
          state: isOk ? "observed" : "unavailable",
          timestamp: str(page.collectedAt) || now,
          provenance: { origin, collectedAt: str(page.collectedAt) || now, method: "crawl", transformed: true, transformations: ["discovery-normalize"], stage: "normalization", providerId: null },
          value: isOk ? pageSignals(page) : {},
          affectedDomains: PAGE_DIMENSIONS,
          citations: origin === "" ? [] : [origin],
          metadata: { kind: str(page.kind), outcome: str(page.outcome), reason: str(page.reason) },
        },
        now,
      ),
    );
  }

  return {
    items,
    observedCount: items.filter((i) => i.state === "observed").length,
    unavailableCount: items.filter((i) => i.state === "unavailable").length,
  };
}
