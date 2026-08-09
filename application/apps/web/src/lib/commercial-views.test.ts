/* Post-scan commercial view models — status mapping + package fold. */
import { describe, it, expect } from "vitest";
import type { ArtifactDTO } from "@brightloop/application";
import {
  buildCommercialProposalView,
  buildClientNarrativeView,
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
});
