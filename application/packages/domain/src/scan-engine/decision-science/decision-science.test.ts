/* =============================================================================
 * Sprint 9 · Recommendation Engine & Decision Science — deterministic tests.
 *
 * Model validation, factor normalization, missing-data behaviour, expected value,
 * priority, uncertainty penalties, dependencies, ranking, portfolio, scenarios,
 * sensitivity, DecisionBrief, pipeline lineage, and run-to-run determinism.
 * Includes the AIS-003 §08 worked example (A must outrank B).
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type {
  DependencyEdge,
  EvidenceConfidence,
  PipelineFinding,
  PipelineRecommendationCandidate,
  PortfolioConstraints,
  Provenance,
  EngineRecommendation,
} from "@brightloop/schema";
import { buildProvenance } from "../evidence/index.js";
import { newArtifactRegistry, recordArtifact } from "../pipeline-run/artifacts.js";
import { buildRecommendations, deriveTimeHorizon, deriveProbabilityOfSuccess, ALIGNMENT_LIMITATION } from "./model.js";
import { computeFactors, factorValue, unavailableFactors, DEFAULT_REVERSIBILITY } from "./factors.js";
import { assessUncertainty, permittedTier, FLAG_PENALTY } from "./uncertainty.js";
import { computeExpectedValue, HORIZON_DISCOUNT } from "./expected-value.js";
import { computePriority, normalizePriority, DEFAULT_WEIGHTS, CRITICAL_RISK_FLOOR, weightsSumToOne } from "./priority.js";
import { analyzeDependencies, conflictsFor, prerequisitesOf } from "./dependencies.js";
import { rankRecommendations } from "./ranking.js";
import { selectPortfolio } from "./portfolio.js";
import { buildScenario, buildAllScenarios, SCENARIO_WEIGHTS } from "./scenarios.js";
import { analyzeSensitivity, perturbWeights } from "./sensitivity.js";
import { buildDecisionBrief } from "./brief.js";
import { runDecisionScience, recordDecisionScienceArtifacts } from "./integration.js";

const NOW = "2026-07-20T00:00:00.000Z";
const prov = (): Provenance => buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler" });
const conf = (v: number): EvidenceConfidence => ({
  value: v,
  band: v >= 80 ? "very_high" : v >= 60 ? "high" : v >= 40 ? "moderate" : "low",
  inputs: { coverage: v / 100, reliability: v / 100, freshness: v / 100, agreement: v / 100, completeness: v / 100, provenanceQuality: v / 100 },
});

/* ---- fixtures -------------------------------------------------------------- */
function finding(over: Partial<PipelineFinding> = {}): PipelineFinding {
  return {
    id: "f-1", pipelineRunId: "run-1", title: "No analytics tag", domain: "digital_presence",
    evidenceIds: ["ev-1", "ev-2"], graphNodeIds: ["n-1"], evidenceState: "observed", confidence: conf(90),
    severity: "high", priority: 80, businessImpact: "Cannot measure funnel drop-off.", limitations: [],
    contradictionStatus: "none", provenance: prov(), ...over,
  };
}
function candidate(over: Partial<PipelineRecommendationCandidate> = {}): PipelineRecommendationCandidate {
  return {
    id: "c-1", pipelineRunId: "run-1", findingIds: ["f-1"], evidenceIds: ["ev-1", "ev-2"],
    targetDomains: ["digital_presence"], tier: "quick_win", impact: 80, effort: 30, confidence: conf(90),
    dependencies: [], risks: [], expectedOutcome: "Install analytics", limitations: [], reviewRequired: true, ...over,
  };
}
const modelOpts = (over: Record<string, unknown> = {}) => ({ scanId: "scan-1", clientId: null, idFor: (_c: PipelineRecommendationCandidate, i: number) => `r-${i + 1}`, ...over });

function rec(over: Partial<EngineRecommendation> = {}): EngineRecommendation {
  const { recommendations } = buildRecommendations([candidate()], [finding()], modelOpts());
  return { ...recommendations[0]!, ...over };
}

