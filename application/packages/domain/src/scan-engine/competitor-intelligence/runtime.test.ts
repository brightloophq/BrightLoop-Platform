/* =============================================================================
 * Competitor Intelligence runtime step tests (Phase C · Sprint C8).
 *
 * Non-negotiables, not merely the happy path:
 *   no competitor evidence → deterministic UNAVAILABLE · every statement links to
 *   KNOWN evidence · cited unknown ids are rejected, never used · duplicates
 *   collapse · conflicting evidence pulls confidence DOWN and never up · the
 *   snapshot is byte-deterministic (identical checksum on replay).
 *
 * Pure: no clock beyond `now`, no network, no provider, no randomness.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { type EngineEvidenceItem, type EvidenceConfidence } from "@brightloop/schema";
import { CONFLICT_CONFIDENCE_PENALTY, runCompetitorIntelligence } from "./runtime.js";

const NOW = "2026-07-25T12:00:00.000Z";
const SCAN = "scan_c8";

function conf(value: number): EvidenceConfidence {
  return { value, band: "high", inputs: { coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1, provenanceQuality: 1 } };
}

function competitor(id: string, value: Record<string, unknown>, overrides: Partial<EngineEvidenceItem> = {}): EngineEvidenceItem {
  return {
    id,
    scanId: SCAN,
    source: "competitors",
    state: "observed",
    timestamp: NOW,
    freshness: { ageDays: 0, band: "fresh", score: 1 },
    reliability: 0.9,
    provenance: { origin: "curated:dataset", collectedAt: NOW, method: "imported", transformed: false, transformations: [], stage: "competitor_evidence", providerId: null },
    confidence: conf(80),
    metadata: {},
    hash: `h_${id}`,
    affectedDomains: [],
    citations: [],
    visibility: "internal",
    value,
    ...overrides,
  };
}

/** A non-competitor bundle item, so the bundle is never empty. */
function website(id: string): EngineEvidenceItem {
  return competitor(id, { hasTitle: true }, { source: "website", provenance: { origin: "https://acme.test/", collectedAt: NOW, method: "crawl", transformed: false, transformations: [], stage: "crawler", providerId: null } });
}

describe("runCompetitorIntelligence — availability", () => {
  it("emits a deterministic UNAVAILABLE snapshot when there is no competitor evidence", () => {
    const snap = runCompetitorIntelligence({ scanId: SCAN, evidence: [website("ev_home")], sourceArtifactIds: ["art_bundle"], now: NOW });
    expect(snap.status).toBe("unavailable");
    expect(snap.reason).toBe("no_competitor_evidence");
    expect(snap.competitors).toEqual([]);
    expect(snap.differentiators).toEqual([]);
    expect(snap.confidence.value).toBe(0);
    expect(snap.confidence.band).toBe("very_low");
    expect(snap.reviewRequired).toBe(false);
    expect(snap.evidenceIds).toEqual([]);
    expect(snap.summary).toContain("Unavailable");
  });

  it("treats unavailable-state competitor items as no evidence", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [competitor("ev_c1", { competitor: "Rival", signal: "strength", statement: "Strong brand" }, { state: "unavailable" })],
      now: NOW,
    });
    expect(snap.status).toBe("unavailable");
    expect(snap.reason).toBe("no_competitor_evidence");
  });

  it("produces a snapshot from a single competitor", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [competitor("ev_c1", { competitor: "Rival Co", dimension: "seo", signal: "strength", statement: "Ranks page one for core terms" })],
      sourceArtifactIds: ["art_bundle"],
      now: NOW,
    });
    expect(snap.status).toBe("available");
    expect(snap.reason).toBeNull();
    expect(snap.competitors).toEqual([{ name: "Rival Co", rank: 1, evidenceIds: ["ev_c1"] }]);
    expect(snap.strengths).toEqual([{ statement: "Ranks page one for core terms", competitor: "Rival Co", dimension: "seo", evidenceIds: ["ev_c1"] }]);
    expect(snap.reviewRequired).toBe(true);
    expect(snap.evidenceIds).toEqual(["ev_c1"]);
  });
});

describe("runCompetitorIntelligence — ranking + market position", () => {
  it("ranks multiple competitors by evidence count then name, deterministically", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        competitor("ev_a1", { competitor: "Beta", signal: "strength", statement: "Broad catalog" }),
        competitor("ev_b1", { competitor: "Alpha", signal: "strength", statement: "Fast delivery" }),
        competitor("ev_b2", { competitor: "Alpha", dimension: "ux", signal: "differentiator", statement: "Slick onboarding" }),
      ],
      now: NOW,
    });
    expect(snap.competitors.map((c) => [c.name, c.rank])).toEqual([
      ["Alpha", 1], // 2 evidence ids
      ["Beta", 2], // 1 evidence id
    ]);
    expect(snap.differentiators).toHaveLength(1);
  });

  it("resolves market position from the most-frequent STATED value, never inferred", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        competitor("ev_a", { competitor: "Alpha", signal: "strength", statement: "x", marketPosition: "leader" }),
        competitor("ev_b", { competitor: "Beta", signal: "strength", statement: "y", marketPosition: "challenger" }),
        competitor("ev_c", { competitor: "Gamma", signal: "strength", statement: "z", marketPosition: "leader" }),
      ],
      now: NOW,
    });
    expect(snap.marketPosition).toBe("leader");
  });

  it("leaves market position undetermined when unstated", () => {
    const snap = runCompetitorIntelligence({ scanId: SCAN, evidence: [competitor("ev_a", { competitor: "Alpha", signal: "strength", statement: "x" })], now: NOW });
    expect(snap.marketPosition).toBe("undetermined");
  });
});

