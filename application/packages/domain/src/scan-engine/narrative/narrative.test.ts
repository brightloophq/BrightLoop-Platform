/* =============================================================================
 * Sprint 12 · Report & Narrative Engine — deterministic tests.
 *
 * Request/audience/tone policy, claim validation and safety guards, citations,
 * confidence language, the six builders, redaction, length limits, artifact
 * assembly, versioning/approval, pipeline lineage, and determinism.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type {
  CompetitorSnapshot,
  DecisionBrief,
  EngineRecommendation,
  EvidenceConfidence,
  InternalIntelligenceReport,
  MarketPosition,
  NarrativeAudience,
  PipelineFinding,
  Provenance,
} from "@brightloop/schema";
import { buildProvenance } from "../evidence/index.js";
import { newArtifactRegistry, recordArtifact } from "../pipeline-run/artifacts.js";
import { newNarrativeRequest, validateNarrativeRequest } from "./request.js";
import { audiencePolicy, tonePolicy, bandFor, permittedBand, certaintyPhrase, isPermittedPhrase, lengthBudget, sensitivityPermitted, sectionPermitted, CONFIDENCE_LANGUAGE } from "./policy.js";
import { buildClaim, statement, renderTemplate, validateClaim, screenClaims, visibleTo } from "./claims.js";
import { buildCitation, validateCitations, orderCitations, dedupeCitations, uncitedMaterialClaims, citationsFor } from "./citations.js";
import { buildSection, truncateSection, buildCompetitorSection, buildRecommendationSection, buildProposalSection } from "./sections.js";
import { applyRedaction, lockedSections, localeProfile, localizeTerm, PUBLIC_FORBIDDEN_SECTIONS } from "./redaction.js";
import { buildInternalOperatorReport, buildExecutiveSummary, buildClientDiagnosis, buildBoardSummary, buildPublicPreview, buildProposalNarrative, type BuilderContext } from "./builders.js";
import { buildNarrativeArtifact, narrativeChecksum, canNarrativeTransition, transitionNarrative, reviseNarrative, detectChanges } from "./artifact.js";
import { runNarrativeStage, recordNarrativeArtifact } from "./integration.js";

const NOW = "2026-07-20T00:00:00.000Z";
const prov = (): Provenance => buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler" });
const conf = (v: number): EvidenceConfidence => ({
  value: v, band: v >= 80 ? "very_high" : v >= 60 ? "high" : v >= 40 ? "moderate" : "low",
  inputs: { coverage: v / 100, reliability: v / 100, freshness: v / 100, agreement: v / 100, completeness: v / 100, provenanceQuality: v / 100 },
});

/* ---- fixtures -------------------------------------------------------------- */
function finding(over: Partial<PipelineFinding> = {}): PipelineFinding {
  return {
    id: "f-1", pipelineRunId: "run-1", title: "No analytics tag", domain: "digital_presence",
    evidenceIds: ["ev-1"], graphNodeIds: ["n-1"], evidenceState: "observed", confidence: conf(85),
    severity: "high", priority: 80, businessImpact: "Cannot measure funnel.", limitations: [],
    contradictionStatus: "none", provenance: prov(), ...over,
  };
}
function report(over: Partial<InternalIntelligenceReport> = {}): InternalIntelligenceReport {
  return {
    id: "rep-1", pipelineRunId: "run-1", scanId: "scan-1", generatedAt: NOW, schemaVersion: "1.0",
    executiveOverview: "overview", businessProfile: {}, indexSummary: { overall: 60, byDimension: {} },
    domainSummaries: [{ domain: "digital_presence", summary: "1 finding", score: 60, confidence: null, findingIds: ["f-1"] }],
    findingsLedger: [finding()], evidenceCoverage: null, confidenceSummary: conf(80), conflicts: [],
    strongestRisks: ["f-1"], highestConfidenceOpportunities: [], recommendationCandidates: [],
    unavailableData: ["competitor pricing"], limitations: ["thin evidence"], provenance: {},
    pipelineMetadata: { runId: "run-1", completedStages: [], estimatedSpend: 0, actualSpend: 0, artifactIds: [] },
    ...over,
  };
}
function rec(over: Partial<EngineRecommendation> = {}): EngineRecommendation {
  return {
    id: "r-1", scanId: "scan-1", clientId: null, title: "Install analytics", problemStatement: "No visibility",
    proposedAction: "Deploy analytics", findingIds: ["f-1"], evidenceIds: ["ev-1"], graphNodeIds: [],
    affectedDomains: ["digital_presence"], tier: "quick_win", impact: 80, effort: 30, urgency: 70,
    strategicAlignment: 50, confidence: conf(85), implementationRisk: 25, probabilityOfSuccess: 0.85,
    timeHorizon: "weeks", dependencies: [], constraints: [], expectedOutcomes: ["visibility"],
    successMetrics: [], reviewCycle: "on_rescan", ownerRole: null, evidenceState: "observed",
    limitations: [], contradictionStatus: "none", provenance: prov(), reviewRequired: false, ...over,
  };
}
function snapshot(supports: boolean): CompetitorSnapshot {
  return {
    id: "snap-1", scanId: "scan-1", clientId: null, selectedCompetitorIds: ["c-1", "c-2"],
    rejectedCandidateIds: [], benchmarkSummary: {}, gapSummary: {}, marketPosition: null,
    setConfidence: { score: supports ? 80 : 20, band: supports ? "high" : "low", contributions: [], supportsMarketClaims: supports, limitations: [], warnings: [], formulaVersion: "ais-005-1.0" },
    checksum: "abc", generatedAt: NOW, sourceArtifactIds: [], formulaVersions: {},
  };
}
function marketPosition(supports: boolean): MarketPosition {
  return {
    scanId: "scan-1", overallPercentile: supports ? 82 : null, dimensionPercentiles: { website_performance: 82 },
    strongestDimensions: ["website_performance"], weakestDimensions: [], parityDimensions: [],
    defensibleAdvantages: supports ? ["website_performance"] : [], materialDeficits: [], confidence: supports ? 80 : 20,
    evidenceCoverage: supports ? 0.9 : 0.2, competitorSetQuality: supports ? 80 : 20, unavailableDimensions: [],
    supportsMarketClaims: supports, limitations: [], provenance: {}, formulaVersion: "ais-005-1.0",
  };
}
const brief = (): DecisionBrief => ({
  id: "brief-1", scanId: "scan-1", pipelineRunId: "run-1", generatedAt: NOW,
  executiveDecisionSummary: "summary", highestPriority: ["r-1"], criticalRisks: [], quickWins: ["r-1"],
  strategicInitiatives: [], blockedItems: [], dependencySequence: [], scenarioComparison: [],
  expectedValueSummary: { totalConfidenceAdjustedValue: 0, financialAvailable: false, itemsWithoutFinancialData: [] },
  confidenceSummary: { mean: 85, lowest: 85, lowConfidenceIds: [] }, evidenceGaps: [], limitations: [],
  requiredHumanApprovals: ["r-1"], provenance: {}, modelVersions: { schemaVersion: "1.0", formulaVersion: "ais-003-1.0", weights: { impact: 0.35, opportunity: 0.25, riskReduction: 0.2, strategicAlignment: 0.2 } },
});

