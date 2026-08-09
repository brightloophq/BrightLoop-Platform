/* Commercial Proposal assembler — pure/deterministic/no-fabrication tests. */
import { describe, it, expect } from "vitest";
import { assembleCommercialProposal, type AssembleCommercialProposalInput } from "./assemble.js";

const REPORT: Record<string, unknown> = {
  executiveOverview: "Acme sells widgets online.",
  indexSummary: "Overall digital maturity 60/100.",
  businessProfile: { identity: "Acme Ltd" },
  readinessSummary: "Transformation readiness 55/100.",
  risks: [{ title: "Slow pages", description: "Home page is slow.", evidenceIds: ["ev1"] }],
  opportunities: [{ title: "SEO gap", businessImpact: "More traffic", evidenceIds: ["ev2"] }],
  confidence: { value: 62, band: "moderate" },
};
const SNAP_OK: Record<string, unknown> = {
  status: "available",
  proposals: [{ id: "pi_1", title: "Improve performance", recommendedSolution: "Optimize", priority: "high", estimatedEffort: "Medium", supportingEvidenceIds: ["ev1"] }],
  confidence: { value: 70, band: "high" },
};
const base = (over: Partial<AssembleCommercialProposalInput> = {}): AssembleCommercialProposalInput => ({
  scanId: "s1",
  clientId: "c1",
  proposalSnapshot: SNAP_OK,
  reportEnvelope: REPORT,
  competitorSnapshot: null,
  sourceArtifacts: ["report-art", "proposal-art"],
  now: "2026-08-09T00:00:00.000Z",
  id: "cprop_1",
  ...over,
});

describe("assembleCommercialProposal", () => {
  it("is deterministic — identical inputs hash identically regardless of id/timestamp", () => {
    const a = assembleCommercialProposal(base({ id: "cprop_a", now: "2026-01-01T00:00:00.000Z" })).proposal;
    const b = assembleCommercialProposal(base({ id: "cprop_b", now: "2026-12-31T00:00:00.000Z" })).proposal;
    expect(a.checksum).toBe(b.checksum);
  });

  it("draft_ready with needs_pricing and NO invented price; evidence retained", () => {
    const { proposal } = assembleCommercialProposal(base());
    expect(proposal.status).toBe("draft_ready");
    expect(proposal.commercialState).toBe("needs_pricing");
    expect(proposal.pricing).toBeNull();
    expect(proposal.recommendedWork[0]!.evidenceIds).toEqual(["ev1"]);
    expect(proposal.sourceArtifacts).toEqual(["report-art", "proposal-art"]);
  });

  it("insufficient_evidence with nothing fabricated when the snapshot is unavailable", () => {
    const { proposal } = assembleCommercialProposal(base({ proposalSnapshot: { status: "unavailable", proposals: [] } }));
    expect(proposal.status).toBe("insufficient_evidence");
    expect(proposal.recommendedWork).toHaveLength(0);
    expect(proposal.pricing).toBeNull();
  });

  it("drops recommended-work items that carry no evidence (never unsupported)", () => {
    const snap = { status: "available", proposals: [{ id: "pi_x", title: "X", recommendedSolution: "Y", priority: "low", estimatedEffort: "Small", supportingEvidenceIds: [] }], confidence: { value: 10, band: "low" } };
    const { proposal } = assembleCommercialProposal(base({ proposalSnapshot: snap }));
    expect(proposal.status).toBe("insufficient_evidence");
    expect(proposal.recommendedWork).toHaveLength(0);
  });
});
