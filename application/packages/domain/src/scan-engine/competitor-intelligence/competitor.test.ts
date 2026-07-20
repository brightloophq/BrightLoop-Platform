/* =============================================================================
 * Sprint 10 · Competitor Intelligence Framework — deterministic tests.
 *
 * Candidate validation, false-positive safeguards, similarity, ranking, benchmark
 * normalization, gaps, market position, outputs, graph lineage, decision inputs,
 * set confidence, snapshots/changesets, and run-to-run determinism.
 * Enforces the two inviolable rules: never fabricate a competitor or a benchmark.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type {
  BenchmarkDimension,
  EngineCompetitorBenchmark,
  EngineCompetitorCandidate,
  EvidenceConfidence,
  NormalizationPolicy,
  Provenance,
} from "@brightloop/schema";
import { COMPETITOR_FORMULA_VERSION, intelligenceGraphSchema } from "@brightloop/schema";
import { buildProvenance } from "../evidence/index.js";
import { newArtifactRegistry, recordArtifact } from "../pipeline-run/artifacts.js";
import { newCompetitorCandidate, promoteToValidated, normalizeDomain, domainRoot, normalizeBusinessName } from "./candidate.js";
import { validateIdentity, validatePool, competitorStatusFor, applyValidation, type IdentityPolicy } from "./identity.js";
import { computeSimilarity, computeSimilarityFactors, setOverlap, priceCloseness, DEFAULT_SIMILARITY_WEIGHTS, type ClientProfile } from "./similarity.js";
import { rankCompetitors, deriveDirectness } from "./ranking.js";
import { normalizeValue, median, percentileRank, populationStats, winsorize, relativePosition } from "./normalize.js";
import { newBenchmark, benchmarkCoverage, comparisonConfidence, weakerBasis, supportsDirectComparison, BASIS_PENALTY } from "./benchmarks.js";
import { analyzeGaps, deriveGapSeverity, orderGaps } from "./gaps.js";
import { buildMarketPosition, MIN_COVERAGE_FOR_CLAIMS } from "./position.js";
import { buildCompetitiveOutputs, outputsOfKind } from "./outputs.js";
import { buildDecisionInputs, decisionFactorValue } from "./decision-inputs.js";
import { computeSetConfidence, confidenceBandFor } from "./confidence.js";
import { createCompetitorSnapshot, compareSnapshots } from "./snapshot.js";
import { buildCompetitorProjection, extendGraph, recordCompetitorGraphArtifact } from "./graph.js";

const NOW = "2026-07-20T00:00:00.000Z";
const prov = (): Provenance => buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler" });
const conf = (v: number): EvidenceConfidence => ({
  value: v,
  band: v >= 80 ? "very_high" : v >= 60 ? "high" : v >= 40 ? "moderate" : "low",
  inputs: { coverage: v / 100, reliability: v / 100, freshness: v / 100, agreement: v / 100, completeness: v / 100, provenanceQuality: v / 100 },
});

/* ---- fixtures -------------------------------------------------------------- */
function cand(over: Partial<EngineCompetitorCandidate> = {}): EngineCompetitorCandidate {
  const base = newCompetitorCandidate({
    id: "c-1", scanId: "scan-1", clientId: null, businessName: "Rival Co", primaryDomain: "rival.com",
    discoveredAt: NOW, evidenceIds: ["ev-1"], confidence: conf(80), provenance: prov(),
    industry: "retail", geography: ["US"], customerSegment: ["smb"], businessModel: "b2c",
    productsServices: ["widgets"], pricePosition: "mid_market", observedChannels: ["web"],
  });
  return { ...base, ...over };
}
const clientProfile: ClientProfile = {
  industry: "retail", geography: ["US"], customerSegment: ["smb"], businessModel: "b2c",
  productsServices: ["widgets"], pricePosition: "mid_market", observedChannels: ["web"],
};
const policy = (over: Partial<IdentityPolicy> = {}): IdentityPolicy => ({ clientDomain: "northwind.co", ...over });