const request = (audience: NarrativeAudience, over = {}) =>
  newNarrativeRequest({ id: `nr-${audience}`, scanId: "scan-1", clientId: null, audience, purpose: "diagnosis", sourceArtifactIds: ["a-1"], createdAt: NOW, ...over });

function ctx(audience: NarrativeAudience, inputs = {}): BuilderContext {
  return {
    request: request(audience),
    inputs: { report: report(), decisionBrief: brief(), recommendations: [rec()], ...inputs },
    idFor: (p: string) => `${p}-1`,
    now: NOW,
  };
}

const claim = (over: Partial<Parameters<typeof buildClaim>[0]> = {}) =>
  buildClaim({ id: "cl-1", type: "factual", statement: statement("Analytics is missing."), evidenceIds: ["ev-1"], evidenceState: "observed", confidence: 85, sensitivity: "client", ...over });

/* ===== 1 · request ========================================================= */
describe("narrative request", () => {
  it("defaults from the audience policy", () => {
    const r = request("executive");
    expect(r.toneProfile).toBe(audiencePolicy("executive").toneProfile);
    expect(r.detailLevel).toBe("summary");
    expect(r.confidentialityLevel).toBe("internal");
    expect(request("public_visitor").confidentialityLevel).toBe("public");
  });

  it("rejects untraceable requests and over-permissive confidentiality", () => {
    expect(validateNarrativeRequest(request("client"))).toEqual([]);
    expect(validateNarrativeRequest(request("client", { sourceArtifactIds: [] })).join(" ")).toContain("untraceable");
    expect(validateNarrativeRequest(request("public_visitor", { confidentialityLevel: "internal" })).join(" ")).toContain("exceeds the ceiling");
  });

  it("rejects sections not permitted for the audience", () => {
    expect(validateNarrativeRequest(request("public_visitor", { requestedSections: ["competitor_summary"] })).join(" ")).toContain("not permitted");
  });
});

