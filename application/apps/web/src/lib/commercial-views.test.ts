/* Post-scan commercial view models — status mapping + package fold. */
import { describe, it, expect } from "vitest";
import type { ArtifactDTO } from "@brightloop/application";
import {
  buildCommercialProposalView,
  buildClientNarrativeView,
  buildCompetitorIntelligenceView,
  buildProposalPreview,
  buildProspectPackageView,
  emptyCommercialProposalView,
  emptyClientNarrativeView,
} from "./prospect-scanner";

const pricedProposalContent = {
  id: "cp1", scanId: "scan-p", clientId: null, status: "draft_ready", reason: null, commercialState: "priced",
  executiveSummary: "Lift conversion and search reach.", observedSituation: "Slow pages, thin search presence.",
  keyIssues: [{ title: "Slow pages", detail: "Home page is slow.", evidenceIds: ["e1"] }],
  opportunities: [{ title: "SEO gap", detail: "Untapped search demand.", evidenceIds: ["e2"] }],
  recommendedWork: [
    { sourceId: "w1", title: "Website redesign", solution: "Rebuild core pages", priority: "high", effort: "Large", evidenceIds: ["e1"] },
    { sourceId: "w2", title: "SEO management", solution: "Ongoing optimization", priority: "medium", effort: "Medium", evidenceIds: ["e2"] },
  ],
  competitorContext: null, proposedNextStep: "Review scope and confirm pricing.", supportingEvidenceIds: ["e1", "e2"],
  confidence: { value: 70, band: "high" }, reviewRequired: true, sourceArtifacts: ["a1"], checksum: "x", generatedAt: "t",
  pricing: {
    currency: "USD",
    items: [
      { sourceId: "w1", pricingType: "one_time", amountMinor: 120000, cadence: null, quantity: 1, optional: false, adminNotes: "" },
      { sourceId: "w2", pricingType: "recurring", amountMinor: 30000, cadence: "monthly", quantity: 1, optional: false, adminNotes: "" },
    ],
    discountMinor: 0, subtotalOneTimeMinor: 120000, totalOneTimeMinor: 120000, totalRecurringMonthlyMinor: 30000,
    validUntil: "2026-09-10", commercialNotes: "Payment on milestones.", pricedBy: "u_owner", pricedAt: "t",
  },
};

describe("§09 pricing editor visibility — the view inputs that drive the workspace", () => {
  // The workspace renders its editable pricing grid whenever `present` is true, one
  // row per `workItems` entry. These assert the exact view state that makes the
  // editor appear for an authorized admin on a needs_pricing draft (the live gap
  // was a STALE preview: the editor is wired at page.tsx → CommercialProposalWorkspace).
  const draftContent = {
    id: "cp1", scanId: "s", clientId: null, status: "draft_ready", reason: null, commercialState: "needs_pricing", pricing: null,
    executiveSummary: "…", observedSituation: "…", keyIssues: [], opportunities: [],
    recommendedWork: [1, 2, 3, 4, 5].map((n) => ({ sourceId: `w${n}`, title: `Item ${n}`, solution: `Do ${n}`, priority: "medium", effort: "Medium", evidenceIds: [`e${n}`] })),
    competitorContext: null, proposedNextStep: "…", supportingEvidenceIds: [], confidence: { value: 60, band: "moderate" },
    reviewRequired: true, sourceArtifacts: [], checksum: "x", generatedAt: "t",
  };
  const dto = (content: unknown): ArtifactDTO => ({ id: "cp1", kind: "proposal", version: 1, status: "valid", createdAt: "t", content: content as Record<string, unknown> });

  it("a needs_pricing draft exposes present + draftReady + all five editable work items", () => {
    const v = buildCommercialProposalView(dto(draftContent));
    expect(v.present).toBe(true); // → the workspace renders its editor (not the "Not drafted" fallback)
    expect(v.draftReady).toBe(true);
    expect(v.needsPricing).toBe(true);
    expect(v.workItems).toHaveLength(5); // → five editable rows, sourced from the commercial proposal
    expect(v.workItems.every((w) => w.sourceId !== "" && w.amountMinor === null)).toBe(true); // unpriced, ready to edit
  });

  it("a persisted price line pre-fills the editor for that item and marks the proposal priced", () => {
    const priced = { ...draftContent, commercialState: "priced", pricing: { currency: "USD", items: [{ sourceId: "w1", pricingType: "recurring", amountMinor: 30000, cadence: "monthly", quantity: 1, optional: false, adminNotes: "" }], discountMinor: 0, subtotalOneTimeMinor: 0, totalOneTimeMinor: 0, totalRecurringMonthlyMinor: 30000, validUntil: null, commercialNotes: "", pricedBy: "u", pricedAt: "t" } };
    const v = buildCommercialProposalView(dto(priced));
    expect(v.currency).toBe("USD");
    const w1 = v.workItems.find((w) => w.sourceId === "w1")!;
    expect(w1.amountMinor).toBe(30000);
    expect(w1.pricingType).toBe("recurring");
    expect(v.needsPricing).toBe(false); // → §09 shows "Pricing complete"
  });

  it("an absent proposal yields the not-present view (workspace shows the 'Not drafted' fallback, no editor)", () => {
    expect(buildCommercialProposalView(null).present).toBe(false);
  });
});

describe("buildProposalPreview — deterministic client-facing composition", () => {
  const identity = { businessName: "ZeEvents", websiteUrl: "https://zeevents.xyz" };

  it("composes the preview from the PERSISTED commercial pricing (formatted, no invention)", () => {
    const p = buildProposalPreview(pricedProposalContent, identity, "scan-p");
    expect(p.present).toBe(true);
    expect(p.prospectName).toBe("ZeEvents");
    expect(p.work.map((w) => w.priceLabel)).toEqual(["$1,200.00", "$300.00/mo"]);
    expect(p.oneTimeLabel).toBe("$1,200.00");
    expect(p.monthlyLabel).toBe("$300.00/mo");
    expect(p.pricingComplete).toBe(true);
    expect(p.nextStep).toMatch(/review scope/i);
    expect(p.validUntil).toBe("2026-09-10");
  });

  it("falls back to website then scanId for the name — never a fabricated business name", () => {
    const p = buildProposalPreview(pricedProposalContent, { businessName: null, websiteUrl: "https://zeevents.xyz" }, "scan-p");
    expect(p.prospectName).toBe("https://zeevents.xyz");
    const p2 = buildProposalPreview(pricedProposalContent, { businessName: null, websiteUrl: null }, "scan-p");
    expect(p2.prospectName).toBe("scan-p");
  });

  it("an unpriced draft previews with no price labels and flags pricing required", () => {
    const unpriced = { ...pricedProposalContent, commercialState: "needs_pricing", pricing: null };
    const p = buildProposalPreview(unpriced, identity, "scan-p");
    expect(p.present).toBe(true);
    expect(p.pricingComplete).toBe(false);
    expect(p.work.every((w) => w.priceLabel === null)).toBe(true);
    expect(p.oneTimeLabel).toBeNull();
  });

  it("an insufficient-evidence stub (no real draft) yields a not-present preview", () => {
    const p = buildProposalPreview({ status: "insufficient_evidence", recommendedWork: [] }, identity, "scan-p");
    expect(p.present).toBe(false);
  });
});

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