/* ===== 1 · candidate model ================================================= */
describe("candidate model", () => {
  it("normalizes domains for identity comparison", () => {
    expect(normalizeDomain("https://WWW.Rival.com/path?q=1")).toBe("rival.com");
    expect(normalizeDomain("rival.com.")).toBe("rival.com");
    expect(normalizeDomain("")).toBe("");
    expect(domainRoot("shop.eu.rival.com")).toBe("rival.com");
    expect(normalizeBusinessName("Rival Co., Inc.")).toBe("rival");
  });

  it("refuses to validate a candidate with no evidence (rule 1)", () => {
    const promoted = promoteToValidated(cand({ evidenceIds: [] }));
    expect(promoted.status).toBe("unavailable");
    expect(promoted.exclusionReasons.join(" ")).toContain("insufficient evidence");
    expect(promoted.manualReviewRequired).toBe(true);
  });

  it("validates a candidate that carries evidence", () => {
    expect(promoteToValidated(cand()).status).toBe("validated");
  });
});

/* ===== 3 + 15 · identity & false positives ================================= */
describe("identity validation", () => {
  it("passes a clean candidate", () => {
    const v = validateIdentity(cand(), [cand()], policy());
    expect(v.status).toBe("validated");
    expect(v.findings).toEqual([]);
  });

  it("rejects the client itself and known aliases", () => {
    const self = cand({ id: "c-self", primaryDomain: "northwind.co", normalizedDomain: "northwind.co" });
    expect(validateIdentity(self, [self], policy()).findings[0]!.kind).toBe("same_company_alias");
    const alias = cand({ id: "c-a", normalizedDomain: "nw-group.com" });
    expect(validateIdentity(alias, [alias], policy({ clientAliases: ["nw-group.com"] })).status).toBe("rejected");
  });

  it("rejects an exact-domain duplicate (later id loses)", () => {
    const a = cand({ id: "c-a" });
    const b = cand({ id: "c-b" }); // same normalized domain
    expect(validateIdentity(a, [a, b], policy()).status).toBe("validated");
    const vb = validateIdentity(b, [a, b], policy());
    expect(vb.status).toBe("rejected");
    expect(vb.findings[0]!.kind).toBe("exact_domain_duplicate");
  });

  it("excludes parent/subsidiary and franchise variants", () => {
    const parent = cand({ id: "c-p", normalizedDomain: "rival.com" });
    const sub = cand({ id: "c-s", normalizedDomain: "shop.rival.com" });
    expect(validateIdentity(sub, [parent, sub], policy()).findings[0]!.kind).toBe("parent_subsidiary");
    const franchise = cand({ id: "c-f", normalizedDomain: "citystore.rival.com" });
    expect(validateIdentity(franchise, [parent, franchise], policy()).findings[0]!.kind).toBe("franchise_variant");
  });

  it("rejects directories, marketplaces, suppliers, and non-commercial entities", () => {
    const kinds = (d: string, p: Partial<IdentityPolicy> = {}) => {
      const c = cand({ id: `c-${d}`, normalizedDomain: d });
      return validateIdentity(c, [c], policy(p)).findings.map((f) => f.kind);
    };
    expect(kinds("yelp.com")).toContain("directory_listing");
    expect(kinds("amazon.com")).toContain("marketplace_not_competitor");
    expect(kinds("supplier.com", { supplierDomains: ["supplier.com"] })).toContain("supplier_not_competitor");
    expect(kinds("state.gov")).toContain("non_commercial_entity");
    expect(kinds("dead.com", { inactiveDomains: ["dead.com"] })).toContain("inactive_business");
  });

  it("marks ambiguity instead of silently accepting", () => {
    const noEvidence = cand({ id: "c-ne", evidenceIds: [] });
    const v = validateIdentity(noEvidence, [noEvidence], policy());
    expect(v.status).toBe("ambiguous"); // never auto-promoted to a competitor
    expect(v.manualReviewRequired).toBe(true);
    expect(v.findings.map((f) => f.kind)).toContain("missing_evidence");

    const offCategory = cand({ id: "c-oc", industry: "healthcare" });
    expect(validateIdentity(offCategory, [offCategory], policy({ clientIndustry: "retail" })).status).toBe("ambiguous");

    const offRegion = cand({ id: "c-or", geography: ["JP"] });
    expect(validateIdentity(offRegion, [offRegion], policy({ clientGeography: ["US"] })).status).toBe("ambiguous");
  });

  it("resolves the most severe disposition and applies it to the candidate", () => {
    expect(competitorStatusFor([])).toBe("validated");
    expect(competitorStatusFor([{ kind: "missing_evidence", disposition: "ambiguous", detail: "", relatedCandidateIds: [], evidenceIds: [] }])).toBe("ambiguous");
    const c = cand();
    const applied = applyValidation(c, validateIdentity(cand({ normalizedDomain: "yelp.com" }), [], policy()));
    expect(applied.exclusionReasons.length).toBeGreaterThan(0);
  });

  it("validates a whole pool deterministically", () => {
    const pool = [cand({ id: "c-b" }), cand({ id: "c-a" })];
    const one = validatePool(pool, policy());
    const two = validatePool([...pool].reverse(), policy());
    expect(one.candidates.map((c) => [c.id, c.status])).toEqual(two.candidates.map((c) => [c.id, c.status]));
  });
});

