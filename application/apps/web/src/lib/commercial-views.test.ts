/* Post-scan commercial view models — status mapping + package fold. */
import { describe, it, expect } from "vitest";
import type { ArtifactDTO } from "@brightloop/application";
import {
  buildCommercialProposalView,
  buildClientNarrativeView,
  buildCompetitorIntelligenceView,
  buildProspectPackageView,
  emptyCommercialProposalView,
  emptyClientNarrativeView,
} from "./prospect-scanner";

const proposalDto = (status: string, commercialState = "needs_pricing"): ArtifactDTO => ({
  id: "cp1",
  kind: "proposal",
  version: 1,
  status: "needs_review",
  createdAt: "2026-08-09T00:00:00.000Z",
  content: { status, commercialState, recommendedWork: [{}, {}], executiveSummary: "x" },
});
const narrativeDto = (status: string): ArtifactDTO => ({
  id: "cn1",
  kind: "narrative",
  version: 1,
  status: "needs_review",
  createdAt: "2026-08-09T00:00:00.000Z",
  content: { status, sections: [{}, {}, {}] },
});

describe("commercial proposal view", () => {
  it("maps a draft_ready proposal to needs_review + needs_pricing", () => {
    const v = buildCommercialProposalView(proposalDto("draft_ready"));
    expect(v.status).toBe("needs_review");
    expect(v.needsPricing).toBe(true);
    expect(v.workItemCount).toBe(2);
  });
  it("surfaces the generation axis as 'Draft ready' (§09 must NOT say 'Not drafted' when a draft exists)", () => {
    const v = buildCommercialProposalView(proposalDto("draft_ready"));
    expect(v.present).toBe(true);
    expect(v.draftReady).toBe(true);
    expect(v.generationLabel).toBe("Draft ready");
    expect(v.commercialStateLabel).toBe("Pricing required");
    expect(v.statusLabel).toBe("Review required"); // the review axis is distinct from generation
  });
  it("maps an insufficient proposal honestly; empty when absent", () => {
    expect(buildCommercialProposalView(proposalDto("insufficient_evidence")).status).toBe("insufficient_evidence");
    expect(buildCommercialProposalView(null)).toEqual(emptyCommercialProposalView());
  });
});

describe("client narrative view", () => {
  it("maps a ready narrative to needs_review; empty when absent", () => {
    expect(buildClientNarrativeView(narrativeDto("ready")).status).toBe("needs_review");
    expect(buildClientNarrativeView(null)).toEqual(emptyClientNarrativeView());
  });
});

describe("prospect package view", () => {
  const competitorReady = { present: true, status: "ready" as const, statusLabel: "Ready", competitorCount: 2, evidenceCount: 3, confidence: 70, confidenceBand: "high", marketPosition: null, reviewRequired: true, summary: "" };

  it("folds a complete set into ready_for_review and unlocks review", () => {
    const pkg = buildProspectPackageView({
      scanCompleted: true,
      reportPresent: true,
      competitor: competitorReady,
      proposal: buildCommercialProposalView(proposalDto("draft_ready")),
      narrative: buildClientNarrativeView(narrativeDto("ready")),
      commercialEnqueued: true,
      commercialFailed: false,
      reviewDecision: "pending",
    });
    expect(pkg.state).toBe("ready_for_review");
    expect(pkg.canReview).toBe(true);
    const proposalRow = pkg.components.find((c) => c.key === "proposal")!;
    expect(proposalRow.note).toBe("Pricing required");
  });

  it("surfaces a failed stage as blocked", () => {
    const pkg = buildProspectPackageView({
      scanCompleted: true,
      reportPresent: true,
      competitor: competitorReady,
      proposal: emptyCommercialProposalView(),
      narrative: emptyClientNarrativeView(),
      commercialEnqueued: true,
      commercialFailed: true,
      reviewDecision: "pending",
    });
    expect(pkg.state).toBe("blocked");
    expect(pkg.canReview).toBe(false);
  });

  const fullInput = (reviewDecision: "pending" | "approved") => ({
    scanCompleted: true,
    reportPresent: true,
    competitor: competitorReady,
    proposal: buildCommercialProposalView(proposalDto("draft_ready")), // needs_pricing
    narrative: buildClientNarrativeView(narrativeDto("ready")),
    commercialEnqueued: true,
    commercialFailed: false,
    reviewDecision,
  });

  it("a generated package (no review event) is ready_for_review, NEVER approved", () => {
    const pkg = buildProspectPackageView(fullInput("pending"));
    expect(pkg.state).toBe("ready_for_review");
    expect(pkg.state).not.toBe("approved");
  });

  it("only an explicit review.approved decision yields approved — and stays honest about missing pricing", () => {
    const pkg = buildProspectPackageView(fullInput("approved"));
    expect(pkg.state).toBe("approved");
    expect(pkg.pricingRequired).toBe(true);
    // The UI must never imply a client-ready proposal while pricing is missing.
    expect(pkg.stateLabel).toBe("Approved · pricing required");
    expect(pkg.reason).toMatch(/pricing is still required/i);
  });
});

describe("competitor commercial status (§11) — no legacy 'Unavailable' anywhere", () => {
  const unavailableSnapshot = { status: "unavailable", reason: "no_competitor_evidence", competitors: [], evidenceIds: [], summary: "Unavailable — no verified competitor evidence." };

  it("completed commercial competitor stage + no verified competitors → Insufficient evidence, and the summary never echoes 'Unavailable'", () => {
    const v = buildCompetitorIntelligenceView(unavailableSnapshot, { scanCompleted: true, competitorStageRan: true });
    expect(v.status).toBe("insufficient_evidence");
    expect(v.statusLabel).toBe("Insufficient evidence");
    expect(v.statusLabel).not.toBe("Unavailable");
    // The panel renders `summary` too — it must NOT re-introduce the legacy word.
    expect(v.summary).not.toMatch(/unavailable/i);
    expect(v.summary).toMatch(/no competitors could be verified/i);
  });

  it("the stage has NOT run (scan not completed, no discovery event) → Not run", () => {
    const v = buildCompetitorIntelligenceView(unavailableSnapshot, { scanCompleted: false });
    expect(v.status).toBe("not_started");
    expect(v.statusLabel).toBe("Not run");
    expect(v.summary).not.toMatch(/unavailable/i);
  });

  it("the commercial workflow failed → Failed (not silently 'insufficient')", () => {
    const v = buildCompetitorIntelligenceView(unavailableSnapshot, { scanCompleted: true, commercialFailed: true });
    expect(v.status).toBe("failed");
    expect(v.statusLabel).toBe("Failed");
    expect(v.summary).not.toMatch(/unavailable/i);
  });

  it("the discovery event alone (even before scan flag) proves the stage ran → Insufficient evidence", () => {
    const v = buildCompetitorIntelligenceView(unavailableSnapshot, { scanCompleted: false, competitorStageRan: true });
    expect(v.status).toBe("insufficient_evidence");
  });

  it("verified competitors → Review required, keeping the real snapshot summary", () => {
    const v = buildCompetitorIntelligenceView(
      { status: "available", reviewRequired: true, competitors: [{ name: "A" }], evidenceIds: ["ev1"], summary: "Two verified competitors.", confidence: { value: 60, band: "moderate" } },
      { scanCompleted: true, competitorStageRan: true },
    );
    expect(v.status).toBe("needs_review");
    expect(v.statusLabel).toBe("Review required");
    expect(v.summary).toBe("Two verified competitors.");
  });
});