/* ===== 4 + 5 + 10 · policy ================================================= */
describe("audience, tone and confidence policy", () => {
  it("gives each audience a distinct detail and sensitivity ceiling", () => {
    expect(audiencePolicy("internal_operator").maxSensitivity).toBe("confidential");
    expect(audiencePolicy("public_visitor").maxSensitivity).toBe("public");
    expect(audiencePolicy("internal_operator").maxTotalSentences).toBeGreaterThan(audiencePolicy("board").maxTotalSentences);
    expect(sensitivityPermitted("internal", "public_visitor")).toBe(false);
    expect(sensitivityPermitted("public", "public_visitor")).toBe(true);
    expect(sectionPermitted("competitor_summary", "public_visitor")).toBe(false);
  });

  it("maps confidence to bands and caps certainty language", () => {
    expect(bandFor(90)).toBe("very_high");
    expect(bandFor(10)).toBe("very_low");
    expect(CONFIDENCE_LANGUAGE.very_low[0]).toBe("insufficient evidence");
    expect(certaintyPhrase(90)).toBe("strongly supported");
    expect(certaintyPhrase(30)).toBe("limited evidence suggests");
    // a tone cap may only WEAKEN, never strengthen
    expect(permittedBand("very_high", "moderate")).toBe("moderate");
    expect(permittedBand("low", "very_high")).toBe("low");
    expect(certaintyPhrase(95, "moderate")).toBe("evidence suggests");
  });

  it("rejects language stronger than the source confidence", () => {
    expect(isPermittedPhrase("strongly supported", 90)).toBe(true);
    expect(isPermittedPhrase("strongly supported", 30)).toBe(false);
    expect(isPermittedPhrase("insufficient evidence", 90)).toBe(true); // weaker is always allowed
  });

  it("persuasive_safe caps certainty below the top band", () => {
    expect(tonePolicy("persuasive_safe").maxCertaintyBand).toBe("moderate");
    expect(tonePolicy("analytical").maxCertaintyBand).toBe("very_high");
  });

  it("scales the length budget by audience and detail", () => {
    const full = lengthBudget("internal_operator", "analytical", "full");
    const minimal = lengthBudget("public_visitor", "plain_language", "minimal");
    expect(full.maxTotalSentences).toBeGreaterThan(minimal.maxTotalSentences);
  });
});