/* ===== 4 · similarity ====================================================== */
describe("similarity", () => {
  it("computes set overlap and price closeness", () => {
    expect(setOverlap(["a", "b"], ["a", "b"])).toBe(100);
    expect(setOverlap(["a"], ["b"])).toBe(0);
    expect(setOverlap([], ["a"])).toBeNull(); // no data → null, not 0
    expect(priceCloseness("budget", "budget")).toBe(100);
    expect(priceCloseness("budget", "luxury")).toBe(0);
    expect(priceCloseness("unknown", "budget")).toBeNull();
  });

  it("produces ten factors and scores an identical profile highly", () => {
    const s = computeSimilarity(clientProfile, cand());
    expect(s.factors).toHaveLength(10);
    expect(s.aggregate).toBeGreaterThan(70);
    expect(s.formulaVersion).toBe(COMPETITOR_FORMULA_VERSION);
  });

  it("marks missing data unavailable and redistributes weight — never an invented match", () => {
    const sparse = cand({ industry: null, productsServices: [], geography: [], customerSegment: [], observedChannels: [], pricePosition: "unknown", businessModel: "unknown" });
    const s = computeSimilarity(clientProfile, sparse);
    expect(s.unavailableFactors.length).toBeGreaterThan(0);
    expect(s.warnings.join(" ")).toContain("redistributed");
    const industry = s.factors.find((f) => f.key === "industry_similarity")!;
    expect(industry.score).toBeNull();
    expect(industry.missingDataTreatment).toBe("unavailable");
  });

  it("scales the rank by evidence confidence (Rank = Sim × C)", () => {
    const hi = computeSimilarity(clientProfile, cand({ confidence: conf(100) }));
    const lo = computeSimilarity(clientProfile, cand({ confidence: conf(50) }));
    expect(hi.aggregate).toBe(lo.aggregate); // same profile
    expect(lo.confidenceScaled).toBeLessThan(hi.confidenceScaled); // weaker evidence ranks lower
  });

  it("factor computation is deterministic", () => {
    expect(computeSimilarityFactors(clientProfile, cand())).toEqual(computeSimilarityFactors(clientProfile, cand()));
  });
});

/* ===== 5 · ranking ========================================================= */
describe("ranking", () => {
  function rank(cands: EngineCompetitorCandidate[], maxSelected?: number) {
    const sims = new Map(cands.map((c) => [c.id, computeSimilarity(clientProfile, c)]));
    return rankCompetitors({ candidates: cands, similarities: sims, maxSelected });
  }

  it("selects only validated candidates and reports the rest", () => {
    const r = rank([
      { ...cand({ id: "c-ok" }), status: "validated" },
      { ...cand({ id: "c-amb" }), status: "ambiguous" },
      { ...cand({ id: "c-exc" }), status: "excluded" },
      { ...cand({ id: "c-rej" }), status: "rejected" },
    ]);
    expect(r.selected.map((s) => s.candidateId)).toEqual(["c-ok"]);
    expect(r.ambiguous).toEqual(["c-amb"]);
    expect(r.excluded).toEqual(["c-exc"]);
    expect(r.rejected.map((x) => x.candidateId)).toContain("c-rej");
  });

  it("caps the set at the configured maximum (default 10)", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...cand({ id: `c-${String(i).padStart(2, "0")}` }), status: "validated" as const }));
    expect(rank(many).selected).toHaveLength(10);
    expect(rank(many, 3).selected).toHaveLength(3);
    expect(rank(many).rejected.some((x) => x.reason.includes("outside the top"))).toBe(true);
  });

  it("breaks exact ties by stable id and is order-independent", () => {
    const items = [{ ...cand({ id: "z" }), status: "validated" as const }, { ...cand({ id: "a" }), status: "validated" as const }];
    expect(rank(items).selected[0]!.candidateId).toBe("a");
    expect(rank([...items].reverse()).selected.map((s) => s.candidateId)).toEqual(rank(items).selected.map((s) => s.candidateId));
    expect(rank(items).selected[0]!.comparisonToNext).toBe("stable_id_tiebreak");
  });

  it("derives directness from the similarity profile", () => {
    expect(deriveDirectness(computeSimilarity(clientProfile, cand()))).toBe("direct");
  });
});

