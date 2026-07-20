/* =============================================================================
 * Sprint 11 · Proposal Intelligence Engine — deterministic tests.
 *
 * Request validation, evidence-backed strategy, scope derivation, deliverables,
 * phases, milestones, metrics, qualifiers, investment inputs, packages, proof,
 * artifact assembly, versioning/approval, pipeline lineage, and determinism.
 * Enforces AIS-004: derived, never invented — and a human approves before send.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { EngineRecommendation, EvidenceConfidence, ProposalApproval, Provenance, SuccessMetric } from "@brightloop/schema";
import { buildProvenance } from "../evidence/index.js";
import { newArtifactRegistry, recordArtifact } from "../pipeline-run/artifacts.js";
import { newProposalRequest, validateProposalRequest, NO_BUDGET, suppliedBudget } from "./request.js";
import { buildProposalStrategy, buildStatement, isPublishable, effortBandFor, durationBandFor } from "./strategy.js";
import { buildScope, scopeOfKind, priorityBandFor, riskBandFor } from "./scope.js";
import { buildDeliverables, canDeliverableTransition, transitionDeliverable, assignMilestone } from "./deliverables.js";
import { buildPhases, dependencyDepths, aggregateDurationBand, attachMilestones, PHASE_ORDER } from "./phases.js";
import { buildMilestones, sequenceMilestones, blockedMilestones, canMilestoneTransition } from "./milestones.js";
import { buildSuccessMetric, metricsFromRecommendations, NO_BASELINE_LIMITATION } from "./metrics.js";
import { deriveQualifiers, qualifiersOfKind, risks } from "./qualifiers.js";
import { buildInvestmentInputs, aggregateRiskBand } from "./investment.js";
import { buildOptionPackages, packagesAreNested, PACKAGE_ORDER } from "./packages.js";
import { buildProofReference, isUsableProof, usableProof, rejectedProof } from "./proof.js";
import { buildProposalArtifact, proposalChecksum } from "./artifact.js";
import { canProposalTransition, transitionProposal, recordApproval, requiredApprovalsMet, reviseProposal, nextPendingApproval, isMaterialChange } from "./lifecycle.js";
import { runProposalIntelligence, recordProposalArtifact } from "./integration.js";

const NOW = "2026-07-20T00:00:00.000Z";
const prov = (): Provenance => buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler" });
const conf = (v: number): EvidenceConfidence => ({
  value: v, band: v >= 80 ? "very_high" : v >= 60 ? "high" : v >= 40 ? "moderate" : "low",
  inputs: { coverage: v / 100, reliability: v / 100, freshness: v / 100, agreement: v / 100, completeness: v / 100, provenanceQuality: v / 100 },
});
const metric = (key: string): SuccessMetric => ({ key, description: `Measure ${key}`, dimension: null });

function rec(over: Partial<EngineRecommendation> = {}): EngineRecommendation {
  return {
    id: "r-1", scanId: "scan-1", clientId: null, title: "Install analytics", problemStatement: "No funnel visibility",
    proposedAction: "Deploy analytics and dashboards", findingIds: ["f-1"], evidenceIds: ["ev-1"], graphNodeIds: ["n-1"],
    affectedDomains: ["digital_presence"], tier: "quick_win", impact: 80, effort: 30, urgency: 70, strategicAlignment: 50,
    confidence: conf(85), implementationRisk: 25, probabilityOfSuccess: 0.85, timeHorizon: "weeks", dependencies: [],
    constraints: [], expectedOutcomes: ["Funnel visibility restored"], successMetrics: [metric("funnel_visibility")],
    reviewCycle: "on_rescan", ownerRole: null, evidenceState: "observed", limitations: [], contradictionStatus: "none",
    provenance: prov(), reviewRequired: true, ...over,
  };
}
const request = (over: Partial<Parameters<typeof newProposalRequest>[0]> = {}) =>
  newProposalRequest({ id: "pr-1", scanId: "scan-1", clientId: null, selectedRecommendationIds: ["r-1"], sourceArtifactIds: ["a-1"], createdAt: NOW, ...over });

const strategyOf = (recs: EngineRecommendation[]) =>
  buildProposalStrategy({ id: "st-1", proposalRequestId: "pr-1", recommendations: recs, workstreamIdFor: (_r, i) => `ws-${i}` });

/* ===== 1 · request ========================================================= */
describe("proposal request", () => {
  it("never infers a budget", () => {
    const r = request();
    expect(r.budgetRange).toEqual(NO_BUDGET);
    expect(r.budgetRange.provided).toBe(false);
    expect(r.budgetRange.low).toBeNull();
  });

  it("accepts a supplied budget and normalizes bounds", () => {
    const b = suppliedBudget(9000, 5000, "USD");
    expect(b).toEqual({ provided: true, low: 5000, high: 9000, currency: "USD" });
  });

  it("rejects a request with no recommendations or no source", () => {
    expect(validateProposalRequest(request())).toEqual([]);
    expect(validateProposalRequest(request({ selectedRecommendationIds: [] })).join(" ")).toContain("no recommendations selected");
    expect(validateProposalRequest(request({ sourceArtifactIds: [] })).join(" ")).toContain("untraceable");
  });
});