/* ===== 1 · model =========================================================== */
describe("recommendation model", () => {
  it("builds from a candidate + finding, inheriting evidence and provenance", () => {
    const { recommendations, rejected } = buildRecommendations([candidate()], [finding()], modelOpts());
    expect(rejected).toEqual([]);
    const r = recommendations[0]!;
    expect(r.findingIds).toEqual(["f-1"]);
    expect(r.evidenceIds).toEqual(["ev-1", "ev-2"]);
    expect(r.graphNodeIds).toEqual(["n-1"]);
    expect(r.tier).toBe("quick_win");
    expect(r.reviewRequired).toBe(true);
    expect(r.limitations).toContain(ALIGNMENT_LIMITATION); // declared default, not silent
  });

  it("rejects a candidate with no resolvable finding or no evidence", () => {
    const a = buildRecommendations([candidate({ findingIds: ["missing"] })], [finding()], modelOpts());
    expect(a.recommendations).toHaveLength(0);
    expect(a.rejected[0]!.reason).toContain("no linked finding");
    const b = buildRecommendations([candidate({ evidenceIds: [] })], [finding()], modelOpts());
    expect(b.rejected[0]!.reason).toContain("no linked evidence");
  });

  it("derives horizon and probability deterministically", () => {
    expect(deriveTimeHorizon(10, 0)).toBe("days");
    expect(deriveTimeHorizon(30, 1)).toBe("weeks");
    expect(deriveTimeHorizon(90, 2)).toBe("quarter_plus");
    expect(deriveProbabilityOfSuccess(90, "observed")).toBeCloseTo(0.9);
    expect(deriveProbabilityOfSuccess(99, "inferred")).toBeCloseTo(0.6); // state caps it
  });
});

/* ===== 2 · factors ========================================================= */
describe("scoring factors", () => {
  it("produces all twelve normalized factors", () => {
    const set = computeFactors(rec());
    expect(set.factors).toHaveLength(12);
    for (const f of set.factors) {
      if (f.value !== null) {
        expect(f.value).toBeGreaterThanOrEqual(0);
        expect(f.value).toBeLessThanOrEqual(100);
      }
    }
    expect(factorValue(set, "business_impact")).toBe(80);
  });

  it("marks financial impact unavailable rather than defaulting it to zero", () => {
    const set = computeFactors(rec());
    const fin = set.factors.find((f) => f.key === "financial_impact")!;
    expect(fin.value).toBeNull();
    expect(fin.missingDataTreatment).toBe("unavailable");
    expect(fin.limitations.length).toBeGreaterThan(0);
    expect(unavailableFactors(set)).toContain("financial_impact");
  });

  it("labels policy defaults explicitly", () => {
    const set = computeFactors(rec());
    const rev = set.factors.find((f) => f.key === "reversibility")!;
    expect(rev.value).toBe(DEFAULT_REVERSIBILITY);
    expect(rev.missingDataTreatment).toBe("policy_default");
  });

  it("uses supplied inputs when present", () => {
    const set = computeFactors(rec(), { financialImpact: 70, reversibility: 90 });
    expect(factorValue(set, "financial_impact")).toBe(70);
    expect(set.factors.find((f) => f.key === "reversibility")!.missingDataTreatment).toBe("observed");
  });
});