/* ===== 8 · normalization =================================================== */
describe("normalization", () => {
  const pol = (over: Partial<NormalizationPolicy> = {}): NormalizationPolicy => ({
    direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION, ...over,
  });

  it("normalizes higher- and lower-is-better metrics", () => {
    expect(normalizeValue(75, pol())).toBe(75);
    expect(normalizeValue(75, pol({ direction: "lower_is_better" }))).toBe(25);
    expect(normalizeValue(150, pol())).toBe(100); // clamped to range
  });

  it("normalizes ordinal, categorical, and binary metrics", () => {
    const scale = pol({ direction: "ordinal", ordinalScale: ["poor", "fair", "good", "excellent"] });
    expect(normalizeValue("poor", scale)).toBe(0);
    expect(normalizeValue("excellent", scale)).toBe(100);
    expect(normalizeValue("unknown-category", scale)).toBeNull(); // unknown → null, not a default
    expect(normalizeValue(1, pol({ direction: "binary" }))).toBe(100);
    expect(normalizeValue(0, pol({ direction: "binary" }))).toBe(0);
  });

  it("never converts an unavailable value into a score", () => {
    expect(normalizeValue(null, pol())).toBeNull();
    expect(normalizeValue(50, pol({ min: null, max: null }))).toBeNull(); // no defensible range
  });

  it("computes medians, percentiles, stats, and winsorization", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([null, null])).toBeNull();
    expect(percentileRank(3, [1, 2, 3, 4])).toBe(75);
    expect(percentileRank(null, [1, 2])).toBeNull();
    expect(percentileRank(1, [])).toBeNull();
    expect(populationStats([2, 4, 4, 4, 5, 5, 7, 9]).stdDev).toBeCloseTo(2);
    expect(winsorize([1, 2, 3, 4, 100], 0.2)).toEqual([2, 2, 3, 4, 4]);
  });

  it("computes standardized relative position", () => {
    expect(relativePosition(6, [2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo((6 - 5) / 2);
    expect(relativePosition(null, [1, 2])).toBeNull();
    expect(relativePosition(1, [5, 5, 5])).toBeNull(); // zero variance
  });
});

/* ===== 6 + 7 · benchmarks & evidence basis ================================ */
describe("benchmarks", () => {
  const dims: BenchmarkDimension[] = ["website_performance", "seo_visibility"];
  const pol: NormalizationPolicy = { direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION };
  const bm = (over: Partial<Parameters<typeof newBenchmark>[0]> = {}) =>
    newBenchmark({ id: "b-1", scanId: "scan-1", dimension: "website_performance", subjectBusinessId: "client", value: 70, evidenceIds: ["ev-1"], evidenceState: "observed", confidence: conf(80), provenance: prov(), policy: pol, ...over });

  it("records an available observed benchmark", () => {
    const b = bm();
    expect(b.available).toBe(true);
    expect(b.normalizedScore).toBe(70);
  });

  it("refuses a benchmark with no evidence (rule 2)", () => {
    const b = bm({ evidenceIds: [] });
    expect(b.available).toBe(false);
    expect(b.value).toBeNull();
    expect(b.limitations.join(" ")).toContain("Unavailable rather than fabricated");
  });

  it("downgrades an estimate with no declared basis", () => {
    const b = bm({ evidenceState: "estimated" });
    expect(b.available).toBe(false);
    expect(b.limitations.join(" ")).toContain("without an estimation basis");
    const ok = bm({ evidenceState: "estimated", estimationBasis: "modeled from category median" });
    expect(ok.available).toBe(true);
  });

  it("marks inferred values clearly and applies basis penalties", () => {
    expect(bm({ evidenceState: "inferred" }).limitations.join(" ")).toContain("Inferred value");
    expect(supportsDirectComparison("observed")).toBe(true);
    expect(supportsDirectComparison("estimated")).toBe(false);
    expect(weakerBasis("observed", "inferred")).toBe("inferred");
    expect(BASIS_PENALTY.unavailable).toBe(0);
    // confidence is capped by the weaker side
    expect(comparisonConfidence(90, "observed", 80, "inferred")).toBe(Math.round(80 * 0.6));
  });

  it("reports coverage over the dimension set", () => {
    const all = [bm({ id: "b-a", dimension: "website_performance", competitorId: null })];
    expect(benchmarkCoverage(all, dims, null)).toBe(0.5);
    expect(benchmarkCoverage(all, dims, "c-1")).toBe(0);
  });
});

/* ===== 9 · gaps ============================================================ */
describe("gaps", () => {
  const pol: NormalizationPolicy = { direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION };
  const mk = (id: string, competitorId: string | null, value: number | null, state: EngineCompetitorBenchmark["evidenceState"] = "observed") =>
    newBenchmark({ id, scanId: "scan-1", dimension: "website_performance", subjectBusinessId: "client", competitorId, value, evidenceIds: value === null ? [] : ["ev-1"], evidenceState: value === null ? "unavailable" : state, confidence: conf(80), provenance: prov(), policy: pol });

  const analyze = (benchmarks: EngineCompetitorBenchmark[]) =>
    analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks })[0]!;

  it("detects a deficit, advantage, and parity", () => {
    expect(analyze([mk("b0", null, 40), mk("b1", "c-1", 80), mk("b2", "c-2", 80)]).type).toBe("deficit");
    expect(analyze([mk("b0", null, 90), mk("b1", "c-1", 40), mk("b2", "c-2", 40)]).type).toBe("advantage");
    expect(analyze([mk("b0", null, 50), mk("b1", "c-1", 50), mk("b2", "c-2", 52)]).type).toBe("parity");
  });

  it("returns unknown (never zero) when either side is unavailable", () => {
    const noClient = analyze([mk("b0", null, null), mk("b1", "c-1", 80)]);
    expect(noClient.type).toBe("unknown");
    expect(noClient.currentScore).toBeNull();
    expect(noClient.absoluteGap).toBeNull();
    expect(noClient.confidence).toBe(0);
    expect(noClient.reviewRequired).toBe(true);
    expect(noClient.limitations.join(" ")).toContain("not zero");

    const noRivals = analyze([mk("b0", null, 50)]);
    expect(noRivals.type).toBe("unknown");
  });

  it("derives severity only for deficits", () => {
    expect(deriveGapSeverity("deficit", -45)).toBe("critical");
    expect(deriveGapSeverity("deficit", -30)).toBe("high");
    expect(deriveGapSeverity("deficit", -15)).toBe("moderate");
    expect(deriveGapSeverity("advantage", 45)).toBe("none");
    expect(deriveGapSeverity("unknown", null)).toBe("none");
  });

  it("orders gaps by severity then magnitude", () => {
    const a = { ...analyze([mk("b0", null, 40), mk("b1", "c-1", 80), mk("b2", "c-2", 80)]), id: "g-a" };
    const b = { ...analyze([mk("b0", null, 50), mk("b1", "c-1", 52), mk("b2", "c-2", 52)]), id: "g-b", dimension: "seo_visibility" as const };
    expect(orderGaps([b, a])[0]!.id).toBe("g-a");
  });
});