/* ===== 2 · strategy ======================================================== */
describe("strategy", () => {
  it("marks statements supported only when traceable", () => {
    expect(isPublishable(buildStatement("x", { findingIds: ["f-1"] }))).toBe(true);
    expect(isPublishable(buildStatement("x", { recommendationIds: ["r-1"] }))).toBe(true);
    expect(isPublishable(buildStatement("x", { competitorEvidenceIds: ["c-1"] }))).toBe(true);
    expect(isPublishable(buildStatement("unsupported sales claim", {}))).toBe(false); // no source
  });

  it("derives one workstream per recommendation with evidence trace", () => {
    const s = strategyOf([rec(), rec({ id: "r-2", tier: "critical_risk", effort: 70, timeHorizon: "quarter" })]);
    expect(s.workstreams).toHaveLength(2);
    expect(s.workstreams[0]!.recommendationIds).toEqual(["r-1"]);
    expect(s.coreProblem.supported).toBe(true);
    expect(s.evidenceCoverage).toBe(1);
    expect(s.rejectedStatements).toEqual([]);
  });

  it("rejects unsupported statements when nothing traces", () => {
    const s = strategyOf([]);
    expect(s.rejectedStatements.length).toBeGreaterThan(0);
    expect(s.rejectedStatements[0]!.reason).toContain("no traceable");
    expect(s.coreProblem.supported).toBe(false);
  });

  it("maps effort and horizon to bands", () => {
    expect(effortBandFor(10)).toBe("xs");
    expect(effortBandFor(90)).toBe("xl");
    expect(durationBandFor("quarter_plus")).toBe("multi_quarter");
  });
});

/* ===== 3 · scope =========================================================== */
describe("scope", () => {
  const build = (recs: EngineRecommendation[], over = {}) => {
    const s = strategyOf(recs);
    return buildScope({ idFor: (k, i) => `sc-${k}-${i}`, recommendations: recs, workstreams: s.workstreams, ...over });
  };

  it("derives scope from recommendations with source links", () => {
    const { items, rejected } = build([rec()]);
    expect(rejected).toEqual([]);
    expect(items[0]!.sourceRecommendationIds).toEqual(["r-1"]);
    expect(items[0]!.sourceFindingIds).toEqual(["f-1"]);
    expect(items[0]!.kind).toBe("optional");
  });

  it("refuses to generate work with no finding or evidence", () => {
    const { items, rejected } = build([rec({ findingIds: [] })]);
    expect(items).toHaveLength(0);
    expect(rejected[0]!.reason).toContain("no linked finding or evidence");
  });

  it("marks critical risk mandatory and portfolio-deferred as deferred", () => {
    expect(build([rec({ tier: "critical_risk" })]).items[0]!.kind).toBe("mandatory");
    expect(build([rec()], { deferredRecommendationIds: ["r-1"] }).items[0]!.kind).toBe("deferred");
  });

  it("records client exclusions explicitly rather than omitting silently", () => {
    const { items } = build([rec()], { excludedServices: ["paid ads"] });
    expect(scopeOfKind(items, "excluded")).toHaveLength(1);
    expect(scopeOfKind(items, "excluded")[0]!.title).toBe("paid ads");
  });

  it("rejects declared work-kind scope with no source", () => {
    const { rejected } = build([rec()], { declarations: [{ kind: "mandatory", title: "invented work", description: "x" }] });
    expect(rejected.some((r) => r.reason.includes("without a recommendation or finding source"))).toBe(true);
  });

  it("bands priority and risk", () => {
    expect(priorityBandFor(rec({ tier: "critical_risk" }))).toBe("critical");
    expect(priorityBandFor(rec({ impact: 20 }))).toBe("low");
    expect(riskBandFor(90)).toBe("critical");
  });
});

