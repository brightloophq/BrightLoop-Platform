/* =============================================================================
 * Prospect Intelligence Engine tests (Phase C · Sprint C5).
 *
 * These assert the sprint's NON-NEGOTIABLES, not merely the happy path:
 *
 *   unknown stays unknown · unavailable stays unavailable · confidence never
 *   inflates · every score is reproducible from its own calculation record ·
 *   every claim links to evidence that exists · nothing is invented ·
 *   missing factors are excluded, never zeroed · output is byte-deterministic.
 *
 * Everything is pure: no clock, no network, no provider, no randomness.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  MATURITY_CATEGORY_WEIGHTS,
  READINESS_FACTOR_WEIGHTS,
  maturityCategorySchema,
  readinessFactorSchema,
  type EngineEvidenceItem,
  type EvidenceConfidenceInputs,
} from "@brightloop/schema";
import { computeEvidenceConfidence } from "../evidence/confidence.js";
import {
  CLASSIFICATION_THRESHOLD,
  aggregateProspectConfidence,
  assembleExecutiveSummary,
  assessMaturity,
  buildRecommendationInputs,
  classifyIndustry,
  computeReadiness,
  deriveOpportunities,
  deriveProfile,
  deriveRisks,
  deriveStrengths,
  deriveWeaknesses,
  digitalMaturityBand,
  evidenceGaps,
  extractSignals,
  redistributeWeights,
  runProspectIntelligence,
  scoreCategory,
  severityForScore,
  signalsFor,
  weightCoverage,
  weightedSignalScore,
  zeroConfidence,
  SIGNAL_REGISTRY,
  UNCOVERED_CATEGORIES,
} from "./index.js";

const NOW = "2026-07-23T12:00:00.000Z";
const SCAN = "scan_c5";

/* ---- fixtures ---------------------------------------------------------------- */

const CONF: EvidenceConfidenceInputs = { coverage: 0.9, reliability: 0.9, freshness: 0.9, agreement: 1, completeness: 0.9, provenanceQuality: 0.9 };

function item(id: string, value: Record<string, unknown>, overrides: Partial<EngineEvidenceItem> = {}): EngineEvidenceItem {
  return {
    id,
    scanId: SCAN,
    source: "website",
    state: "observed",
    timestamp: NOW,
    freshness: { ageDays: 0, band: "fresh", score: 1 },
    reliability: 0.9,
    provenance: { origin: "https://acme.test/", collectedAt: NOW, method: "crawl", transformed: false, transformations: [], stage: "crawler", providerId: null },
    confidence: computeEvidenceConfidence(CONF),
    metadata: {},
    hash: `h_${id}`,
    affectedDomains: ["digital_presence"],
    citations: ["https://acme.test/"],
    visibility: "internal",
    value,
    ...overrides,
  };
}

/** A well-evidenced prospect: most signals present and healthy. */
function strongEvidence(): EngineEvidenceItem[] {
  return [
    item("ev_home", {
      pageFetched: true, hasTitle: true, pagesFetched: 5, pagesPlanned: 5, hasViewportMeta: true, hasLangAttribute: true,
      hasMetaDescription: true, hasCanonical: true, hasSingleH1: true, jsonLdTypeCount: 2,
      socialLinkCount: 3, hasOrganizationSchema: true,
      isHttps: true, hasContactDetails: true, policyPageCount: 2, securityHeadersPresent: 4, securityHeadersChecked: 4,
      imagesWithAlt: 10, imageCount: 10,
      wordCount: 900, headingCount: 8, hasBlog: true, hasFreshnessSignal: true,
      formCount: 2, hasContactPage: true,
      payloadBudgetRemaining: 800, payloadBudget: 1000,
      hasServicesPage: true, hasPricingPage: true, hasAboutPage: true, internalLinkCount: 24,
      businessName: "Acme Dental", siteUrl: "https://acme.test", location: "Kingston",
      services: ["Dental implants", "Teeth whitening"],
      trustIndicators: ["HTTPS", "Privacy policy"],
      siteTitle: "Acme Dental Clinic", visibleText: "Our dental clinic offers implants and therapy.",
    }),
  ];
}