/* ===== 10 · market position ================================================ */
describe("market position", () => {
  const pol: NormalizationPolicy = { direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION };
  const mk = (id: string, dimension: BenchmarkDimension, competitorId: string | null, value: number | null) =>
    newBenchmark({ id, scanId: "scan-1", dimension, subjectBusinessId: "client", competitorId, value, evidenceIds: value === null ? [] : ["ev-1"], evidenceState: value === null ? "unavailable" : "observed", confidence: conf(85), provenance: prov(), policy: pol });

  it("computes percentiles and gates unsupported market claims on coverage", () => {
    const dims: BenchmarkDimension[] = ["website_performance", "seo_visibility"];
    const benchmarks = [
      mk("b0", "website_performance", null, 90), mk("b1", "website_performance", "c-1", 40), mk("b2", "website_performance", "c-2", 50),
      mk("b3", "seo_visibility", null, 80), mk("b4", "seo_visibility", "c-1", 30), mk("b5", "seo_visibility", "c-2", 40),
    ];
    const p = buildMarketPosition({ scanId: "scan-1", dimensions: dims, benchmarks, competitorSetQuality: 80 });
    expect(p.overallPercentile).toBe(100);
    expect(p.evidenceCoverage).toBe(1);
    expect(p.supportsMarketClaims).toBe(true);
    expect(p.strongestDimensions.length).toBe(2);
  });

  it("refuses market claims when coverage is thin — unavailable is excluded, not zeroed", () => {
    const dims: BenchmarkDimension[] = ["website_performance", "seo_visibility", "accessibility"];
    const benchmarks = [mk("b0", "website_performance", null, 90), mk("b1", "website_performance", "c-1", 40), mk("b2", "website_performance", "c-2", 50)];
    const p = buildMarketPosition({ scanId: "scan-1", dimensions: dims, benchmarks, competitorSetQuality: 80 });
    expect(p.evidenceCoverage).toBeLessThan(MIN_COVERAGE_FOR_CLAIMS);
    expect(p.supportsMarketClaims).toBe(false);
    expect(p.unavailableDimensions).toContain("seo_visibility");
    expect(p.limitations.join(" ")).toContain("market-standing claims");
    expect(p.dimensionPercentiles.seo_visibility).toBeUndefined(); // not scored as zero
  });

  it("refuses market claims when the competitor set is low quality", () => {
    const dims: BenchmarkDimension[] = ["website_performance"];
    const benchmarks = [mk("b0", "website_performance", null, 90), mk("b1", "website_performance", "c-1", 40), mk("b2", "website_performance", "c-2", 50)];
    expect(buildMarketPosition({ scanId: "scan-1", dimensions: dims, benchmarks, competitorSetQuality: 20 }).supportsMarketClaims).toBe(false);
  });
});