/* ===== 3 · expected value ================================================== */
describe("expected value", () => {
  it("computes EV = p·I − (1−p)·L and confidence/time adjustments", () => {
    const r = rec({ impact: 80, effort: 30, probabilityOfSuccess: 0.8, confidence: conf(90), timeHorizon: "weeks" });
    const ev = computeExpectedValue(r);
    expect(ev.expectedBenefit).toBeCloseTo(0.8 * 80 - 0.2 * 30); // 58
    expect(ev.confidenceAdjustedExpectedValue).toBeCloseTo(58 * 0.9);
    expect(ev.timeAdjustedValue).toBeCloseTo(58 * 0.9 * HORIZON_DISCOUNT.weeks);
    expect(ev.downsideExposure).toBeCloseTo(0.2 * 30);
  });

  it("never fabricates ROI when financial inputs are absent", () => {
    const ev = computeExpectedValue(rec());
    expect(ev.financialAvailable).toBe(false);
    expect(ev.financialExpectedValue).toBeNull();
    expect(ev.roiRange).toBeNull();
    expect(ev.limitations.join(" ")).toContain("NOT estimated");
    expect(ev.expectedBenefit).toBeGreaterThan(0); // non-financial model still available
  });

  it("computes an ROI band (not a point) when cost is supplied", () => {
    const ev = computeExpectedValue(rec(), { financialBenefit: 10_000, costRange: { low: 1_000, high: 2_000 } });
    expect(ev.financialAvailable).toBe(true);
    expect(ev.roiRange).not.toBeNull();
    expect(ev.roiRange!.high).toBeGreaterThan(ev.roiRange!.low);
  });

  it("withholds ROI when only benefit is known", () => {
    const ev = computeExpectedValue(rec(), { financialBenefit: 10_000 });
    expect(ev.roiRange).toBeNull();
    expect(ev.limitations.join(" ")).toContain("Cost range unavailable");
  });
});

/* ===== 4 · priority ======================================================== */
describe("priority", () => {
  it("uses default weights that sum to 1 and squashes monotonically", () => {
    expect(weightsSumToOne(DEFAULT_WEIGHTS)).toBe(true);
    expect(normalizePriority(0)).toBe(0);
    expect(normalizePriority(1)).toBe(50);
    expect(normalizePriority(10)).toBeGreaterThan(normalizePriority(5)); // order preserved
  });

  it("reports contributions, formula version, and structured rationale", () => {
    const r = rec();
    const p = computePriority(r, computeFactors(r));
    expect(p.contributions.length).toBeGreaterThan(0);
    expect(p.formulaVersion).toBe("ais-003-1.0");
    expect(p.rationale.confidenceScaled).toBe(true);
    expect(p.rationale.dominantFactors.length).toBeGreaterThan(0);
    // structured only — no free-form reasoning field
    expect(Object.keys(p)).not.toContain("reasoning");
  });

  it("redistributes the weight of an unavailable criterion instead of scoring it zero", () => {
    const r = rec();
    const p = computePriority(r, computeFactors(r));
    const total = p.contributions.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1); // effective weights still sum to 1
  });

  it("lowers priority as confidence falls (never raises it)", () => {
    const hi = rec({ confidence: conf(90) });
    const lo = rec({ confidence: conf(40) });
    const pHi = computePriority(hi, computeFactors(hi));
    const pLo = computePriority(lo, computeFactors(lo));
    expect(pLo.total).toBeLessThan(pHi.total);
  });

  it("floors a critical risk above optimization", () => {
    const r = rec({ tier: "critical_risk", effort: 95, urgency: 10, impact: 10 });
    const p = computePriority(r, computeFactors(r));
    expect(p.total).toBeGreaterThanOrEqual(CRITICAL_RISK_FLOOR);
    expect(p.rationale.criticalRiskOverride).toBe(true);
  });

  it("withholds the critical override for inferred-only evidence", () => {
    const r = rec({ tier: "critical_risk", evidenceState: "inferred" });
    const factors = computeFactors(r);
    const u = assessUncertainty(r, factors);
    const p = computePriority(r, factors, { uncertainty: u });
    expect(p.rationale.criticalRiskOverride).toBe(false);
    expect(p.warnings.join(" ")).toContain("inferred-only");
  });

  /* AIS-003 §08 worked example: A must outrank B despite B's larger raw impact. */
  it("reproduces the AIS-003 worked example (A outranks B)", () => {
    const A = rec({ id: "A", confidence: conf(85), impact: 70, probabilityOfSuccess: 0.8, effort: 30, strategicAlignment: 70, urgency: 100, implementationRisk: 30 });
    const B = rec({ id: "B", confidence: conf(55), impact: 90, probabilityOfSuccess: 0.45, effort: 80, strategicAlignment: 60, urgency: 80, implementationRisk: 60 });
    const pA = computePriority(A, computeFactors(A));
    const pB = computePriority(B, computeFactors(B));
    expect(pA.raw).toBeGreaterThan(pB.raw);
    expect(pA.total).toBeGreaterThan(pB.total); // stronger evidence + lower effort wins
  });
});

