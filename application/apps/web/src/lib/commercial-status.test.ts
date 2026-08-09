/* =============================================================================
 * Coherent commercial status derivation (post-scan competitor UX).
 *
 * Proves the competitor view no longer collapses five realities into one
 * "Unavailable": the label distinguishes NOT RUN / READY / REVIEW REQUIRED /
 * INSUFFICIENT EVIDENCE from the persisted snapshot + whether the scan completed.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { buildCompetitorIntelligenceView, commercialBadgeStatus, commercialStatusLabel } from "./prospect-scanner";

const available = (reviewRequired: boolean) => ({
  status: "available",
  reviewRequired,
  competitors: [{ name: "rival.com", rank: 1, evidenceIds: ["ev_1"] }],
  evidenceIds: ["ev_1", "compev:1"],
  confidence: { value: 40, band: "low" },
  marketPosition: "undetermined",
  summary: "1 competitor(s) assessed.",
});
const unavailable = { status: "unavailable", reviewRequired: false, competitors: [], evidenceIds: [], confidence: { value: 0, band: "very_low" }, summary: "Unavailable — no verified competitor evidence." };

describe("buildCompetitorIntelligenceView — coherent status", () => {
  it("no snapshot → not_started (Not run)", () => {
    const v = buildCompetitorIntelligenceView(null);
    expect(v.status).toBe("not_started");
    expect(v.statusLabel).toBe("Not run");
    expect(v.present).toBe(false);
  });

  it("available + reviewRequired → needs_review", () => {
    const v = buildCompetitorIntelligenceView(available(true), { scanCompleted: true });
    expect(v.status).toBe("needs_review");
    expect(v.statusLabel).toBe("Review required");
    expect(v.competitorCount).toBe(1);
  });

  it("available + no review → ready", () => {
    const v = buildCompetitorIntelligenceView(available(false), { scanCompleted: true });
    expect(v.status).toBe("ready");
    expect(v.statusLabel).toBe("Ready");
  });

  it("unavailable + scan completed → insufficient_evidence (a completed outcome, not 'not run')", () => {
    const v = buildCompetitorIntelligenceView(unavailable, { scanCompleted: true });
    expect(v.status).toBe("insufficient_evidence");
    expect(v.statusLabel).toBe("Insufficient evidence");
  });

  it("unavailable + scan NOT completed → not_started (commercial workflow has not run)", () => {
    const v = buildCompetitorIntelligenceView(unavailable, { scanCompleted: false });
    expect(v.status).toBe("not_started");
  });

  it("maps each status to a schema tone token", () => {
    expect(commercialBadgeStatus("ready")).toBe("completed");
    expect(commercialBadgeStatus("needs_review")).toBe("in_review");
    expect(commercialBadgeStatus("failed")).toBe("failed");
    expect(commercialStatusLabel("insufficient_evidence")).toBe("Insufficient evidence");
  });
});