/* ===== 4 · deliverables ==================================================== */
describe("deliverables", () => {
  const setup = (recs: EngineRecommendation[]) => {
    const s = strategyOf(recs);
    const { items } = buildScope({ idFor: (k, i) => `sc-${k}-${i}`, recommendations: recs, workstreams: s.workstreams });
    return buildDeliverables({ idFor: (_x, i) => `dl-${i}`, scope: items });
  };

  it("builds one deliverable per work scope item", () => {
    const { deliverables } = setup([rec()]);
    expect(deliverables).toHaveLength(1);
    expect(deliverables[0]!.linkedScopeIds).toHaveLength(1);
    expect(deliverables[0]!.status).toBe("proposed");
  });

  it("produces no deliverable for non-work scope", () => {
    const s = strategyOf([rec()]);
    const { items } = buildScope({ idFor: (k, i) => `sc-${k}-${i}`, recommendations: [], workstreams: s.workstreams, excludedServices: ["seo"] });
    expect(buildDeliverables({ idFor: (_x, i) => `dl-${i}`, scope: items }).deliverables).toHaveLength(0);
  });

  it("gates status transitions and assigns milestones", () => {
    const { deliverables } = setup([rec()]);
    expect(canDeliverableTransition("proposed", "approved")).toBe(true);
    expect(canDeliverableTransition("proposed", "delivered")).toBe(false);
    expect(transitionDeliverable(deliverables[0]!, "delivered")).toBe(deliverables[0]!); // illegal → unchanged
    expect(assignMilestone(deliverables, "ms-1", [deliverables[0]!.id])[0]!.targetMilestoneId).toBe("ms-1");
  });
});

/* ===== 5 + 6 · phases & milestones ========================================= */
describe("phases and milestones", () => {
  const recs = [rec({ id: "r-a", tier: "critical_risk" }), rec({ id: "r-b", tier: "quick_win", dependencies: ["r-a"] })];
  const strategy = strategyOf(recs);

  it("computes dependency depth and cuts phases along the DAG", () => {
    const depths = dependencyDepths(strategy.workstreams);
    expect(depths.get("ws-0")).toBe(0);
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams });
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.map((p) => p.order)).toEqual(phases.map((_p, i) => i)); // contiguous order
    expect(PHASE_ORDER.indexOf(phases[0]!.kind)).toBeLessThanOrEqual(PHASE_ORDER.indexOf(phases.at(-1)!.kind));
  });

  it("emits no empty phases and uses duration BANDS not dates", () => {
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams });
    for (const p of phases) expect(p.workstreamIds.length).toBeGreaterThan(0);
    expect(aggregateDurationBand(["days", "quarter"])).toBe("quarter");
    expect(aggregateDurationBand(["unavailable"])).toBe("unavailable");
  });

  it("sequences milestones with prerequisites", () => {
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams });
    const milestones = buildMilestones({ idFor: (p) => `ms-${p.kind}`, phases });
    const seq = sequenceMilestones(milestones);
    expect(seq.acyclic).toBe(true);
    expect(seq.order).toHaveLength(milestones.length);
    expect(attachMilestones(phases, new Map([[phases[0]!.id, [milestones[0]!.id]]]))[0]!.milestoneIds).toEqual([milestones[0]!.id]);
  });

  it("detects cycles and withholds the order", () => {
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams });
    const ms = buildMilestones({ idFor: (p) => `ms-${p.kind}`, phases });
    const cyclic = ms.length >= 2
      ? [{ ...ms[0]!, prerequisiteMilestoneIds: [ms[1]!.id] }, { ...ms[1]!, prerequisiteMilestoneIds: [ms[0]!.id] }]
      : [{ ...ms[0]!, prerequisiteMilestoneIds: [ms[0]!.id] }];
    const seq = sequenceMilestones(cyclic);
    if (cyclic.length >= 2) {
      expect(seq.acyclic).toBe(false);
      expect(seq.order).toEqual([]);
      expect(seq.issues.some((i) => i.kind === "cycle")).toBe(true);
    } else {
      expect(seq.issues.some((i) => i.kind === "self_reference")).toBe(true);
    }
  });

  it("flags unknown prerequisites as blocked", () => {
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams });
    const ms = buildMilestones({ idFor: (p) => `ms-${p.kind}`, phases });
    const seq = sequenceMilestones([{ ...ms[0]!, prerequisiteMilestoneIds: ["missing"] }]);
    expect(seq.blocked).toContain(ms[0]!.id);
    expect(seq.issues.some((i) => i.kind === "unknown_prerequisite")).toBe(true);
  });

  it("detects milestones blocked by unachieved prerequisites", () => {
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams });
    const ms = buildMilestones({ idFor: (p) => `ms-${p.kind}`, phases });
    if (ms.length >= 2) expect(blockedMilestones(ms)).toContain(ms[1]!.id);
    expect(canMilestoneTransition("proposed", "achieved")).toBe(false);
    expect(canMilestoneTransition("in_progress", "achieved")).toBe(true);
  });
});

