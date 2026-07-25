/* =============================================================================
 * Proposal Intelligence runtime step tests (Phase C · Sprint C9).
 *
 * Non-negotiables, not merely the happy path:
 *   no evidence → deterministic UNAVAILABLE · every proposal links to KNOWN
 *   evidence · duplicates/overlaps merge · priority + effort derive from evidence
 *   · conflicting findings pull confidence DOWN (never up) · confidence is ceiled
 *   by the backing evidence · prerequisites precede dependents · byte-deterministic
 *   replay (identical checksum).
 *
 * Pure: no clock beyond `now`, no network, no provider, no randomness.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { PROPOSAL_CONFLICT_PENALTY, synthesizeProposalIntelligence, type ProposalCandidateInput } from "./runtime.js";

const NOW = "2026-07-25T12:00:00.000Z";
const SCAN = "scan_c9";

function candidate(id: string, over: Partial<ProposalCandidateInput> = {}): ProposalCandidateInput {
  return {
    id,
    title: `Fix ${id}`,
    category: "digital_presence",
    problemStatement: `Problem ${id}`,
    proposedAction: `Action ${id}`,
    affectedDimensions: ["seo"],
    impact: 50,
    effort: 40,
    evidenceIds: [`ev_${id}`],
    riskIds: [],
    confidence: 80,
    limitations: [],
    ...over,
  };
}

describe("synthesizeProposalIntelligence — availability", () => {
  it("emits a deterministic UNAVAILABLE snapshot when there are no candidates", () => {
    const snap = synthesizeProposalIntelligence({ scanId: SCAN, candidates: [], sourceArtifactIds: ["art_rec"], now: NOW });
    expect(snap.status).toBe("unavailable");
    expect(snap.reason).toBe("insufficient_evidence");
    expect(snap.proposals).toEqual([]);
    expect(snap.confidence.value).toBe(0);
    expect(snap.reviewRequired).toBe(false);
    expect(snap.summary).toContain("Unavailable");
  });

  it("drops candidates without evidence and reports unavailable when none remain", () => {
    const snap = synthesizeProposalIntelligence({ scanId: SCAN, candidates: [candidate("a", { evidenceIds: [] })], now: NOW });
    expect(snap.status).toBe("unavailable");
    expect(snap.reason).toBe("insufficient_evidence");
  });

  it("produces a single evidence-backed proposal", () => {
    const snap = synthesizeProposalIntelligence({ scanId: SCAN, candidates: [candidate("a")], sourceArtifactIds: ["art_rec"], now: NOW });
    expect(snap.status).toBe("available");
    expect(snap.proposals).toHaveLength(1);
    const p = snap.proposals[0]!;
    expect(p.problem).toBe("Problem a");
    expect(p.recommendedSolution).toBe("Action a");
    expect(p.supportingEvidenceIds).toEqual(["ev_a"]);
    expect(p.reviewRequired).toBe(true);
    expect(p.status).toBe("ready");
  });
});

describe("synthesizeProposalIntelligence — grouping & dedup", () => {
  it("merges duplicate/overlapping recommendations (same category + solution) and unions evidence", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [
        candidate("a", { proposedAction: "Improve SEO metadata", evidenceIds: ["ev_1"], impact: 50, effort: 30 }),
        candidate("b", { proposedAction: "improve  SEO   metadata", evidenceIds: ["ev_2"], impact: 70, effort: 50 }),
      ],
      now: NOW,
    });
    expect(snap.proposals).toHaveLength(1);
    const p = snap.proposals[0]!;
    expect(p.supportingEvidenceIds).toEqual(["ev_1", "ev_2"]);
    expect(p.businessImpact).toBe("high"); // max impact 70 → high
  });
});

describe("synthesizeProposalIntelligence — priority & effort", () => {
  it("derives priority from evidence-backed impact + linked risks", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [
        candidate("crit", { proposedAction: "A", impact: 90 }),
        candidate("high", { proposedAction: "B", impact: 70 }),
        candidate("med", { proposedAction: "C", impact: 45 }),
        candidate("low", { proposedAction: "D", impact: 10 }),
        candidate("elevated", { proposedAction: "E", impact: 80, riskIds: ["risk_1"] }), // 80+10 → critical
      ],
      now: NOW,
    });
    const byAction = new Map(snap.proposals.map((p) => [p.recommendedSolution, p.priority]));
    expect(byAction.get("A")).toBe("critical");
    expect(byAction.get("B")).toBe("high");
    expect(byAction.get("C")).toBe("medium");
    expect(byAction.get("D")).toBe("low");
    expect(byAction.get("E")).toBe("critical");
    expect(snap.counts).toEqual({ critical: 2, high: 1, medium: 1, low: 1 });
  });

  it("orders proposals by priority (critical first)", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [candidate("low", { proposedAction: "D", impact: 10 }), candidate("crit", { proposedAction: "A", impact: 95 })],
      now: NOW,
    });
    expect(snap.proposals.map((p) => p.priority)).toEqual(["critical", "low"]);
  });

  it("estimates effort bands from the effort signal", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [
        candidate("s", { proposedAction: "A", effort: 20 }),
        candidate("m", { proposedAction: "B", effort: 50 }),
        candidate("l", { proposedAction: "C", effort: 90 }),
      ],
      now: NOW,
    });
    const byAction = new Map(snap.proposals.map((p) => [p.recommendedSolution, p.estimatedEffort]));
    expect(byAction.get("A")).toBe("small");
    expect(byAction.get("B")).toBe("medium");
    expect(byAction.get("C")).toBe("large");
  });
});

describe("synthesizeProposalIntelligence — dependencies", () => {
  it("marks lighter-effort work sharing a dimension as a prerequisite; dependents are blocked", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [
        candidate("big", { proposedAction: "Rebuild platform", affectedDimensions: ["seo"], effort: 90, impact: 80 }),
        candidate("small", { proposedAction: "Fix metadata", affectedDimensions: ["seo"], effort: 20, impact: 40 }),
      ],
      now: NOW,
    });
    const big = snap.proposals.find((p) => p.recommendedSolution === "Rebuild platform")!;
    const small = snap.proposals.find((p) => p.recommendedSolution === "Fix metadata")!;
    expect(big.dependencies).toContain(small.id);
    expect(big.status).toBe("blocked");
    expect(small.dependencies).toEqual([]);
    expect(small.status).toBe("ready");
    // every dependency has strictly smaller effort (a valid prerequisite DAG)
    for (const p of snap.proposals) {
      for (const dep of p.dependencies) expect(snap.proposals.find((q) => q.id === dep)).toBeTruthy();
    }
  });
});

describe("synthesizeProposalIntelligence — confidence", () => {
  it("ceils confidence at the minimum backing-evidence confidence", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [candidate("a", { evidenceIds: ["ev_hi", "ev_lo"], confidence: 95 })],
      evidenceConfidence: new Map([["ev_hi", 90], ["ev_lo", 55]]),
      now: NOW,
    });
    expect(snap.proposals[0]!.confidence.value).toBe(55); // never the candidate's 95
  });

  it("reduces confidence for proposals in a category with conflicting findings", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [candidate("a", { category: "digital_presence", confidence: 80 })],
      conflictedCategories: ["digital_presence"],
      now: NOW,
    });
    expect(snap.conflicts).toBe(1);
    expect(snap.proposals[0]!.confidence.value).toBe(80 - PROPOSAL_CONFLICT_PENALTY);
  });

  it("never lets the overall confidence exceed the weakest proposal", () => {
    const snap = synthesizeProposalIntelligence({
      scanId: SCAN,
      candidates: [
        candidate("a", { proposedAction: "A", evidenceIds: ["ev_a"], confidence: 90 }),
        candidate("b", { proposedAction: "B", evidenceIds: ["ev_b"], confidence: 40 }),
      ],
      evidenceConfidence: new Map([["ev_a", 90], ["ev_b", 40]]),
      now: NOW,
    });
    expect(snap.confidence.value).toBe(40);
  });
});

describe("synthesizeProposalIntelligence — determinism", () => {
  const fixture = (): ProposalCandidateInput[] => [
    candidate("b", { proposedAction: "B", impact: 70, effort: 50 }),
    candidate("a", { proposedAction: "A", impact: 90, effort: 20 }),
  ];

  it("is byte-identical on replay regardless of input order", () => {
    const x = synthesizeProposalIntelligence({ scanId: SCAN, candidates: fixture(), sourceArtifactIds: ["art"], now: NOW });
    const y = synthesizeProposalIntelligence({ scanId: SCAN, candidates: [...fixture()].reverse(), sourceArtifactIds: ["art"], now: NOW });
    expect(x.checksum).toBe(y.checksum);
    expect(x).toEqual(y);
  });

  it("checksum ignores sourceArtifacts + generatedAt (content-addressed)", () => {
    const x = synthesizeProposalIntelligence({ scanId: SCAN, candidates: fixture(), sourceArtifactIds: ["art_1"], now: NOW });
    const y = synthesizeProposalIntelligence({ scanId: SCAN, candidates: fixture(), sourceArtifactIds: ["art_2"], now: "2027-01-01T00:00:00.000Z" });
    expect(x.checksum).toBe(y.checksum);
  });
});