/* ===== 3 + 7 · claims & safety ============================================ */
describe("claims and claim safety", () => {
  const base = { audience: "client" as NarrativeAudience };

  it("renders templates deterministically", () => {
    expect(renderTemplate("{a} and {b}", { a: "x", b: 2 })).toBe("x and 2");
    expect(renderTemplate("{missing}", {})).toBe("unavailable"); // never invented
  });

  it("accepts a well-formed factual claim", () => {
    expect(validateClaim(claim(), base)).toEqual([]);
  });

  it("rejects a claim with no evidence", () => {
    expect(validateClaim(claim({ evidenceIds: [] }), base).map((r) => r.reason)).toContain("unsupported_claim");
  });

  it("requires observed evidence for factual claims", () => {
    const r = validateClaim(claim({ evidenceState: "inferred", limitations: ["inferred"] }), base);
    expect(r.map((x) => x.reason)).toContain("unsupported_claim");
  });

  it("requires an estimation basis and causal support", () => {
    expect(validateClaim(claim({ type: "estimated", evidenceState: "estimated", limitations: ["est"] }), base).map((r) => r.reason)).toContain("unsupported_claim");
    expect(validateClaim(claim({ type: "causal" }), base).map((r) => r.reason)).toContain("unsupported_causal_claim");
    expect(validateClaim(claim({ type: "causal", causalSupport: ["f-1 precedes f-2"] }), base)).toEqual([]);
  });

  it("never lets unavailable data carry certainty", () => {
    expect(validateClaim(claim({ type: "unavailable", confidence: 80, evidenceIds: [] }), base).map((r) => r.reason)).toContain("overstated_certainty");
  });

  it("rejects overstated certainty language", () => {
    const c = claim({ statement: statement("This is strongly supported."), confidence: 20 });
    expect(validateClaim(c, base).map((r) => r.reason)).toContain("overstated_certainty");
  });

  it("rejects stale evidence presented as current and omitted limitations", () => {
    expect(validateClaim(claim({ freshnessBand: "expired" }), base).map((r) => r.reason)).toContain("stale_evidence_as_current");
    expect(validateClaim(claim({ type: "inferred", evidenceState: "inferred" }), base).map((r) => r.reason)).toContain("omitted_limitations");
  });

  it("rejects fabricated metrics and competitors", () => {
    const metric = claim({ statement: statement("Score is {score}.", { score: 42 }) });
    expect(validateClaim(metric, { ...base, knownMetricKeys: [] }).map((r) => r.reason)).toContain("fabricated_metric");
    expect(validateClaim(metric, { ...base, knownMetricKeys: ["score"] })).toEqual([]);

    const comp = claim({ statement: statement("{competitorName} leads.", { competitorName: "ghost" }) });
    expect(validateClaim(comp, { ...base, validatedCompetitorIds: ["c-1"] }).map((r) => r.reason)).toContain("fabricated_competitor");
  });

  it("blocks market-leader claims without the competitor-set gate", () => {
    const c = claim({ statement: statement("The client is the market leader.") });
    expect(validateClaim(c, base).map((r) => r.reason)).toContain("market_leader_without_confidence");
    expect(validateClaim(c, { ...base, competitorSetSupportsMarketClaims: true })).toEqual([]);
  });

  it("blocks financial and ROI claims without inputs", () => {
    expect(validateClaim(claim({ statement: statement("Revenue will grow.") }), base).map((r) => r.reason)).toContain("financial_claim_without_inputs");
    expect(validateClaim(claim({ statement: statement("ROI is strong.") }), { ...base, financialInputsAvailable: true }).map((r) => r.reason)).toContain("roi_without_cost_benefit");
  });

  it("blocks confidential leakage and internal terminology in public output", () => {
    expect(validateClaim(claim({ sensitivity: "confidential" }), base).map((r) => r.reason)).toContain("confidential_leakage");
    const c = claim({ sensitivity: "public", statement: statement("The scan pipeline run failed.") });
    expect(validateClaim(c, { audience: "public_visitor", internalTerminology: ["pipeline run"] }).map((r) => r.reason)).toContain("internal_terminology_in_public");
  });

  it("screens a claim set and filters by audience visibility", () => {
    const { accepted, rejected } = screenClaims([claim(), claim({ id: "cl-2", evidenceIds: [] })], base);
    expect(accepted.map((c) => c.id)).toEqual(["cl-1"]);
    expect(rejected.length).toBeGreaterThan(0);
    expect(visibleTo([claim({ sensitivity: "internal" })], "public_visitor")).toHaveLength(0);
  });
});

/* ===== 6 · citations ======================================================= */
describe("citations", () => {
  const cite = (over = {}) => buildCitation({ id: "ct-1", target: "evidence", targetId: "ev-1", evidenceState: "observed", ...over });

  it("orders by target class then id", () => {
    const ordered = orderCitations([cite({ id: "ct-2", target: "recommendation", targetId: "r-1" }), cite()]);
    expect(ordered[0]!.target).toBe("evidence");
  });

  it("removes duplicates on (target, targetId)", () => {
    const { unique, removed } = dedupeCitations([cite(), cite({ id: "ct-2" })]);
    expect(unique).toHaveLength(1);
    expect(removed).toEqual(["ct-2"]);
  });

  it("rejects unavailable sources and flags stale ones", () => {
    const r = validateCitations({ citations: [cite({ id: "ct-a", evidenceState: "unavailable" }), cite({ id: "ct-b", targetId: "ev-2", freshnessBand: "expired" })], claims: [], audience: "client" });
    expect(r.rejected.some((x) => x.citationId === "ct-a")).toBe(true);
    expect(r.staleWarnings.join(" ")).toContain("ct-b");
  });

  it("scores coverage over material claims and finds uncited ones", () => {
    const c = claim({ citationIds: ["ct-1"] });
    const r = validateCitations({ citations: [cite()], claims: [c], audience: "client" });
    expect(r.coverage).toBe(1);
    expect(uncitedMaterialClaims([claim({ id: "cl-9", citationIds: [] })], ["ct-1"])).toEqual(["cl-9"]);
  });

  it("filters citations by audience visibility", () => {
    expect(citationsFor([cite({ visibleTo: ["internal_operator"] })], "client")).toHaveLength(0);
  });
});