/* ===== 7 · success metrics ================================================= */
describe("success metrics", () => {
  const base = { id: "m-1", title: "Conversion", measurementMethod: "analytics", confidence: 80, evidenceState: "observed" as const };

  it("keeps an unavailable baseline unavailable and withholds the target", () => {
    const m = buildSuccessMetric({ ...base, baseline: null, target: 50 });
    expect(m.baselineAvailable).toBe(false);
    expect(m.baseline).toBeNull();
    expect(m.target).toBeNull(); // nothing to move from
    expect(m.limitations).toContain(NO_BASELINE_LIMITATION);
  });

  it("refuses a monetary target with no financial inputs — no fabricated ROI", () => {
    const m = buildSuccessMetric({ ...base, baseline: 100, target: 500, unit: "revenue" });
    expect(m.target).toBeNull();
    expect(m.limitations.join(" ")).toContain("no financial inputs");
  });

  it("allows a monetary target when financial inputs are supplied", () => {
    expect(buildSuccessMetric({ ...base, baseline: 100, target: 500, unit: "revenue", financialInputsAvailable: true }).target).toBe(500);
  });

  it("labels an estimated target from non-observed evidence", () => {
    const m = buildSuccessMetric({ ...base, baseline: 10, target: 20, evidenceState: "inferred" });
    expect(m.targetIsEstimated).toBe(true);
    expect(m.limitations.join(" ")).toContain("modelled, not measured");
  });

  it("derives metrics from recommendations with no invented baseline", () => {
    const ms = metricsFromRecommendations([rec()], (_r, i) => `m-${i}`);
    expect(ms).toHaveLength(1);
    expect(ms[0]!.baselineAvailable).toBe(false);
    expect(ms[0]!.target).toBeNull();
  });
});

