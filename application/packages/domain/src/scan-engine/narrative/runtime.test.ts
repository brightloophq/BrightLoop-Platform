/* =============================================================================
 * Narrative Engine runtime step tests (Phase C · Sprint C10).
 *
 * Narrative is PRESENTATION, never reasoning. These assert:
 *   no intelligence → deterministic UNAVAILABLE · a fixed section spine · every
 *   block is traceable (evidence ids + source artifacts) · confidence is CARRIED
 *   from sources, never raised · sections state unavailability rather than invent
 *   · byte-deterministic replay (identical checksum).
 *
 * Pure: no clock beyond `now`, no network, no provider, no randomness.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { CompetitorIntelligenceSnapshot, ProposalIntelligenceSnapshot } from "@brightloop/schema";
import { synthesizeNarrative, type NarrativeProspectInput, type NarrativeSynthesisInput } from "./runtime.js";

const NOW = "2026-07-25T12:00:00.000Z";
const SCAN = "scan_c10";

function prospect(over: Partial<NarrativeProspectInput> = {}): NarrativeProspectInput {
  return {
    executiveOverview: "Acme Dental is a clinic in Kingston.",
    businessIdentity: "Acme Dental",
    indexSummary: "Overall digital maturity 42/100 across 5 assessable categories.",
    confidence: { value: 60, band: "moderate" },
    strengths: [{ title: "HTTPS enabled", evidenceIds: ["ev_1"] }],
    weaknesses: [{ title: "No meta descriptions", evidenceIds: ["ev_2"] }],
    opportunities: [{ title: "Add structured data", evidenceIds: ["ev_3"] }],
    evidenceItemCount: 3,
    sourceArtifacts: ["art_findings", "art_bundle"],
    ...over,
  };
}

function competitorAvailable(): CompetitorIntelligenceSnapshot {
  return {
    id: "comp:1", scanId: SCAN, status: "available", reason: null, marketPosition: "challenger",
    competitors: [{ name: "Rival", rank: 1, evidenceIds: ["ev_c1"] }],
    differentiators: [{ statement: "Faster booking", competitor: "Rival", dimension: "ux", evidenceIds: ["ev_c1"] }],
    strengths: [], weaknesses: [], opportunities: [], threats: [],
    conflicts: 0, rejectedEvidenceIds: [], confidence: { value: 70, band: "high" },
    evidenceIds: ["ev_c1"], sourceArtifacts: ["art_bundle"], summary: "1 competitor.", reviewRequired: true,
    checksum: "x", generatedAt: NOW, formulaVersion: "ci-runtime-1.0",
  };
}

function proposalAvailable(): ProposalIntelligenceSnapshot {
  return {
    id: "prop:1", scanId: SCAN, status: "available", reason: null,
    proposals: [
      { id: "prop:1:1", title: "Add metadata", problem: "p", recommendedSolution: "s", businessImpact: "high", priority: "critical", estimatedEffort: "small", dependencies: [], risks: [], confidence: { value: 55, band: "moderate" }, supportingEvidenceIds: ["ev_2"], reviewRequired: true, status: "ready" },
      { id: "prop:1:2", title: "Rebuild", problem: "p", recommendedSolution: "s2", businessImpact: "moderate", priority: "low", estimatedEffort: "large", dependencies: ["prop:1:1"], risks: [], confidence: { value: 55, band: "moderate" }, supportingEvidenceIds: ["ev_2"], reviewRequired: true, status: "blocked" },
    ],
    counts: { critical: 1, high: 0, medium: 0, low: 1 }, conflicts: 0,
    confidence: { value: 55, band: "moderate" }, evidenceIds: ["ev_2"], sourceArtifacts: ["art_rec"],
    summary: "2 proposals.", reviewRequired: true, checksum: "y", generatedAt: NOW, formulaVersion: "pi-runtime-1.0",
  };
}

const base = (over: Partial<NarrativeSynthesisInput> = {}): NarrativeSynthesisInput => ({
  scanId: SCAN, now: NOW, prospect: prospect(), competitor: null, proposal: null, sourceArtifactIds: ["art_bundle"], ...over,
});

describe("synthesizeNarrative — availability", () => {
  it("emits a deterministic UNAVAILABLE snapshot when there is no intelligence", () => {
    const snap = synthesizeNarrative(base({ prospect: null }));
    expect(snap.status).toBe("unavailable");
    expect(snap.reason).toBe("insufficient_intelligence");
    expect(snap.sections).toEqual([]);
    expect(snap.confidence.value).toBe(0);
    expect(snap.reviewRequired).toBe(false);
    expect(snap.summary).toContain("Unavailable");
  });

  it("produces the full fixed section spine when intelligence is present", () => {
    const snap = synthesizeNarrative(base());
    expect(snap.status).toBe("available");
    expect(snap.sections.map((s) => s.key)).toEqual([
      "executive_summary", "current_state", "key_opportunities", "competitive_position",
      "recommended_priorities", "evidence_summary", "review_notes",
    ]);
    expect(snap.reviewRequired).toBe(true);
  });
});

describe("synthesizeNarrative — presentation, never reasoning", () => {
  it("states competitor unavailability rather than inventing a competitor", () => {
    const snap = synthesizeNarrative(base({ competitor: null }));
    const block = snap.sections.find((s) => s.key === "competitive_position")!;
    expect(block.paragraphs.join(" ")).toContain("No verified competitor evidence");
    expect(block.confidence.value).toBe(0);
    expect(block.supportingEvidenceIds).toEqual([]);
  });

  it("presents competitor + proposal intelligence with carried confidence (never raised)", () => {
    const snap = synthesizeNarrative(base({ competitor: competitorAvailable(), competitorArtifactId: "art_comp", proposal: proposalAvailable(), proposalArtifactId: "art_prop" }));
    const comp = snap.sections.find((s) => s.key === "competitive_position")!;
    expect(comp.confidence.value).toBe(70); // carried from the competitor snapshot, not recomputed
    expect(comp.supportingArtifacts).toContain("art_comp");
    const prio = snap.sections.find((s) => s.key === "recommended_priorities")!;
    expect(prio.confidence.value).toBe(55); // carried from the proposal snapshot
    expect(prio.supportingArtifacts).toContain("art_prop");
    // an implementation section appears only when proposals exist
    expect(snap.sections.some((s) => s.key === "implementation_considerations")).toBe(true);
  });

  it("never raises the overall confidence above the weakest presented source", () => {
    const snap = synthesizeNarrative(base({ competitor: competitorAvailable(), proposal: proposalAvailable() }));
    // sourced sections carry 60 (prospect), 70 (competitor), 55 (proposal) → floor 55
    expect(snap.confidence.value).toBe(55);
  });
});

describe("synthesizeNarrative — traceability", () => {
  it("every block carries evidence ids and/or source artifacts and requires review", () => {
    const snap = synthesizeNarrative(base({ competitor: competitorAvailable(), competitorArtifactId: "art_comp", proposal: proposalAvailable(), proposalArtifactId: "art_prop" }));
    for (const block of snap.sections) {
      expect(block.reviewRequired).toBe(true);
      expect(block.supportingEvidenceIds.length + block.supportingArtifacts.length).toBeGreaterThan(0);
    }
  });

  it("presents evidence provenance and reflects provider enrichment truthfully", () => {
    const withProvider = synthesizeNarrative(base({ providerEnriched: true }));
    const withoutProvider = synthesizeNarrative(base({ providerEnriched: false }));
    expect(withProvider.sections.find((s) => s.key === "evidence_summary")!.paragraphs.join(" ")).toContain("provider claims");
    expect(withoutProvider.sections.find((s) => s.key === "evidence_summary")!.paragraphs.join(" ")).toContain("fully deterministic");
  });
});

describe("synthesizeNarrative — determinism", () => {
  it("is byte-identical on replay", () => {
    const a = synthesizeNarrative(base({ competitor: competitorAvailable(), proposal: proposalAvailable() }));
    const b = synthesizeNarrative(base({ competitor: competitorAvailable(), proposal: proposalAvailable() }));
    expect(a.checksum).toBe(b.checksum);
    expect(a).toEqual(b);
  });

  it("checksum ignores sourceArtifacts + generatedAt (content-addressed)", () => {
    const a = synthesizeNarrative(base({ sourceArtifactIds: ["art_1"] }));
    const b = synthesizeNarrative({ ...base({ sourceArtifactIds: ["art_2"] }), now: "2027-01-01T00:00:00.000Z" });
    expect(a.checksum).toBe(b.checksum);
  });
});