/* ===== 2 + 11 + 12 + 13 · sections ======================================== */
describe("sections", () => {
  it("refuses a section with no traceable source", () => {
    expect(buildSection({ id: "s-1", type: "finding_summary", title: "x", sourceData: {}, body: [], confidence: 50 })).toBeNull();
    expect(buildSection({ id: "s-2", type: "limitations", title: "x", sourceData: {}, body: [], confidence: 50 })).not.toBeNull(); // meta-section
  });

  it("checksums section content deterministically", () => {
    const mk = () => buildSection({ id: "s-1", type: "finding_summary", title: "t", sourceData: { a: 1 }, body: [statement("x")], evidenceIds: ["ev-1"], confidence: 50 })!;
    expect(mk().checksum).toBe(mk().checksum);
  });

  it("truncates without dropping limitations silently", () => {
    const s = buildSection({ id: "s-1", type: "finding_summary", title: "t", sourceData: {}, body: [statement("a"), statement("b"), statement("c")], evidenceIds: ["ev-1"], confidence: 50 })!;
    const { section, truncated } = truncateSection(s, 1);
    expect(truncated).toBe(true);
    expect(section.body).toHaveLength(1);
    expect(section.limitations.join(" ")).toContain("omitted by the length budget");
  });

  it("builds a competitor section, gating market-standing claims", () => {
    const gated = buildCompetitorSection({ id: "s-c", snapshot: snapshot(false), marketPosition: marketPosition(false), toneProfile: "advisory" })!;
    expect(gated.body.map((b) => b.text).join(" ")).not.toContain("percentile");
    expect(gated.limitations.join(" ")).toContain("insufficient to support market-standing claims");
    expect(gated.reviewRequired).toBe(true);

    const allowed = buildCompetitorSection({ id: "s-c2", snapshot: snapshot(true), marketPosition: marketPosition(true), toneProfile: "advisory" })!;
    expect(allowed.body.map((b) => b.text).join(" ")).toContain("percentile");
  });

  it("builds a recommendation section using only present fields", () => {
    const s = buildRecommendationSection({ id: "s-r", recommendations: [rec()], toneProfile: "advisory" })!;
    expect(s.recommendationIds).toEqual(["r-1"]);
    expect(s.body.map((b) => b.text).join(" ")).not.toMatch(/ROI|revenue/i); // never invented
    expect(buildRecommendationSection({ id: "s-r", recommendations: [], toneProfile: "advisory" })).toBeNull();
  });

  it("builds a proposal section with no price and an explicit note", () => {
    const proposal = {
      id: "p-1", version: 1, scope: [], phases: [], milestones: [], optionPackages: [], successMetrics: [],
      executiveSummary: { headline: "headline", keyPoints: [], findingCount: 1, recommendationCount: 1 },
      strategy: { confidence: 80, limitations: [] }, investmentInputs: { limitations: [], budgetUnavailable: true },
      evidenceSummary: { evidenceIds: ["ev-1"] }, validityPeriodDays: null, approvalRequirementsMet: false,
    } as unknown as Parameters<typeof buildProposalSection>[0]["proposal"];
    const s = buildProposalSection({ id: "s-p", proposal, toneProfile: "persuasive_safe" })!;
    expect(s.limitations.join(" ")).toContain("no price is stated");
    expect(s.limitations.join(" ")).toContain("No client budget");
    expect(s.reviewRequired).toBe(true);
  });
});