/* ===== 5 · uncertainty ===================================================== */
describe("uncertainty", () => {
  it("flags thin evidence, contradiction, low confidence, staleness, inferred-only", () => {
    const r = rec({ evidenceIds: ["ev-1"], contradictionStatus: "contradicted", confidence: conf(40), evidenceState: "inferred" });
    const u = assessUncertainty(r, computeFactors(r), { freshnessBand: "expired" });
    expect(u.flags).toContain("missing_evidence");
    expect(u.flags).toContain("contradictory_evidence");
    expect(u.flags).toContain("low_confidence_estimate");
    expect(u.flags).toContain("stale_evidence");
    expect(u.flags).toContain("inferred_only");
    expect(u.reviewRequired).toBe(true);
    expect(u.blockedFromCritical).toBe(true);
  });

  it("penalties can only reduce — never exceed 1", () => {
    const r = rec();
    const u = assessUncertainty(r, computeFactors(r));
    expect(u.confidencePenalty).toBeLessThanOrEqual(1);
    for (const v of Object.values(FLAG_PENALTY)) expect(v).toBeLessThanOrEqual(1);
  });

  it("treats unavailable financial data as declared, not penalized", () => {
    expect(FLAG_PENALTY.unavailable_financial_data).toBe(1);
  });

  it("bars an inferred-only item from the critical tier", () => {
    const r = rec({ tier: "critical_risk", evidenceState: "inferred" });
    const u = assessUncertainty(r, computeFactors(r));
    expect(permittedTier(r, u)).toBe("strategic_win");
  });
});

/* ===== 6 · dependencies ==================================================== */
describe("dependencies", () => {
  const a = rec({ id: "A" });
  const b = rec({ id: "B", dependencies: ["A"] });
  const c = rec({ id: "C", dependencies: ["B"] });

  it("orders prerequisites before dependents", () => {
    const d = analyzeDependencies([c, b, a]);
    expect(d.acyclic).toBe(true);
    expect(d.order.indexOf("A")).toBeLessThan(d.order.indexOf("B"));
    expect(d.order.indexOf("B")).toBeLessThan(d.order.indexOf("C"));
    expect(prerequisitesOf(d, "B")).toEqual(["A"]);
  });

  it("detects a cycle and withholds the order", () => {
    const x = rec({ id: "X", dependencies: ["Y"] });
    const y = rec({ id: "Y", dependencies: ["X"] });
    const d = analyzeDependencies([x, y]);
    expect(d.acyclic).toBe(false);
    expect(d.order).toEqual([]);
    expect(d.issues.some((i) => i.kind === "cycle")).toBe(true);
  });

  it("flags blocked items whose prerequisite is absent", () => {
    const d = analyzeDependencies([rec({ id: "B", dependencies: ["missing"] })]);
    expect(d.blocked).toEqual(["B"]);
    expect(d.issues.some((i) => i.kind === "unknown_reference")).toBe(true);
  });

  it("detects conflicts, duplicates, and self-references", () => {
    const edges: DependencyEdge[] = [
      { from: "A", to: "B", kind: "conflicts_with", note: null },
      { from: "A", to: "B", kind: "duplicates", note: null },
      { from: "A", to: "A", kind: "requires", note: null },
    ];
    const d = analyzeDependencies([a, b], edges);
    expect(d.issues.some((i) => i.kind === "conflict")).toBe(true);
    expect(d.issues.some((i) => i.kind === "duplicate")).toBe(true);
    expect(d.issues.some((i) => i.kind === "self_reference")).toBe(true);
    expect(conflictsFor(d, "A")).toEqual(["B"]);
  });
});