describe("runCompetitorIntelligence — evidence integrity", () => {
  it("keeps only KNOWN cited evidence ids and records the rejected ones", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        website("ev_home"),
        competitor("ev_c1", { competitor: "Rival", signal: "weakness", statement: "Thin content", supportingEvidenceIds: ["ev_home", "ev_ghost", "ev_nope"] }),
      ],
      now: NOW,
    });
    expect(snap.weaknesses[0]!.evidenceIds).toEqual(["ev_c1", "ev_home"]);
    expect(snap.rejectedEvidenceIds).toEqual(["ev_ghost", "ev_nope"]);
    expect(snap.evidenceIds).toEqual(["ev_c1", "ev_home"]);
  });

  it("collapses duplicate statements and unions their evidence ids", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        competitor("ev_1", { competitor: "Rival", dimension: "brand", signal: "strength", statement: "Recognized brand" }),
        competitor("ev_2", { competitor: "Rival", dimension: "brand", signal: "strength", statement: "Recognized brand" }),
      ],
      now: NOW,
    });
    expect(snap.strengths).toHaveLength(1);
    expect(snap.strengths[0]!.evidenceIds).toEqual(["ev_1", "ev_2"]);
  });

  it("never emits a statement without a supporting evidence id", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [competitor("ev_c1", { competitor: "Rival", signal: "opportunity", statement: "Underserved segment" })],
      now: NOW,
    });
    for (const bucket of [snap.differentiators, snap.strengths, snap.weaknesses, snap.opportunities, snap.threats]) {
      for (const s of bucket) expect(s.evidenceIds.length).toBeGreaterThan(0);
    }
  });
});

describe("runCompetitorIntelligence — confidence", () => {
  it("ceils confidence at the MINIMUM contributing-evidence confidence", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        competitor("ev_hi", { competitor: "Alpha", signal: "strength", statement: "a" }, { confidence: conf(90) }),
        competitor("ev_lo", { competitor: "Beta", signal: "strength", statement: "b" }, { confidence: conf(55) }),
      ],
      now: NOW,
    });
    expect(snap.confidence.value).toBe(55); // never the higher 90
  });

  it("reduces confidence when the same competitor+dimension carries opposing signals", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        competitor("ev_pos", { competitor: "Alpha", dimension: "pricing", signal: "strength", statement: "Aggressive pricing" }, { confidence: conf(80) }),
        competitor("ev_neg", { competitor: "Alpha", dimension: "pricing", signal: "weakness", statement: "Thin margins" }, { confidence: conf(80) }),
      ],
      now: NOW,
    });
    expect(snap.conflicts).toBe(1);
    expect(snap.confidence.value).toBe(80 - CONFLICT_CONFIDENCE_PENALTY);
  });

  it("floors reduced confidence at zero", () => {
    const snap = runCompetitorIntelligence({
      scanId: SCAN,
      evidence: [
        competitor("ev_pos", { competitor: "Alpha", dimension: "d", signal: "strength", statement: "a" }, { confidence: conf(5) }),
        competitor("ev_neg", { competitor: "Alpha", dimension: "d", signal: "weakness", statement: "b" }, { confidence: conf(5) }),
      ],
      now: NOW,
    });
    expect(snap.confidence.value).toBe(0);
  });
});

describe("runCompetitorIntelligence — determinism", () => {
  const fixture = (): EngineEvidenceItem[] => [
    competitor("ev_b", { competitor: "Beta", dimension: "seo", signal: "weakness", statement: "Slow site" }),
    competitor("ev_a", { competitor: "Alpha", dimension: "ux", signal: "differentiator", statement: "Slick onboarding", marketPosition: "challenger" }),
  ];

  it("is byte-identical on replay (same checksum, same ordering) regardless of input order", () => {
    const a = runCompetitorIntelligence({ scanId: SCAN, evidence: fixture(), sourceArtifactIds: ["art_bundle"], now: NOW });
    const b = runCompetitorIntelligence({ scanId: SCAN, evidence: [...fixture()].reverse(), sourceArtifactIds: ["art_bundle"], now: NOW });
    expect(a.checksum).toBe(b.checksum);
    expect(a).toEqual(b);
  });

  it("checksum ignores sourceArtifacts + generatedAt (content-addressed)", () => {
    const a = runCompetitorIntelligence({ scanId: SCAN, evidence: fixture(), sourceArtifactIds: ["art_1"], now: NOW });
    const b = runCompetitorIntelligence({ scanId: SCAN, evidence: fixture(), sourceArtifactIds: ["art_2"], now: "2027-01-01T00:00:00.000Z" });
    expect(a.checksum).toBe(b.checksum);
  });
});