/* ===== 14 + 15 · redaction & locale ======================================= */
describe("redaction and locale", () => {
  it("redacts forbidden sections for the public with locked labels", () => {
    const s = buildSection({ id: "s-comp", type: "competitor_summary", title: "c", sourceData: {}, body: [], competitorIds: ["c-1"], confidence: 50 })!;
    const r = applyRedaction({ audience: "public_visitor", sections: [s] });
    expect(r.sections).toHaveLength(0);
    expect(r.redactions[0]!.reason).toBe("full_competitor_set");
    expect(lockedSections(r.redactions)[0]!.label).toContain("full scan");
    for (const t of PUBLIC_FORBIDDEN_SECTIONS) expect(sectionPermitted(t, "public_visitor")).toBe(false);
  });

  it("redacts claims above the audience sensitivity ceiling", () => {
    const r = applyRedaction({ audience: "client", sections: [], claims: [claim({ sensitivity: "confidential" })] });
    expect(r.claims).toHaveLength(0);
    expect(r.redactions[0]!.reason).toBe("sensitivity_exceeds_audience");
  });

  it("exposes no citations at all in the public preview", () => {
    const r = applyRedaction({ audience: "public_visitor", sections: [], citations: [buildCitation({ id: "ct-1", target: "evidence", targetId: "ev-1", evidenceState: "observed" })] });
    expect(r.citations).toHaveLength(0);
  });

  it("resolves locales with deterministic fallback", () => {
    expect(localeProfile("en-GB").spelling).toBe("uk");
    expect(localeProfile("en-ZZ").locale).toBe("en-US"); // falls back within the base language
    expect(localeProfile("xx-YY").locale).toBe("en-US");
    expect(localizeTerm("optimize the analyze step", localeProfile("en-GB"))).toBe("optimise the analyse step");
    expect(localeProfile("en-US").currencyDisplay).toBe("none"); // pricing out of scope
  });
});

/* ===== 8 · builders ======================================================== */
describe("narrative builders", () => {
  it("builds an internal operator report with the most detail", () => {
    const a = buildInternalOperatorReport(ctx("internal_operator"));
    expect(a.audience).toBe("internal_operator");
    expect(a.sections.length).toBeGreaterThan(0);
    expect(a.sections.some((s) => s.type === "evidence_summary")).toBe(true);
    expect(a.reviewRequired).toBe(true);
  });

  it("builds a shorter executive summary than the internal report", () => {
    const internal = buildInternalOperatorReport(ctx("internal_operator"));
    const exec = buildExecutiveSummary(ctx("executive"));
    const count = (x: typeof exec) => x.sections.reduce((n, s) => n + s.body.length, 0);
    expect(count(exec)).toBeLessThanOrEqual(count(internal));
    expect(exec.sections.some((s) => s.type === "evidence_summary")).toBe(false); // not permitted
  });

  it("builds a client diagnosis and a board summary", () => {
    expect(buildClientDiagnosis(ctx("client")).audience).toBe("client");
    const board = buildBoardSummary(ctx("board"));
    expect(board.sections.every((s) => sectionPermitted(s.type, "board"))).toBe(true);
  });

  it("builds a proposal narrative for a prospect", () => {
    const a = buildProposalNarrative(ctx("prospect"));
    expect(a.audience).toBe("prospect");
    expect(a.sections.every((s) => sectionPermitted(s.type, "prospect") || s.type === "public_preview")).toBe(true);
  });

  it("builds a public preview that redacts everything sensitive", () => {
    const a = buildPublicPreview(ctx("public_visitor", { competitorSnapshot: snapshot(true), marketPosition: marketPosition(true) }));
    expect(a.sections.some((s) => s.type === "public_preview")).toBe(true);
    for (const t of PUBLIC_FORBIDDEN_SECTIONS) expect(a.sections.some((s) => s.type === t)).toBe(false);
    expect(a.redactions.length).toBeGreaterThan(0);
    expect(a.citations).toHaveLength(0);
    expect(a.limitations.join(" ")).toContain("locked");
  });

  it("always keeps a limitations section and records omissions", () => {
    const a = buildExecutiveSummary(ctx("executive"));
    expect(a.sections.some((s) => s.type === "limitations")).toBe(true);
    if (a.omittedSections.length > 0) expect(a.limitations.join(" ")).toContain("omitted or redacted");
  });
});