/* ===== 8 · qualifiers ====================================================== */
describe("assumptions, risks, exclusions", () => {
  it("surfaces risk, constraints, limitations, and external dependencies", () => {
    const q = deriveQualifiers({
      idFor: (k, i) => `q-${k}-${i}`,
      recommendations: [rec({ implementationRisk: 80, constraints: ["needs CMS access"], limitations: ["thin evidence"], dependencies: ["r-missing"], probabilityOfSuccess: 0.3 })],
    });
    const kinds = q.map((x) => x.kind);
    expect(kinds).toContain("delivery_risk");
    expect(kinds).toContain("assumption");
    expect(kinds).toContain("unresolved_question"); // limitations are never hidden
    expect(kinds).toContain("dependency");
    expect(kinds).toContain("commercial_risk"); // low probability of success
    expect(risks(q).length).toBeGreaterThan(0);
    expect(q.every((x) => x.reviewRequired)).toBe(true);
  });

  it("turns excluded scope into an explicit exclusion record", () => {
    const s = strategyOf([rec()]);
    const { items } = buildScope({ idFor: (k, i) => `sc-${k}-${i}`, recommendations: [rec()], workstreams: s.workstreams, excludedServices: ["paid ads"] });
    const q = deriveQualifiers({ idFor: (k, i) => `q-${k}-${i}`, recommendations: [], scope: items });
    expect(qualifiersOfKind(q, "exclusion")).toHaveLength(1);
  });
});

/* ===== 9 · investment inputs (no pricing) ================================== */
describe("investment inputs", () => {
  const setup = (req = request()) => {
    const s = strategyOf([rec()]);
    const { items } = buildScope({ idFor: (k, i) => `sc-${k}-${i}`, recommendations: [rec()], workstreams: s.workstreams });
    return buildInvestmentInputs({ request: req, workstreams: s.workstreams, scope: items });
  };

  it("emits inputs only — never a price", () => {
    const inv = setup();
    expect(Object.keys(inv)).not.toContain("price");
    expect(Object.keys(inv)).not.toContain("total");
    expect(Object.keys(inv)).not.toContain("rate");
    expect(inv.limitations.join(" ")).toContain("No price is calculated");
    expect(Object.keys(inv.workstreamEffortBands).length).toBeGreaterThan(0);
  });

  it("marks the budget unavailable when none was supplied", () => {
    expect(setup().budgetUnavailable).toBe(true);
    expect(setup(request({ budgetRange: suppliedBudget(1000, 2000, "USD") })).budgetUnavailable).toBe(false);
  });

  it("aggregates risk bands", () => {
    expect(aggregateRiskBand(["low", "critical"])).toBe("critical");
    expect(aggregateRiskBand(["unknown"])).toBe("unknown");
  });
});

/* ===== 10 · option packages ================================================ */
describe("option packages", () => {
  const recs = [rec({ id: "r-crit", tier: "critical_risk" }), rec({ id: "r-quick", tier: "quick_win" }), rec({ id: "r-strat", tier: "strategic_win" })];
  const strategy = strategyOf(recs);
  const build = (over = {}) => buildOptionPackages({ idFor: (k) => `pk-${k}`, workstreams: strategy.workstreams, ...over });

  it("builds four nested packages from the same move set", () => {
    const pkgs = build();
    expect(pkgs.map((p) => p.kind)).toEqual([...PACKAGE_ORDER]);
    expect(packagesAreNested(pkgs)).toBe(true);
    expect(pkgs.find((p) => p.kind === "strategic")!.workstreamIds).toHaveLength(3);
    expect(pkgs.find((p) => p.kind === "essential")!.workstreamIds).toHaveLength(1);
  });

  it("records the derivation rule and never invents work to fill a tier", () => {
    const empty = buildOptionPackages({ idFor: (k) => `pk-${k}`, workstreams: strategyOf([rec({ tier: "strategic_win" })]).workstreams });
    const essential = empty.find((p) => p.kind === "essential")!;
    expect(essential.workstreamIds).toEqual([]);
    expect(essential.limitations.join(" ")).toContain("none was invented");
    expect(essential.derivationRule).toContain("critical_risk");
  });

  it("constrains packages to a selected scenario", () => {
    const pkgs = build({ scenarioRecommendationIds: ["r-crit"] });
    expect(pkgs.find((p) => p.kind === "strategic")!.workstreamIds).toHaveLength(1);
  });
});

