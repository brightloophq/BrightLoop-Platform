/* Client Narrative assembler — pure/deterministic/presentation-only tests. */
import { describe, it, expect } from "vitest";
import { assembleClientNarrative, type AssembleClientNarrativeInput } from "./assemble.js";

const REPORT: Record<string, unknown> = {
  executiveOverview: "Acme sells widgets online.",
  indexSummary: "Overall digital maturity 60/100.",
  risks: [{ title: "Slow pages", description: "slow", evidenceIds: ["ev1"] }],
  opportunities: [{ title: "SEO gap", businessImpact: "traffic", evidenceIds: ["ev2"] }],
  confidence: { value: 62, band: "moderate" },
};
const PROPOSAL: Record<string, unknown> = { recommendedWork: [{ title: "Improve performance" }, { title: "Close the SEO gap" }] };
const base = (over: Partial<AssembleClientNarrativeInput> = {}): AssembleClientNarrativeInput => ({
  scanId: "s1",
  clientId: "c1",
  reportEnvelope: REPORT,
  proposal: PROPOSAL,
  competitorSnapshot: null,
  reportArtifactId: "report-art",
  proposalArtifactId: "proposal-art",
  competitorArtifactId: null,
  sourceArtifacts: ["report-art", "proposal-art"],
  now: "2026-08-09T00:00:00.000Z",
  id: "cnarr_1",
  ...over,
});

describe("assembleClientNarrative", () => {
  it("is deterministic — identical inputs hash identically regardless of id/timestamp", () => {
    const a = assembleClientNarrative(base({ id: "a", now: "2026-01-01T00:00:00.000Z" })).narrative;
    const b = assembleClientNarrative(base({ id: "b", now: "2026-12-31T00:00:00.000Z" })).narrative;
    expect(a.checksum).toBe(b.checksum);
  });

  it("produces the six client sections, review required, each traceable", () => {
    const { narrative } = assembleClientNarrative(base());
    expect(narrative.status).toBe("ready");
    expect(narrative.reviewRequired).toBe(true);
    expect(narrative.sections.map((s) => s.key)).toEqual(["observed", "challenges", "opportunities", "recommendation", "rationale", "next_step"]);
    const rec = narrative.sections.find((s) => s.key === "recommendation")!;
    expect(rec.supportingArtifacts).toContain("proposal-art");
    expect(rec.paragraphs.join(" ")).toContain("Improve performance");
  });

  it("states plainly when there is no proposal — no fabricated recommendation", () => {
    const { narrative } = assembleClientNarrative(base({ proposal: null, proposalArtifactId: null }));
    const rec = narrative.sections.find((s) => s.key === "recommendation")!;
    expect(rec.paragraphs.join(" ").toLowerCase()).toContain("no recommended work");
    expect(rec.supportingArtifacts).toHaveLength(0);
  });
});