/* ===== 16 + 17 · artifact, versioning, approval ============================ */
describe("artifact, versioning and approval", () => {
  const artifactOf = (audience: NarrativeAudience = "client") => buildClientDiagnosis(ctx(audience));

  it("derives review_required and blocks approval while claims are rejected", () => {
    const a = artifactOf();
    expect(a.status).toBe("review_required");
    expect(canNarrativeTransition("review_required", "approved")).toBe(true);
    expect(canNarrativeTransition("approved", "draft")).toBe(false);
    expect(transitionNarrative(a, "approved", NOW).status).toBe("approved");

    const failed = buildNarrativeArtifact({
      id: "n-f", requestId: "nr", scanId: "scan-1", clientId: null, audience: "client", purpose: "diagnosis",
      title: "t", sections: [], rejectedClaims: [{ claimId: "cl-1", reason: "unsupported_claim", detail: "x", audience: "client" }], now: NOW,
    });
    expect(failed.status).toBe("validation_failed");
    expect(transitionNarrative(failed, "approved", NOW).status).toBe("validation_failed"); // refused
  });

  it("checksums content deterministically, ignoring id/version/time", () => {
    expect(narrativeChecksum(artifactOf())).toBe(narrativeChecksum(artifactOf()));
  });

  it("creates immutable versions and resets approval on a material change", () => {
    const v1 = transitionNarrative(artifactOf(), "approved", NOW);
    expect(v1.status).toBe("approved");
    const changed = { ...v1, sections: [] };
    const { artifact: v2, revision } = reviseNarrative(v1, { id: "n-2", next: changed, now: NOW });

    expect(v1.version).toBe(1); // prior untouched
    expect(v1.status).toBe("approved");
    expect(v2.version).toBe(2);
    expect(revision.material).toBe(true);
    expect(revision.approvalReset).toBe(true);
    expect(v2.status).toBe("draft");
    expect(detectChanges(v1, changed)).toContain("section_change");
  });
});

/* ===== 18 · pipeline integration + determinism ============================ */
describe("pipeline integration", () => {
  const input = () => ({
    scanId: "scan-1", clientId: null, pipelineRunId: "run-1",
    inputs: { report: report(), decisionBrief: brief(), recommendations: [rec()], competitorSnapshot: snapshot(true), marketPosition: marketPosition(true) },
    sourceArtifactIds: ["a-1"], idFor: (p: string) => `${p}-1`, now: NOW,
  });

  it("produces all six audience artifacts", () => {
    const set = runNarrativeStage(input());
    for (const k of ["internal", "executive", "client", "proposal", "board", "publicPreview"] as const) expect(set[k]).not.toBeNull();
    expect(set.events.some((e) => e.type === "narrative.requested")).toBe(true);
    expect(set.events.some((e) => e.type === "narrative.version_created")).toBe(true);
  });

  it("records a NEW artifact with lineage without mutating upstream", () => {
    const reg = newArtifactRegistry();
    const rep = recordArtifact(reg, { id: "a-rep", pipelineRunId: "run-1", scanId: "scan-1", kind: "internal_intelligence_report", payload: [1], now: NOW, validationStatus: "valid" });
    const before = rep.checksum;
    const added = recordNarrativeArtifact(reg, runNarrativeStage(input()), { id: "a-nar", pipelineRunId: "run-1", scanId: "scan-1", now: NOW });
    expect(added.sourceArtifactIds).toContain("a-rep");
    expect(added.version).toBe(rep.version + 1);
    expect(reg.byId.get("a-rep")!.checksum).toBe(before); // upstream untouched
  });

  it("produces identical output for identical input", () => {
    expect(runNarrativeStage(input())).toEqual(runNarrativeStage(input()));
  });

  it("exposes no hidden chain-of-thought fields anywhere", () => {
    const set = runNarrativeStage(input());
    const forbidden = ["chainOfThought", "thoughts", "scratchpad", "hidden", "cot", "internalReasoning"];
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o !== null && typeof o === "object") {
        for (const k of Object.keys(o)) {
          expect(forbidden).not.toContain(k);
          walk((o as Record<string, unknown>)[k]);
        }
      }
    };
    walk(set);
  });
});