/* ===== 11 · proof ========================================================== */
describe("case-study proof", () => {
  const p = (over = {}) => buildProofReference({ id: "pf-1", proofType: "case_study", relevantOutcome: "improved conversion", source: "internal", verification: "verified", approvedForUse: true, ...over });

  it("admits only verified AND approved proof", () => {
    expect(isUsableProof(p())).toBe(true);
    expect(isUsableProof(p({ verification: "unverified" }))).toBe(false);
    expect(isUsableProof(p({ approvedForUse: false }))).toBe(false);
    expect(isUsableProof(p({ source: "" }))).toBe(false);
  });

  it("records why unusable proof was excluded", () => {
    const all = [p(), p({ id: "pf-2", verification: "unverified" })];
    expect(usableProof(all)).toHaveLength(1);
    expect(rejectedProof(all)[0]!.reasons.join(" ")).toContain("not verified");
  });
});

/* ===== 12 + 13 + 14 · artifact, versioning, approvals ====================== */
describe("artifact, versioning, approvals", () => {
  function assemble(over: Record<string, unknown> = {}) {
    const req = request();
    const strategy = strategyOf([rec()]);
    const { items: scope } = buildScope({ idFor: (k, i) => `sc-${k}-${i}`, recommendations: [rec()], workstreams: strategy.workstreams });
    const { deliverables } = buildDeliverables({ idFor: (_x, i) => `dl-${i}`, scope });
    const phases = buildPhases({ idFor: (k) => `ph-${k}`, workstreams: strategy.workstreams, deliverables });
    const milestones = buildMilestones({ idFor: (p) => `ms-${p.kind}`, phases, deliverables });
    const investmentInputs = buildInvestmentInputs({ request: req, workstreams: strategy.workstreams, scope });
    return buildProposalArtifact({ id: "prop-1", request: req, strategy, scope, deliverables, phases, milestones, investmentInputs, now: NOW, ...over });
  }

  it("assembles a draft artifact with only publishable content", () => {
    const a = assemble();
    expect(a.status).toBe("draft");
    expect(a.version).toBe(1);
    expect(a.executiveSummary.keyPoints.every((k) => k.supported)).toBe(true);
    expect(a.scope.length).toBeGreaterThan(0);
    expect(a.checksum.length).toBeGreaterThan(0);
    expect(a.approvalRequirementsMet).toBe(false); // human gate not yet satisfied
  });

  it("excludes unusable proof from the artifact", () => {
    const a = assemble({ proofReferences: [buildProofReference({ id: "pf-x", proofType: "case_study", relevantOutcome: "x", source: "s", verification: "unverified", approvedForUse: true })] });
    expect(a.proofReferences).toHaveLength(0);
  });

  it("checksums content deterministically, ignoring id/version/time", () => {
    expect(proposalChecksum(assemble())).toBe(proposalChecksum(assemble({ id: "prop-2", now: "2027-01-01T00:00:00.000Z" })));
    expect(proposalChecksum(assemble())).toBe(proposalChecksum(assemble()));
  });

  it("gates status transitions and blocks send without approvals", () => {
    const a = assemble();
    expect(canProposalTransition("draft", "internal_review")).toBe(true);
    expect(canProposalTransition("draft", "sent")).toBe(false);
    expect(canProposalTransition("accepted", "draft")).toBe(false);
    const review = transitionProposal(a, "internal_review", NOW);
    expect(review.status).toBe("internal_review");
    expect(transitionProposal(review, "approved_for_send", NOW).status).toBe("internal_review"); // no approvals → refused
  });

  it("records approvals in order and permits send once met", () => {
    const approvals: ProposalApproval[] = [
      { id: "ap-1", reviewerRole: "lead", required: true, order: 0, decision: "pending", conditions: [], commentRef: null, decidedAt: null, expiresAt: null, resetByRevision: false },
      { id: "ap-2", reviewerRole: "finance", required: false, order: 1, decision: "pending", conditions: [], commentRef: null, decidedAt: null, expiresAt: null, resetByRevision: false },
    ];
    const a = transitionProposal(assemble({ approvals }), "internal_review", NOW);
    expect(nextPendingApproval(a.approvals)!.id).toBe("ap-1");
    expect(requiredApprovalsMet(a.approvals)).toBe(false);
    const approved = recordApproval(a, { approvalId: "ap-1", decision: "approved", now: NOW });
    expect(approved.approvalRequirementsMet).toBe(true);
    expect(transitionProposal(approved, "approved_for_send", NOW).status).toBe("approved_for_send");
  });

  it("creates an immutable next version and resets approvals on a material change", () => {
    const approvals: ProposalApproval[] = [{ id: "ap-1", reviewerRole: "lead", required: true, order: 0, decision: "approved", conditions: [], commentRef: null, decidedAt: NOW, expiresAt: null, resetByRevision: false }];
    const v1 = assemble({ approvals });
    const changed = { ...v1, scope: [] }; // material content change
    const { artifact: v2, revision } = reviseProposal(v1, { id: "prop-2", next: changed, reasons: ["scope_change"], now: NOW });

    expect(v1.version).toBe(1); // prior untouched
    expect(v1.approvals[0]!.decision).toBe("approved");
    expect(v2.version).toBe(2);
    expect(revision.material).toBe(true);
    expect(v2.status).toBe("draft"); // re-enters review
    expect(v2.approvals[0]!.decision).toBe("pending"); // approval invalidated
    expect(v2.approvals[0]!.resetByRevision).toBe(true);
    expect(revision.approvalsReset).toEqual(["ap-1"]);
    expect(isMaterialChange(v1, v2)).toBe(true);
  });

  it("keeps approvals on a non-material revision", () => {
    const approvals: ProposalApproval[] = [{ id: "ap-1", reviewerRole: "lead", required: true, order: 0, decision: "approved", conditions: [], commentRef: null, decidedAt: NOW, expiresAt: null, resetByRevision: false }];
    const v1 = transitionProposal(assemble({ approvals }), "internal_review", NOW);
    const { artifact: v2, revision } = reviseProposal(v1, { id: "prop-2", next: { ...v1, title: "Renamed" }, reasons: ["internal_correction"], now: NOW });
    expect(revision.material).toBe(false);
    expect(v2.approvals[0]!.decision).toBe("approved");
    expect(v2.version).toBe(2);
  });
});