/* ===== 11 · outputs ======================================================== */
describe("opportunity & threat outputs", () => {
  const pol: NormalizationPolicy = { direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION };
  const mk = (id: string, competitorId: string | null, value: number | null) =>
    newBenchmark({ id, scanId: "scan-1", dimension: "website_performance", subjectBusinessId: "client", competitorId, value, evidenceIds: value === null ? [] : ["ev-1"], evidenceState: value === null ? "unavailable" : "observed", confidence: conf(85), provenance: prov(), policy: pol });

  it("derives opportunities and threats from a deficit", () => {
    const benchmarks = [mk("b0", null, 20), mk("b1", "c-1", 80), mk("b2", "c-2", 80)];
    const gaps = analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks });
    const outputs = buildCompetitiveOutputs({ idFor: (k, i) => `o-${k}-${i}`, gaps, benchmarks, competitorIds: ["c-1"] });
    expect(outputsOfKind(outputs, "opportunity")).toHaveLength(1);
    expect(outputsOfKind(outputs, "threat")).toHaveLength(1); // material deficit is also a threat
    expect(outputs[0]!.gapIds).toEqual(["gap-website_performance"]);
    expect(outputs[0]!.benchmarkIds.length).toBeGreaterThan(0);
  });

  it("derives evidence gaps and monitoring candidates from unknown gaps", () => {
    const benchmarks = [mk("b0", null, null)];
    const gaps = analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks });
    const outputs = buildCompetitiveOutputs({ idFor: (k, i) => `o-${k}-${i}`, gaps, benchmarks });
    expect(outputsOfKind(outputs, "evidence_gap")).toHaveLength(1);
    expect(outputsOfKind(outputs, "monitoring_candidate")).toHaveLength(1);
    expect(outputsOfKind(outputs, "opportunity")).toHaveLength(0); // nothing asserted without evidence
  });

  it("derives defensible strengths and differentiation from an advantage", () => {
    const benchmarks = [mk("b0", null, 95), mk("b1", "c-1", 30), mk("b2", "c-2", 30)];
    const gaps = analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks });
    const outputs = buildCompetitiveOutputs({ idFor: (k, i) => `o-${k}-${i}`, gaps, benchmarks });
    expect(outputsOfKind(outputs, "defensible_strength")).toHaveLength(1);
    expect(outputsOfKind(outputs, "differentiation")).toHaveLength(1);
  });
});