/* ===== 7 · ranking ========================================================= */
describe("ranking", () => {
  function rankOf(recs: EngineRecommendation[], blockedIds: string[] = []) {
    const priorities = new Map(recs.map((r) => [r.id, computePriority(r, computeFactors(r))]));
    return rankRecommendations({ recommendations: recs, priorities, blockedIds });
  }

  it("puts actionable before blocked", () => {
    const hi = rec({ id: "HI", impact: 95 });
    const lo = rec({ id: "LO", impact: 10 });
    const r = rankOf([hi, lo], ["HI"]);
    expect(r.ranked[0]!.recommendationId).toBe("LO");
    expect(r.ranked[1]!.blocked).toBe(true);
    expect(r.blocked).toEqual(["HI"]);
  });

  it("puts critical risks first", () => {
    const crit = rec({ id: "CRIT", tier: "critical_risk", impact: 10, effort: 90 });
    const big = rec({ id: "BIG", impact: 95, effort: 10 });
    expect(rankOf([big, crit]).ranked[0]!.recommendationId).toBe("CRIT");
  });

  it("breaks exact ties by stable id", () => {
    const z = rec({ id: "z-item" });
    const a = rec({ id: "a-item" });
    const r = rankOf([z, a]);
    expect(r.ranked[0]!.recommendationId).toBe("a-item");
    expect(r.ranked[0]!.comparisonToNext).toBe("stable_id_tiebreak");
  });

  it("is deterministic across repeated runs and input orders", () => {
    const items = [rec({ id: "A", impact: 60 }), rec({ id: "B", impact: 80 }), rec({ id: "C", impact: 70 })];
    const one = rankOf(items).ranked.map((r) => r.recommendationId);
    const two = rankOf([...items].reverse()).ranked.map((r) => r.recommendationId);
    expect(one).toEqual(two);
  });

  it("emits a structured comparison reason, not prose", () => {
    const r = rankOf([rec({ id: "A", impact: 90 }), rec({ id: "B", impact: 20 })]);
    expect(r.ranked[0]!.comparisonToNext).toMatch(/priority|confidence|critical|actionable|expected|time|stable/);
  });
});

/* ===== 8 · portfolio ======================================================= */
describe("portfolio", () => {
  const constraints = (over: Partial<PortfolioConstraints> = {}): PortfolioConstraints => ({
    budgetCeiling: null, capacityCeiling: null, timeHorizon: null, riskTolerance: "moderate", requiredDomains: [], excludedRecommendationIds: [], ...over,
  });
  function build(recs: EngineRecommendation[], c: PortfolioConstraints, edges: DependencyEdge[] = []) {
    const priorities = new Map(recs.map((r) => [r.id, computePriority(r, computeFactors(r))]));
    return selectPortfolio({ id: "pf-1", recommendations: recs, priorities, dependencies: analyzeDependencies(recs, edges), constraints: c });
  }

  it("respects the budget ceiling and defers the rest", () => {
    const p = build([rec({ id: "A", effort: 40 }), rec({ id: "B", effort: 40 }), rec({ id: "C", effort: 40 })], constraints({ budgetCeiling: 80 }));
    expect(p.selected.length).toBeLessThanOrEqual(2);
    expect(p.deferred.length).toBeGreaterThan(0);
    expect(p.aggregateEffort).toBeLessThanOrEqual(80);
  });

  it("respects the capacity ceiling", () => {
    const p = build([rec({ id: "A", effort: 60 }), rec({ id: "B", effort: 60 })], constraints({ capacityCeiling: 60 }));
    expect(p.selected).toHaveLength(1);
  });

  it("pins critical risks despite budget pressure", () => {
    const p = build([rec({ id: "CRIT", tier: "critical_risk", effort: 90 })], constraints({ budgetCeiling: 10 }));
    expect(p.selected).toContain("CRIT");
    expect(p.warnings.join(" ")).toContain("pinned as a critical risk");
  });

  it("pulls prerequisites in with their dependent", () => {
    const p = build([rec({ id: "A", effort: 10 }), rec({ id: "B", effort: 10, dependencies: ["A"] })], constraints());
    expect(p.selected).toContain("A");
    expect(p.dependencyOrder.indexOf("A")).toBeLessThan(p.dependencyOrder.indexOf("B"));
  });

  it("excludes items over the risk tolerance and warns on uncovered required domains", () => {
    const p = build([rec({ id: "RISKY", implementationRisk: 95 })], constraints({ riskTolerance: "low", requiredDomains: ["growth"] }));
    expect(p.selected).not.toContain("RISKY");
    expect(p.warnings.join(" ")).toContain("risk tolerance");
    expect(p.warnings.join(" ")).toContain("growth");
  });

  it("never selects two conflicting recommendations", () => {
    const edges: DependencyEdge[] = [{ from: "A", to: "B", kind: "conflicts_with", note: null }];
    const p = build([rec({ id: "A", impact: 90 }), rec({ id: "B", impact: 80 })], constraints(), edges);
    expect(p.selected).toHaveLength(1);
  });
});

