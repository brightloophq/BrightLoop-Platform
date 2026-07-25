/* =============================================================================
 * Transformation seeding projection tests (Phase D · Sprint D1).
 *
 * Non-negotiables: the seed is a PURE, content-addressed projection — 1:1
 * initiatives from proposal items, priority/effort/impact/evidence carried
 * verbatim, dependencies rewired to initiative ids, activities emitted, the
 * checksum stable regardless of id strategy or clock, and an empty shell (never
 * fabricated work) when the proposal is unavailable.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { ProposalIntelligenceSnapshot, ProposalItem } from "@brightloop/schema";
import { seedTransformationWorkspace } from "./seed.js";

const NOW = "2026-07-25T12:00:00.000Z";
const SCAN = "run_d1";

function item(id: string, over: Partial<ProposalItem> = {}): ProposalItem {
  return {
    id,
    title: `Fix ${id}`,
    problem: `Problem ${id}`,
    recommendedSolution: `Do ${id}`,
    businessImpact: "high",
    priority: "high",
    estimatedEffort: "medium",
    dependencies: [],
    risks: [],
    confidence: { value: 70, band: "high" },
    supportingEvidenceIds: [`ev_${id}`],
    reviewRequired: true,
    status: "ready",
    ...over,
  };
}

function proposal(items: ProposalItem[], status: "available" | "unavailable" = "available"): ProposalIntelligenceSnapshot {
  return {
    id: "prop:run_d1:snapshot",
    scanId: SCAN,
    status,
    reason: status === "unavailable" ? "insufficient_evidence" : null,
    proposals: status === "available" ? items : [],
    counts: { critical: 0, high: items.length, medium: 0, low: 0 },
    conflicts: 0,
    confidence: { value: 70, band: "high" },
    evidenceIds: items.flatMap((i) => i.supportingEvidenceIds),
    sourceArtifacts: ["art_rec"],
    summary: "n proposals.",
    reviewRequired: true,
    checksum: "abc",
    generatedAt: NOW,
    formulaVersion: "pi-runtime-1.0",
  };
}

const counter = () => (prefix: string, index: number) => `${prefix}_${index}`;

const base = (p: ProposalIntelligenceSnapshot) => ({
  scanRunId: SCAN,
  clientId: "cli_1",
  proposal: p,
  proposalArtifactId: "art_prop",
  reportArtifactId: "art_report",
  now: NOW,
  idFor: counter(),
});

describe("seedTransformationWorkspace — availability", () => {
  it("produces an empty workspace shell when the proposal is unavailable (never fabricates work)", () => {
    const seed = seedTransformationWorkspace(base(proposal([], "unavailable")));
    expect(seed.workspace.status).toBe("seeded");
    expect(seed.initiatives).toEqual([]);
    expect(seed.activities).toHaveLength(1); // only workspace_created
    expect(seed.activities[0]!.type).toBe("workspace_created");
    expect(seed.workspace.scanRunId).toBe(SCAN);
  });

  it("seeds one initiative per proposal item, carrying priority/effort/impact/evidence verbatim", () => {
    const seed = seedTransformationWorkspace(base(proposal([item("a", { priority: "critical", estimatedEffort: "small", businessImpact: "high", supportingEvidenceIds: ["ev_a", "ev_x"] })])));
    expect(seed.initiatives).toHaveLength(1);
    const init = seed.initiatives[0]!;
    expect(init.priority).toBe("critical");
    expect(init.effort).toBe("small");
    expect(init.businessImpact).toBe("high");
    expect(init.supportingEvidenceIds).toEqual(["ev_a", "ev_x"]);
    expect(init.sourceProposalItemId).toBe("a");
    expect(init.proposalArtifactId).toBe("art_prop");
    expect(init.executionStatus).toBe("seeded");
  });

  it("emits a workspace_created activity plus one initiative_seeded per initiative", () => {
    const seed = seedTransformationWorkspace(base(proposal([item("a"), item("b")])));
    expect(seed.activities.map((a) => a.type)).toEqual(["workspace_created", "initiative_seeded", "initiative_seeded"]);
    expect(seed.activities.every((a) => a.commandId.startsWith(seed.seedChecksum))).toBe(true);
  });
});

describe("seedTransformationWorkspace — dependency rewiring", () => {
  it("maps proposal-item dependencies to initiative ids", () => {
    const seed = seedTransformationWorkspace(base(proposal([item("a"), item("b", { dependencies: ["a"] })])));
    const a = seed.initiatives.find((i) => i.sourceProposalItemId === "a")!;
    const b = seed.initiatives.find((i) => i.sourceProposalItemId === "b")!;
    expect(b.dependencies).toEqual([a.id]);
    expect(a.dependencies).toEqual([]);
  });
});

describe("seedTransformationWorkspace — determinism", () => {
  it("is content-addressed: identical proposals yield an identical seedChecksum", () => {
    const x = seedTransformationWorkspace(base(proposal([item("a"), item("b", { dependencies: ["a"] })])));
    const y = seedTransformationWorkspace(base(proposal([item("a"), item("b", { dependencies: ["a"] })])));
    expect(y.seedChecksum).toBe(x.seedChecksum);
    expect(y).toEqual(x);
  });

  it("checksum ignores the id strategy and clock", () => {
    const x = seedTransformationWorkspace(base(proposal([item("a")])));
    const y = seedTransformationWorkspace({
      ...base(proposal([item("a")])),
      now: "2027-01-01T00:00:00.000Z",
      idFor: (prefix: string, index: number) => `X-${prefix}-${index}`,
    });
    expect(y.seedChecksum).toBe(x.seedChecksum);
  });
});