/* ===== 12 · graph integration ============================================== */
describe("graph integration", () => {
  it("projects competitor nodes and compares_to edges without mutating the graph", () => {
    const graph = intelligenceGraphSchema.parse({ scanId: "scan-1", clientId: null, nodes: [], edges: [] });
    const projection = buildCompetitorProjection({
      scanId: "scan-1", clientId: null, clientNodeId: "n-client", candidates: [cand()], selectedIds: ["c-1"],
      benchmarks: [], gaps: [], provenance: prov(), confidence: conf(80), now: NOW, idFor: (k, key) => `${k}:${key}`,
    });
    expect(projection.nodes.some((n) => n.type === "competitor")).toBe(true);
    expect(projection.edges.some((e) => e.type === "compares_to" && e.from === "n-client")).toBe(true);

    const extended = extendGraph(graph, projection);
    expect(graph.nodes).toHaveLength(0); // original untouched
    expect(extended.nodes.length).toBeGreaterThan(0);
  });

  it("records a NEW graph artifact version with lineage and a stable checksum", () => {
    const reg = newArtifactRegistry();
    const prior = recordArtifact(reg, { id: "a-graph", pipelineRunId: "run-1", scanId: "scan-1", kind: "intelligence_graph", payload: { nodes: [] }, now: NOW, validationStatus: "valid" });
    const graph = intelligenceGraphSchema.parse({ scanId: "scan-1", clientId: null, nodes: [], edges: [] });
    const artifact = recordCompetitorGraphArtifact(reg, graph, { id: "a-graph-2", pipelineRunId: "run-1", scanId: "scan-1", now: NOW });

    expect(artifact.version).toBe(prior.version + 1);
    expect(artifact.sourceArtifactIds).toContain("a-graph");
    expect(reg.byId.get("a-graph")!.checksum).toBe(prior.checksum); // upstream untouched
    expect(recordCompetitorGraphArtifact(newArtifactRegistry(), graph, { id: "x", pipelineRunId: "run-1", scanId: "scan-1", now: NOW }).checksum).toBe(artifact.checksum);
  });
});

/* ===== 13 · decision-science inputs ======================================== */
describe("decision-science inputs", () => {
  const pol: NormalizationPolicy = { direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION };
  const mk = (id: string, competitorId: string | null, value: number | null) =>
    newBenchmark({ id, scanId: "scan-1", dimension: "website_performance", subjectBusinessId: "client", competitorId, value, evidenceIds: value === null ? [] : ["ev-1"], evidenceState: value === null ? "unavailable" : "observed", confidence: conf(85), provenance: prov(), policy: pol });

  it("emits versioned factors for evidenced gaps only", () => {
    const good = analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks: [mk("b0", null, 20), mk("b1", "c-1", 80), mk("b2", "c-2", 80)] });
    const inputs = buildDecisionInputs({ scanId: "scan-1", gaps: good, competitorIds: ["c-1"] });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.factors).toHaveLength(6);
    expect(inputs[0]!.formulaVersion).toBe(COMPETITOR_FORMULA_VERSION);
    expect(decisionFactorValue(inputs[0]!, "threat_urgency")).toBeGreaterThan(0);
  });

  it("skips unknown gaps — an unevidenced gap must not nudge a score", () => {
    const unknown = analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks: [mk("b0", null, null)] });
    expect(buildDecisionInputs({ scanId: "scan-1", gaps: unknown })).toHaveLength(0);
  });
});

/* ===== 14 · set confidence ================================================= */
describe("competitor-set confidence", () => {
  it("scores a healthy set and permits market claims", () => {
    const cands = Array.from({ length: 5 }, (_, i) => ({ ...cand({ id: `c-${i}` }), status: "validated" as const }));
    const sims = new Map(cands.map((c) => [c.id, computeSimilarity(clientProfile, c)]));
    const r = computeSetConfidence({ candidates: cands, selectedIds: cands.map((c) => c.id), similarities: sims, freshnessShare: 0.9 });
    expect(r.score).toBeGreaterThan(40);
    expect(r.contributions).toHaveLength(9);
    expect(r.formulaVersion).toBe(COMPETITOR_FORMULA_VERSION);
  });

  it("refuses market claims for a thin or ambiguous set", () => {
    const cands = [{ ...cand({ id: "c-1" }), status: "ambiguous" as const }];
    const r = computeSetConfidence({ candidates: cands, selectedIds: [] });
    expect(r.supportsMarketClaims).toBe(false);
    expect(r.warnings.join(" ")).toContain("insufficient to support strong market claims");
  });

  it("bands confidence deterministically", () => {
    expect(confidenceBandFor(90)).toBe("very_high");
    expect(confidenceBandFor(10)).toBe("very_low");
  });
});