/* ===== 15 · pipeline integration + determinism ============================= */
describe("pipeline integration", () => {
  const input = () => ({
    scanId: "scan-1", clientId: null, pipelineRunId: "run-1",
    recommendations: [rec({ id: "r-a", tier: "critical_risk" }), rec({ id: "r-b", tier: "quick_win" })],
    idFor: (p: string) => `${p}-1`, now: NOW,
  });

  it("runs end to end and produces every output", () => {
    const r = runProposalIntelligence(input());
    expect(r.request.selectedRecommendationIds).toHaveLength(2);
    expect(r.strategy.workstreams).toHaveLength(2);
    expect(r.scope.length).toBeGreaterThan(0);
    expect(r.deliverables.length).toBeGreaterThan(0);
    expect(r.phases.length).toBeGreaterThan(0);
    expect(r.milestones.length).toBeGreaterThan(0);
    expect(r.optionPackages).toHaveLength(4);
    expect(r.artifact).not.toBeNull();
    expect(r.events.some((e) => e.type === "proposal.review_required")).toBe(true);
  });

  it("records a NEW artifact with lineage without mutating upstream", () => {
    const reg = newArtifactRegistry();
    const findings = recordArtifact(reg, { id: "a-f", pipelineRunId: "run-1", scanId: "scan-1", kind: "findings", payload: [1], now: NOW, validationStatus: "valid" });
    const cand = recordArtifact(reg, { id: "a-c", pipelineRunId: "run-1", scanId: "scan-1", kind: "recommendation_candidates", payload: [2], now: NOW, validationStatus: "valid" });
    const before = cand.checksum;

    const added = recordProposalArtifact(reg, runProposalIntelligence(input()), { id: "a-prop", pipelineRunId: "run-1", scanId: "scan-1", now: NOW });
    expect(added.sourceArtifactIds).toContain(findings.id);
    expect(added.version).toBe(cand.version + 1);
    expect(reg.byId.get("a-c")!.checksum).toBe(before); // upstream untouched
  });

  it("produces identical output for identical input", () => {
    expect(runProposalIntelligence(input())).toEqual(runProposalIntelligence(input()));
  });

  it("exposes no hidden chain-of-thought fields anywhere", () => {
    const r = runProposalIntelligence(input());
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