/* ===== 9 · scenarios ======================================================= */
describe("scenarios", () => {
  const recs = [
    rec({ id: "Q", tier: "quick_win", effort: 20, timeHorizon: "days" }),
    rec({ id: "S", tier: "strategic_win", effort: 80, timeHorizon: "quarter_plus" }),
    rec({ id: "C", tier: "critical_risk", implementationRisk: 80 }),
  ];
  const priorities = new Map(recs.map((r) => [r.id, computePriority(r, computeFactors(r))]));
  const deps = analyzeDependencies(recs);

  it("builds all six scenarios with documented filters and weights", () => {
    const all = buildAllScenarios(recs, priorities, deps);
    expect(all).toHaveLength(6);
    for (const s of all) {
      expect(s.rationale.filter.length).toBeGreaterThan(0);
      expect(s.rationale.weights).toEqual(SCENARIO_WEIGHTS[s.kind]);
    }
  });

  it("selects only matching existing recommendations", () => {
    expect(buildScenario({ kind: "quick_wins", recommendations: recs, priorities, dependencies: deps }).selected).toContain("Q");
    expect(buildScenario({ kind: "minimum_viable_intervention", recommendations: recs, priorities, dependencies: deps }).selected).toEqual(["C"]);
  });

  it("never invents a recommendation to fill an empty scenario", () => {
    const s = buildScenario({ kind: "minimum_viable_intervention", recommendations: [rec({ id: "Q", tier: "quick_win" })], priorities, dependencies: deps });
    expect(s.selected).toEqual([]);
    expect(s.limitations.join(" ")).toContain("none was invented");
  });

  it("reports unresolved dependencies falling outside the scenario", () => {
    const inner = [rec({ id: "Q", tier: "quick_win", effort: 20, timeHorizon: "days", dependencies: ["S"] }), rec({ id: "S", tier: "strategic_win", effort: 80 })];
    const pr = new Map(inner.map((r) => [r.id, computePriority(r, computeFactors(r))]));
    const s = buildScenario({ kind: "quick_wins", recommendations: inner, priorities: pr, dependencies: analyzeDependencies(inner) });
    expect(s.unresolvedDependencies).toContain("S");
  });
});

/* ===== 10 · sensitivity ==================================================== */
describe("sensitivity", () => {
  const recs = [rec({ id: "A", impact: 90, effort: 20 }), rec({ id: "B", impact: 30, effort: 80 })];
  const factorSets = new Map(recs.map((r) => [r.id, computeFactors(r)]));

  it("re-normalizes perturbed weights to sum to 1", () => {
    const w = perturbWeights(DEFAULT_WEIGHTS, "impact", 0.05);
    expect(weightsSumToOne(w)).toBe(true);
  });

  it("reports stability, spread, and stable items", () => {
    const s = analyzeSensitivity({ recommendations: recs, factorSets });
    expect(s.entries).toHaveLength(2);
    expect(s.rankingStability).toBeGreaterThanOrEqual(0);
    expect(s.rankingStability).toBeLessThanOrEqual(1);
    expect(s.delta).toBe(0.05);
    for (const e of s.entries) expect(e.rankSpread).toBe(e.maxRank - e.minRank);
  });

  it("finds a clear separation stable", () => {
    const s = analyzeSensitivity({ recommendations: recs, factorSets });
    expect(s.rankingStability).toBe(1); // A dominates B on every weighting
    expect(s.stableAcrossScenarios).toEqual(["A", "B"]);
    expect(s.mostSensitive).toEqual([]);
  });

  it("is deterministic", () => {
    expect(analyzeSensitivity({ recommendations: recs, factorSets })).toEqual(analyzeSensitivity({ recommendations: recs, factorSets }));
  });
});