/* ===== 16 · snapshots & changesets ========================================= */
describe("snapshots", () => {
  const pol: NormalizationPolicy = { direction: "higher_is_better", min: 0, max: 100, ordinalScale: [], outlierPolicy: "none", winsorFraction: 0.05, formulaVersion: COMPETITOR_FORMULA_VERSION };
  const mk = (id: string, competitorId: string | null, value: number) =>
    newBenchmark({ id, scanId: "scan-1", dimension: "website_performance", subjectBusinessId: "client", competitorId, value, evidenceIds: ["ev-1"], evidenceState: "observed", confidence: conf(85), provenance: prov(), policy: pol });

  function snap(id: string, clientValue: number, competitorIds: string[]) {
    const benchmarks = [mk("b0", null, clientValue), ...competitorIds.map((c, i) => mk(`b-${c}`, c, 50 + i))];
    const gaps = analyzeGaps({ idFor: (d) => `gap-${d}`, dimensions: ["website_performance"], benchmarks });
    const cands = competitorIds.map((c) => ({ ...cand({ id: c }), status: "validated" as const }));
    const sims = new Map(cands.map((c) => [c.id, computeSimilarity(clientProfile, c)]));
    const ranking = rankCompetitors({ candidates: cands, similarities: sims });
    return createCompetitorSnapshot({ id, scanId: "scan-1", clientId: null, ranking, benchmarks, dimensions: ["website_performance"], gaps, now: NOW });
  }

  it("checksums content deterministically and ignores id/timestamp", () => {
    const a = snap("s-1", 70, ["c-1", "c-2"]);
    const b = snap("s-2", 70, ["c-1", "c-2"]);
    expect(a.checksum).toBe(b.checksum); // same content, different id
    expect(snap("s-3", 20, ["c-1", "c-2"]).checksum).not.toBe(a.checksum);
  });

  it("detects added, removed, and benchmark/gap changes", () => {
    const before = snap("s-1", 70, ["c-1", "c-2"]);
    const after = snap("s-2", 20, ["c-2", "c-3"]);
    const kinds = compareSnapshots(before, after).changes.map((c) => c.kind);
    expect(kinds).toContain("competitor_added");
    expect(kinds).toContain("competitor_removed");
    expect(kinds).toContain("benchmark_changed");
    expect(kinds).toContain("gap_widened"); // advantage → deficit
  });

  it("reports no changes between identical snapshots", () => {
    expect(compareSnapshots(snap("s-1", 70, ["c-1"]), snap("s-2", 70, ["c-1"])).changes).toEqual([]);
  });
});

/* ===== determinism + no hidden chain-of-thought ============================ */
describe("determinism & integrity", () => {
  it("produces identical results for identical inputs", () => {
    const cands = [{ ...cand({ id: "c-1" }), status: "validated" as const }, { ...cand({ id: "c-2" }), status: "validated" as const }];
    const run = () => {
      const sims = new Map(cands.map((c) => [c.id, computeSimilarity(clientProfile, c, DEFAULT_SIMILARITY_WEIGHTS)]));
      return { ranking: rankCompetitors({ candidates: cands, similarities: sims }), confidence: computeSetConfidence({ candidates: cands, selectedIds: cands.map((c) => c.id), similarities: sims }) };
    };
    expect(run()).toEqual(run());
  });

  it("exposes no hidden chain-of-thought fields anywhere", () => {
    const cands = [{ ...cand({ id: "c-1" }), status: "validated" as const }];
    const sims = new Map(cands.map((c) => [c.id, computeSimilarity(clientProfile, c)]));
    const payload = { ranking: rankCompetitors({ candidates: cands, similarities: sims }), similarity: sims.get("c-1"), candidate: cands[0] };
    const forbidden = ["chainOfThought", "reasoning", "thoughts", "scratchpad", "hidden", "cot"];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o !== null && typeof o === "object") {
        for (const k of Object.keys(o)) {
          expect(forbidden).not.toContain(k);
          walk((o as Record<string, unknown>)[k]);
        }
      }
    };
    walk(payload);
  });
});