/** A poorly-evidenced prospect: signals present but failing. */
function weakEvidence(): EngineEvidenceItem[] {
  return [
    item("ev_weak", {
      pageFetched: true, hasTitle: false, pagesFetched: 1, pagesPlanned: 5, hasViewportMeta: false, hasLangAttribute: false,
      hasMetaDescription: false, hasCanonical: false, hasSingleH1: false, jsonLdTypeCount: 0,
      socialLinkCount: 0, hasOrganizationSchema: false,
      isHttps: false, hasContactDetails: false, policyPageCount: 0, securityHeadersPresent: 0, securityHeadersChecked: 4,
      imagesWithAlt: 0, imageCount: 10,
      wordCount: 40, headingCount: 0, hasBlog: false, hasFreshnessSignal: false,
      formCount: 0, hasContactPage: false,
      payloadBudgetRemaining: 50, payloadBudget: 1000,
      hasServicesPage: false, hasPricingPage: false, hasAboutPage: false, internalLinkCount: 1,
    }),
  ];
}

const ids = (prefix: string, index: number) => `${prefix}_${String(index).padStart(3, "0")}`;

/* =============================================================================
 * 1 · unknown stays unknown
 * ========================================================================== */
describe("unknown stays unknown", () => {
  it("leaves every unevidenced profile field null and names it", () => {
    const maturity = assessMaturity({ scanId: SCAN, items: [], now: NOW });
    const profile = deriveProfile({ scanId: SCAN, items: [], maturity, now: NOW });

    expect(profile.identity.value).toBeNull();
    expect(profile.identity.basis).toBe("unknown");
    expect(profile.websiteUrl.value).toBeNull();
    expect(profile.size.value).toBeNull();
    expect(profile.geography.value).toBeNull();
    expect(profile.primaryServices).toEqual([]);
    expect(profile.unknownFields).toEqual(expect.arrayContaining(["identity", "websiteUrl", "size", "geography", "primaryServices"]));
    expect(profile.limitations.join(" ")).toMatch(/not evidenced/i);
  });

  it("never invents a business size — it is not observable from a crawl", () => {
    const items = strongEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const profile = deriveProfile({ scanId: SCAN, items, maturity, now: NOW });
    expect(profile.size.value).toBeNull();
    expect(profile.limitations.join(" ")).toMatch(/size is not observable/i);
  });

  it("reports no industry rather than guessing when no term matches", () => {
    const items = [item("ev_blank", { pageFetched: true, siteTitle: "Welcome", visibleText: "Hello there" })];
    const result = classifyIndustry({ scanId: SCAN, items });
    expect(result.category).toBeNull();
    expect(result.confidence.value).toBe(0);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("does not classify when the top candidate is below the threshold", () => {
    // One matched term out of eight is ~0.125, well under the threshold.
    const items = [item("ev_thin", { visibleText: "we offer consulting" })];
    const result = classifyIndustry({ scanId: SCAN, items });
    expect(result.candidates[0]!.score).toBeLessThan(CLASSIFICATION_THRESHOLD);
    expect(result.category).toBeNull();
    expect(result.limitations.join(" ")).toMatch(/below the .* threshold/i);
  });
});

/* =============================================================================
 * 2 · missing evidence stays UNAVAILABLE — never zero
 * ========================================================================== */
describe("missing evidence stays unavailable", () => {
  it("reports a null score, not zero, for a category with no signal", () => {
    const category = scoreCategory("analytics", strongEvidence());
    expect(category.score).toBeNull();
    expect(category.score).not.toBe(0);
    expect(category.available).toBe(false);
    expect(category.weight).toBe(0);
    expect(category.limitations[0]).toMatch(/cannot be observed|not observable|no signal/i);
  });

  it("declares which categories a public crawl cannot observe", () => {
    expect([...UNCOVERED_CATEGORIES].sort()).toEqual(["analytics", "automation", "operations"]);
  });

  it("excludes unassessable categories from the composite instead of zeroing them", () => {
    const maturity = assessMaturity({ scanId: SCAN, items: strongEvidence(), now: NOW });
    const unavailable = maturity.categories.filter((c) => !c.available);
    expect(unavailable.length).toBeGreaterThan(0);
    for (const c of unavailable) {
      expect(c.score).toBeNull();
      expect(c.weight).toBe(0);
    }
    // A strong prospect still scores high despite unobservable categories.
    expect(maturity.overall).toBeGreaterThan(80);
  });

  it("reports no composite at all when nothing could be scored", () => {
    const maturity = assessMaturity({ scanId: SCAN, items: [], now: NOW });
    expect(maturity.overall).toBeNull();
    expect(maturity.coverage).toBe(0);
    expect(maturity.limitations.join(" ")).toMatch(/no category could be scored/i);
  });

  it("skips unavailable-state evidence entirely", () => {
    const unavailable = strongEvidence().map((i) => ({ ...i, state: "unavailable" as const }));
    const maturity = assessMaturity({ scanId: SCAN, items: unavailable, now: NOW });
    expect(maturity.overall).toBeNull();
    expect(maturity.categories.every((c) => !c.available)).toBe(true);
  });

  it("separates evidence gaps from weaknesses", () => {
    const maturity = assessMaturity({ scanId: SCAN, items: weakEvidence(), now: NOW });
    const gaps = evidenceGaps(maturity);
    const weaknesses = deriveWeaknesses({ items: weakEvidence(), maturity, idFor: (i) => ids("w", i) });
    const gapCategories = gaps.map((g) => g.category);
    // No unassessed category is ever reported as a weakness.
    for (const w of weaknesses) expect(gapCategories).not.toContain(w.category);
  });
});

/* =============================================================================
 * 3 · scoring — reproducible, no hidden math
 * ========================================================================== */
describe("scoring", () => {
  it("reproduces the weighted formula by hand", () => {
    const resolved = [
      { key: "a", category: "website" as const, weight: 3, value: 1, evidenceIds: ["e1"] },
      { key: "b", category: "website" as const, weight: 1, value: 0, evidenceIds: ["e1"] },
    ];
    const { score, calculation } = weightedSignalScore(resolved, []);
    // (3×1 + 1×0) / 4 = 0.75 → 75
    expect(score).toBe(75);
    expect(calculation.inputs["weightedSum"]).toBe(3);
    expect(calculation.inputs["weightSum"]).toBe(4);
    expect(Math.round((100 * calculation.inputs["weightedSum"]!) / calculation.inputs["weightSum"]!)).toBe(score);
  });

  it("excludes missing signals from BOTH sums", () => {
    const resolved = [{ key: "a", category: "seo" as const, weight: 2, value: 1, evidenceIds: ["e1"] }];
    const { score, calculation } = weightedSignalScore(resolved, ["b", "c"]);
    expect(score).toBe(100); // missing signals did not drag it to 33
    expect(calculation.missingSignals).toEqual(["b", "c"]);
    expect(calculation.signalCount).toBe(1);
  });

  it("returns null (not zero) when nothing resolved", () => {
    const { score, calculation } = weightedSignalScore([], ["a"]);
    expect(score).toBeNull();
    expect(calculation.formula).toMatch(/unassessable/);
  });

  it("publishes every input used in every category calculation", () => {
    const maturity = assessMaturity({ scanId: SCAN, items: strongEvidence(), now: NOW });
    for (const category of maturity.categories.filter((c) => c.available)) {
      expect(category.calculation.formula).toContain("Σ");
      expect(Object.keys(category.calculation.inputs).length).toBeGreaterThan(0);
      expect(category.calculation.signalCount).toBeGreaterThan(0);
    }
  });

  it("keeps every registry signal uniquely named and positively weighted", () => {
    const keys = SIGNAL_REGISTRY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of SIGNAL_REGISTRY) expect(spec.weight).toBeGreaterThan(0);
  });

  it("averages a signal across items and keeps every contributing evidence id", () => {
    const items = [item("ev_a", { hasTitle: true }), item("ev_b", { hasTitle: false })];
    const { resolved } = extractSignals(items, signalsFor("website").filter((s) => s.key === "website.has_title"));
    expect(resolved[0]!.value).toBe(0.5);
    expect(resolved[0]!.evidenceIds).toEqual(["ev_a", "ev_b"]);
  });
});

/* =============================================================================
 * 4 · weight redistribution
 * ========================================================================== */
describe("weight redistribution", () => {
  it("redistributes to sum to 100 across available keys", () => {
    const available = ["website", "seo"] as const;
    const applied = redistributeWeights(MATURITY_CATEGORY_WEIGHTS, [...available]);
    const sum = Object.values(applied).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
    expect(applied.analytics).toBe(0);
    // Proportions are preserved: website(12) : seo(11).
    expect(applied.website / applied.seo).toBeCloseTo(12 / 11, 6);
  });

  it("returns all zero when nothing is available", () => {
    const applied = redistributeWeights(MATURITY_CATEGORY_WEIGHTS, []);
    expect(Object.values(applied).every((v) => v === 0)).toBe(true);
  });

  it("computes coverage as the assessable share of base weight", () => {
    expect(weightCoverage(MATURITY_CATEGORY_WEIGHTS, [...maturityCategorySchema.options])).toBe(1);
    expect(weightCoverage(MATURITY_CATEGORY_WEIGHTS, [])).toBe(0);
    const total = Object.values(MATURITY_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(weightCoverage(MATURITY_CATEGORY_WEIGHTS, ["website"])).toBeCloseTo(MATURITY_CATEGORY_WEIGHTS.website / total, 6);
  });

  it("keeps applied readiness weights summing to 100 with factors excluded", () => {
    const readiness = computeReadiness({ scanId: SCAN, items: strongEvidence(), maturity: assessMaturity({ scanId: SCAN, items: strongEvidence(), now: NOW }), now: NOW });
    const applied = readiness.factors.reduce((a, f) => a + f.weight, 0);
    expect(applied).toBeCloseTo(100, 4);
    for (const excluded of readiness.excludedFactors) {
      expect(readiness.factors.find((f) => f.factor === excluded)!.weight).toBe(0);
    }
  });

  it("documents readiness weights that sum to 100", () => {
    expect(Object.values(READINESS_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(MATURITY_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

/* =============================================================================
 * 5 · confidence — aggregation and the non-inflation rule
 * ========================================================================== */
describe("confidence", () => {
  it("is zero when there is no usable evidence", () => {
    const c = aggregateProspectConfidence({ items: [], coverage: 1, expected: 10, resolved: 10, conflicts: 0 });
    expect(c.value).toBe(0);
    expect(c.band).toBe("very_low");
    expect(zeroConfidence().value).toBe(0);
  });

  it("NEVER exceeds the confidence of the evidence behind it", () => {
    // Sweep coverage/completeness/conflicts; the cap must hold in every case.
    const items = strongEvidence();
    const evidenceCeiling = Math.max(...items.map((i) => i.confidence.value));
    for (const coverage of [0, 0.25, 0.5, 0.75, 1]) {
      for (const resolved of [0, 5, 10]) {
        for (const conflicts of [0, 1, 5]) {
          const c = aggregateProspectConfidence({ items, coverage, expected: 10, resolved, conflicts });
          expect(c.value).toBeLessThanOrEqual(evidenceCeiling);
        }
      }
    }
  });

  it("decreases as coverage falls", () => {
    const items = strongEvidence();
    const high = aggregateProspectConfidence({ items, coverage: 1, expected: 10, resolved: 10, conflicts: 0 });
    const low = aggregateProspectConfidence({ items, coverage: 0.2, expected: 10, resolved: 10, conflicts: 0 });
    expect(low.value).toBeLessThan(high.value);
  });

  it("decreases as conflicts rise", () => {
    const items = [...strongEvidence(), item("ev_2", { hasTitle: true })];
    const clean = aggregateProspectConfidence({ items, coverage: 1, expected: 10, resolved: 10, conflicts: 0 });
    const conflicted = aggregateProspectConfidence({ items, coverage: 1, expected: 10, resolved: 10, conflicts: 2 });
    expect(conflicted.value).toBeLessThan(clean.value);
  });

  it("decreases as more expected factors go missing", () => {
    const items = strongEvidence();
    const complete = aggregateProspectConfidence({ items, coverage: 1, expected: 10, resolved: 10, conflicts: 0 });
    const partial = aggregateProspectConfidence({ items, coverage: 1, expected: 10, resolved: 2, conflicts: 0 });
    expect(partial.value).toBeLessThan(complete.value);
  });

  it("rewards source diversity but never above the evidence ceiling", () => {
    const single = strongEvidence();
    const diverse = [...strongEvidence(), item("ev_seo", { hasTitle: true }, { source: "seo", id: "ev_seo" }), item("ev_sec", { isHttps: true }, { source: "security", id: "ev_sec" })];
    const a = aggregateProspectConfidence({ items: single, coverage: 1, expected: 4, resolved: 4, conflicts: 0 });
    const b = aggregateProspectConfidence({ items: diverse, coverage: 1, expected: 4, resolved: 4, conflicts: 0 });
    expect(b.value).toBeGreaterThanOrEqual(a.value);
    expect(b.value).toBeLessThanOrEqual(Math.max(...diverse.map((i) => i.confidence.value)));
  });
});

/* =============================================================================
 * 6 · findings, opportunities and risks
 * ========================================================================== */
describe("findings", () => {
  it("derives strengths only from high observed scores with evidence", () => {
    const items = strongEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const strengths = deriveStrengths({ items, maturity, idFor: (i) => ids("s", i) });
    expect(strengths.length).toBeGreaterThan(0);
    for (const s of strengths) {
      expect(s.kind).toBe("strength");
      expect(s.observedScore).toBeGreaterThanOrEqual(70);
      expect(s.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("derives no strengths from weak evidence", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    expect(deriveStrengths({ items, maturity, idFor: (i) => ids("s", i) })).toEqual([]);
  });

  it("derives weaknesses only from low OBSERVED scores", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const weaknesses = deriveWeaknesses({ items, maturity, idFor: (i) => ids("w", i) });
    expect(weaknesses.length).toBeGreaterThan(0);
    for (const w of weaknesses) {
      expect(w.observedScore).toBeLessThanOrEqual(50);
      expect(w.evidenceIds.length).toBeGreaterThan(0);
    }
  });
});

describe("opportunities", () => {
  it("raises none for an unassessed category", () => {
    const items = strongEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const opportunities = deriveOpportunities({ items, maturity, idFor: (i) => ids("o", i) });
    const unassessed = maturity.categories.filter((c) => !c.available).map((c) => c.category);
    for (const o of opportunities) expect(unassessed).not.toContain(o.category);
  });

  it("computes impact from the observed gap and the category weight", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const opportunities = deriveOpportunities({ items, maturity, idFor: (i) => ids("o", i) });
    expect(opportunities.length).toBeGreaterThan(0);
    const maxWeight = Math.max(...Object.values(MATURITY_CATEGORY_WEIGHTS));
    for (const o of opportunities) {
      const { observedScore, gap, categoryWeight } = o.calculation.inputs;
      expect(gap).toBe(100 - observedScore!);
      expect(o.businessImpact).toBe(Math.round((gap! * categoryWeight!) / maxWeight));
      expect(o.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("carries no price, timeline or promise field", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const [opportunity] = deriveOpportunities({ items, maturity, idFor: (i) => ids("o", i) });
    const keys = Object.keys(opportunity!);
    for (const banned of ["price", "cost", "investment", "timeline", "duration", "deadline", "guarantee"]) {
      expect(keys).not.toContain(banned);
    }
    expect(JSON.stringify(opportunity)).not.toMatch(/\$\d|guarantee/i);
  });

  it("orders opportunities by impact, deterministically", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const opportunities = deriveOpportunities({ items, maturity, idFor: (i) => ids("o", i) });
    for (let i = 1; i < opportunities.length; i++) {
      expect(opportunities[i - 1]!.businessImpact).toBeGreaterThanOrEqual(opportunities[i]!.businessImpact);
    }
  });
});

describe("risks", () => {
  it("raises risks only from observed low scores", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const risks = deriveRisks({ items, maturity, idFor: (i) => ids("r", i) });
    expect(risks.length).toBeGreaterThan(0);
    for (const r of risks) expect(r.evidenceIds.length).toBeGreaterThan(0);
  });

  it("raises no risk from strong evidence", () => {
    const items = strongEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    expect(deriveRisks({ items, maturity, idFor: (i) => ids("r", i) })).toEqual([]);
  });

  it("maps severity monotonically from the observed score", () => {
    expect(severityForScore(10).severity).toBe("critical");
    expect(severityForScore(30).severity).toBe("high");
    expect(severityForScore(40).severity).toBe("moderate");
    expect(severityForScore(55).severity).toBe("low");
    expect(severityForScore(10).severityScore).toBeGreaterThan(severityForScore(55).severityScore);
  });

  it("adds a compliance risk for severe accessibility or trust findings, with a caveat", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const risks = deriveRisks({ items, maturity, idFor: (i) => ids("r", i) });
    const compliance = risks.filter((r) => r.category === "compliance");
    expect(compliance.length).toBeGreaterThan(0);
    expect(compliance[0]!.limitations.join(" ")).toMatch(/counsel/i);
  });
});

/* =============================================================================
 * 7 · executive summary — structured and traceable
 * ========================================================================== */
describe("executive summary", () => {
  const build = (items: EngineEvidenceItem[]) => {
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const industry = classifyIndustry({ scanId: SCAN, items });
    const profile = deriveProfile({ scanId: SCAN, items, maturity, industryCategory: industry.category, industryEvidenceIds: industry.evidenceIds, now: NOW });
    const strengths = deriveStrengths({ items, maturity, idFor: (i) => ids("s", i) });
    const weaknesses = deriveWeaknesses({ items, maturity, idFor: (i) => ids("w", i) });
    const risks = deriveRisks({ items, maturity, idFor: (i) => ids("r", i) });
    const opportunities = deriveOpportunities({ items, maturity, idFor: (i) => ids("o", i) });
    const readiness = computeReadiness({ scanId: SCAN, items, maturity, now: NOW });
    const confidence = aggregateProspectConfidence({ items, coverage: maturity.coverage, expected: 30, resolved: 20, conflicts: 0 });
    return assembleExecutiveSummary({ scanId: SCAN, profile, industry, maturity, strengths, weaknesses, risks, opportunities, readiness, confidence, now: NOW });
  };

  it("always produces the seven required sections", () => {
    const summary = build(strongEvidence());
    expect(summary.sections.map((s) => s.key)).toEqual([
      "business_overview",
      "current_position",
      "key_findings",
      "critical_risks",
      "major_opportunities",
      "transformation_readiness",
      "recommended_next_steps",
    ]);
  });

  it("names a validated template on every statement", () => {
    const summary = build(strongEvidence());
    const statements = summary.sections.flatMap((s) => s.statements);
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s.template).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it("explains an empty section instead of padding it", () => {
    const summary = build(strongEvidence());
    const risks = summary.sections.find((s) => s.key === "critical_risks")!;
    expect(risks.statements).toEqual([]);
    expect(risks.unavailableReason).toMatch(/not a clean bill of health/i);
  });

  it("always requires human review", () => {
    const summary = build(strongEvidence());
    expect(summary.reviewRequired).toBe(true);
    const next = summary.sections.find((s) => s.key === "recommended_next_steps")!;
    expect(next.statements.some((s) => s.template === "next.human_review")).toBe(true);
  });

  it("states the unknowns rather than hiding them", () => {
    const summary = build([item("ev_min", { pageFetched: true, hasTitle: true })]);
    const overview = summary.sections.find((s) => s.key === "business_overview")!;
    expect(overview.statements.some((s) => s.template === "overview.industry_unknown" || s.template === "overview.unknowns")).toBe(true);
  });

  it("reports coverage explicitly in the current position", () => {
    const summary = build(strongEvidence());
    const position = summary.sections.find((s) => s.key === "current_position")!;
    expect(position.statements.some((s) => s.template === "position.coverage")).toBe(true);
  });

  it("flags low confidence as a limitation", () => {
    // Drive the rule directly with a known-low composite rather than hoping the
    // pipeline lands under the threshold.
    const items: EngineEvidenceItem[] = [];
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const industry = classifyIndustry({ scanId: SCAN, items });
    const profile = deriveProfile({ scanId: SCAN, items, maturity, now: NOW });
    const readiness = computeReadiness({ scanId: SCAN, items, maturity, now: NOW });
    const low = computeEvidenceConfidence({ coverage: 0.1, reliability: 0.2, freshness: 0.2, agreement: 0.5, completeness: 0.1, provenanceQuality: 0.2 });
    expect(low.value).toBeLessThan(40);

    const summary = assembleExecutiveSummary({
      scanId: SCAN, profile, industry, maturity, strengths: [], weaknesses: [], risks: [], opportunities: [], readiness, confidence: low, now: NOW,
    });
    expect(summary.limitations.some((l) => /confidence is \d+\/100/.test(l))).toBe(true);
  });
});

/* =============================================================================
 * 8 · evidence traceability + no fabrication
 * ========================================================================== */
describe("evidence traceability", () => {
  const items = strongEvidence();
  const result = runProspectIntelligence({ scanId: SCAN, evidence: items, idFor: ids, now: NOW });
  const known = new Set(items.map((i) => i.id));

  it("references only evidence ids that exist in the input", () => {
    const referenced = [
      ...result.strengths.flatMap((s) => s.evidenceIds),
      ...result.weaknesses.flatMap((w) => w.evidenceIds),
      ...result.opportunities.flatMap((o) => o.evidenceIds),
      ...result.risks.flatMap((r) => r.evidenceIds),
      ...result.recommendationInputs.flatMap((r) => r.evidenceIds),
      ...result.maturity.categories.flatMap((c) => c.evidenceIds),
      ...result.executiveSummary.sections.flatMap((s) => s.statements.flatMap((st) => st.evidenceIds)),
    ];
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) expect(known.has(id)).toBe(true);
  });

  it("gives every claim-bearing record at least one evidence id", () => {
    for (const record of [...result.strengths, ...result.weaknesses, ...result.opportunities, ...result.risks, ...result.recommendationInputs]) {
      expect(record.evidenceIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("invents no service or industry that the evidence never mentioned", () => {
    const text = JSON.stringify(result.profile);
    for (const service of result.profile.primaryServices) {
      expect(JSON.stringify(items)).toContain(service);
    }
    expect(text).not.toMatch(/lorem|placeholder|example corp/i);
  });

  it("carries lineage and a content checksum on every artifact", () => {
    expect(result.artifacts).toHaveLength(3);
    for (const artifact of result.artifacts) {
      expect(artifact.checksum).toMatch(/^[a-z0-9]+$/i);
      expect(artifact.validationStatus).toBe("unvalidated");
      expect(artifact.reviewRequired).toBe(true);
    }
    expect(result.artifacts.map((a) => a.kind).sort()).toEqual(["executive_summary", "prospect_intelligence", "transformation_readiness"]);
  });
});

/* =============================================================================
 * 9 · readiness
 * ========================================================================== */
describe("transformation readiness", () => {
  it("excludes factors with no assessable category rather than zeroing them", () => {
    const items = strongEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const readiness = computeReadiness({ scanId: SCAN, items, maturity, now: NOW });
    // measurement_capability rests solely on analytics, which a crawl cannot see.
    expect(readiness.excludedFactors).toContain("measurement_capability");
    const excluded = readiness.factors.find((f) => f.factor === "measurement_capability")!;
    expect(excluded.score).toBeNull();
    expect(excluded.weight).toBe(0);
    expect(excluded.available).toBe(false);
  });

  it("computes each factor from its declared categories", () => {
    const items = strongEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const readiness = computeReadiness({ scanId: SCAN, items, maturity, now: NOW });
    const foundation = readiness.factors.find((f) => f.factor === "digital_foundation")!;
    expect(foundation.available).toBe(true);
    expect(foundation.contributingCategories.length).toBeGreaterThan(0);
    expect(foundation.calculation.formula).toContain("Σ");
  });

  it("reports null readiness when nothing is assessable", () => {
    const maturity = assessMaturity({ scanId: SCAN, items: [], now: NOW });
    const readiness = computeReadiness({ scanId: SCAN, items: [], maturity, now: NOW });
    expect(readiness.overall).toBeNull();
    expect(readiness.coverage).toBe(0);
    expect(readiness.excludedFactors).toHaveLength(readinessFactorSchema.options.length);
  });

  it("bands only a real score", () => {
    expect(digitalMaturityBand(null)).toBeNull();
    expect(digitalMaturityBand(10)).toBe("nascent");
    expect(digitalMaturityBand(90)).toBe("advanced");
  });
});

/* =============================================================================
 * 10 · recommendation handoff
 * ========================================================================== */
describe("recommendation inputs", () => {
  it("builds one candidate per opportunity, linking related risks", () => {
    const items = weakEvidence();
    const maturity = assessMaturity({ scanId: SCAN, items, now: NOW });
    const opportunities = deriveOpportunities({ items, maturity, idFor: (i) => ids("o", i) });
    const risks = deriveRisks({ items, maturity, idFor: (i) => ids("r", i) });
    const inputs = buildRecommendationInputs({ opportunities, risks, idFor: (i) => ids("ri", i) });

    expect(inputs).toHaveLength(opportunities.length);
    for (const input of inputs) {
      expect(input.evidenceIds.length).toBeGreaterThan(0);
      expect(input.opportunityIds).toHaveLength(1);
      // It supplies inputs; it never ranks or prices.
      expect(Object.keys(input)).not.toContain("rank");
      expect(Object.keys(input)).not.toContain("price");
      expect(input.proposedAction).toMatch(/not here/i);
    }
  });
});

/* =============================================================================
 * 11 · end-to-end determinism
 * ========================================================================== */
describe("determinism", () => {
  it("produces a byte-identical result for identical input", () => {
    const a = runProspectIntelligence({ scanId: SCAN, evidence: strongEvidence(), idFor: ids, now: NOW });
    const b = runProspectIntelligence({ scanId: SCAN, evidence: strongEvidence(), idFor: ids, now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.artifacts.map((x) => x.checksum)).toEqual(b.artifacts.map((x) => x.checksum));
  });

  it("changes the checksum when the evidence changes", () => {
    const a = runProspectIntelligence({ scanId: SCAN, evidence: strongEvidence(), idFor: ids, now: NOW });
    const b = runProspectIntelligence({ scanId: SCAN, evidence: weakEvidence(), idFor: ids, now: NOW });
    expect(a.artifacts[0]!.checksum).not.toBe(b.artifacts[0]!.checksum);
  });

  it("is insensitive to evidence ordering", () => {
    const items = [...strongEvidence(), item("ev_two", { hasTitle: true, isHttps: true })];
    const a = runProspectIntelligence({ scanId: SCAN, evidence: items, idFor: ids, now: NOW });
    const b = runProspectIntelligence({ scanId: SCAN, evidence: [...items].reverse(), idFor: ids, now: NOW });
    expect(a.maturity.overall).toBe(b.maturity.overall);
    expect(a.artifacts[0]!.checksum).toBe(b.artifacts[0]!.checksum);
  });

  it("accepts a bundle or a bare item list identically", () => {
    const items = strongEvidence();
    const a = runProspectIntelligence({ scanId: SCAN, evidence: items, idFor: ids, now: NOW });
    const b = runProspectIntelligence({ scanId: SCAN, evidence: { scanId: SCAN, items }, idFor: ids, now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* =============================================================================
 * 12 · the empty case — honest, not zeroed
 * ========================================================================== */
describe("no usable evidence", () => {
  const result = runProspectIntelligence({ scanId: SCAN, evidence: [], idFor: ids, now: NOW });

  it("returns a fully-formed but honest empty assessment", () => {
    expect(result.maturity.overall).toBeNull();
    expect(result.readiness.overall).toBeNull();
    expect(result.confidence.value).toBe(0);
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.opportunities).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.recommendationInputs).toEqual([]);
  });

  it("emits an evidence_insufficient event and says so in the limitations", () => {
    expect(result.events.some((e) => e.type === "prospect.evidence_insufficient")).toBe(true);
    expect(result.limitations[0]).toMatch(/no usable evidence/i);
  });

  it("still produces the three artifacts and still demands review", () => {
    expect(result.artifacts).toHaveLength(3);
    expect(result.events.some((e) => e.type === "prospect.review_required")).toBe(true);
    expect(result.executiveSummary.reviewRequired).toBe(true);
  });
});

/* =============================================================================
 * 13 · event stream
 * ========================================================================== */
describe("events", () => {
  it("records each derivation stage exactly once, plus one per artifact", () => {
    const result = runProspectIntelligence({ scanId: SCAN, evidence: strongEvidence(), idFor: ids, now: NOW });
    const types = result.events.map((e) => e.type);
    for (const expected of [
      "prospect.maturity_scored",
      "prospect.profile_derived",
      "prospect.findings_derived",
      "prospect.risks_derived",
      "prospect.opportunities_derived",
      "prospect.readiness_computed",
      "prospect.summary_assembled",
      "prospect.review_required",
    ]) {
      expect(types.filter((t) => t === expected)).toHaveLength(1);
    }
    expect(types.filter((t) => t === "prospect.artifact_created")).toHaveLength(3);
    for (const event of result.events) expect(event.at).toBe(NOW);
  });
});