/* ===== 11 · decision brief ================================================= */
describe("decision brief", () => {
  it("assembles from ranked inputs with versions and approvals", () => {
    const recs = [rec({ id: "A", tier: "quick_win" }), rec({ id: "B", tier: "critical_risk" })];
    const priorities = new Map(recs.map((r) => [r.id, computePriority(r, computeFactors(r))]));
    const deps = analyzeDependencies(recs);
    const ranking = rankRecommendations({ recommendations: recs, priorities });
    const evs = new Map(recs.map((r) => [r.id, computeExpectedValue(r)]));
    const brief = buildDecisionBrief({ id: "brief-1", scanId: "scan-1", recommendations: recs, ranking, dependencies: deps, expectedValues: evs, now: NOW });

    expect(brief.criticalRisks).toContain("B");
    expect(brief.quickWins).toContain("A");
    expect(brief.requiredHumanApprovals.sort()).toEqual(["A", "B"]); // all human-gated
    expect(brief.modelVersions.formulaVersion).toBe("ais-003-1.0");
    expect(brief.expectedValueSummary.financialAvailable).toBe(false);
    expect(brief.expectedValueSummary.itemsWithoutFinancialData.sort()).toEqual(["A", "B"]);
    expect(brief.limitations.join(" ")).toContain("ROI is not estimated");
  });
});

/* ===== 12 · pipeline integration + determinism ============================ */
describe("pipeline integration", () => {
  const input = () => ({
    scanId: "scan-1",
    clientId: null,
    pipelineRunId: "run-1",
    candidates: [candidate({ id: "c-1" }), candidate({ id: "c-2", tier: "critical_risk", impact: 60, effort: 70 })],
    findings: [finding()],
    model: modelOpts(),
    idFor: (p: string) => `${p}-1`,
    now: NOW,
  });

  it("runs the full stage and produces every output", () => {
    const r = runDecisionScience(input());
    expect(r.recommendations.length).toBe(2);
    expect(r.priorities.length).toBe(2);
    expect(r.expectedValues.length).toBe(2);
    expect(r.ranking.ranked.length).toBe(2);
    expect(r.portfolio).not.toBeNull();
    expect(r.scenarios).toHaveLength(6);
    expect(r.sensitivity).not.toBeNull();
    expect(r.decisionBrief).not.toBeNull();
    expect(r.events.some((e) => e.type === "recommendation.decision_brief_created")).toBe(true);
  });

  it("adds a NEW artifact preserving lineage without mutating upstream ones", () => {
    const reg = newArtifactRegistry();
    const findingsArtifact = recordArtifact(reg, { id: "a-findings", pipelineRunId: "run-1", scanId: "scan-1", kind: "findings", payload: [finding()], now: NOW, validationStatus: "valid" });
    const candArtifact = recordArtifact(reg, { id: "a-cand", pipelineRunId: "run-1", scanId: "scan-1", kind: "recommendation_candidates", payload: [candidate()], now: NOW, validationStatus: "valid" });
    const beforeChecksum = candArtifact.checksum;

    const result = runDecisionScience(input());
    const written = recordDecisionScienceArtifacts(reg, result, { pipelineRunId: "run-1", scanId: "scan-1", idFor: (p) => `${p}-new`, now: NOW });

    expect(written).toHaveLength(1);
    const added = reg.byId.get(written[0]!)!;
    expect(added.sourceArtifactIds).toContain(findingsArtifact.id);
    expect(added.version).toBe(2); // a new version, not an in-place edit
    expect(reg.byId.get("a-cand")!.checksum).toBe(beforeChecksum); // upstream untouched
    expect(reg.byId.get("a-findings")!.validationStatus).toBe("valid");
  });

  it("produces identical output for identical input", () => {
    expect(runDecisionScience(input())).toEqual(runDecisionScience(input()));
  });

  it("exposes no hidden chain-of-thought fields anywhere", () => {
    const r = runDecisionScience(input());
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
    walk(r);
  });
});
