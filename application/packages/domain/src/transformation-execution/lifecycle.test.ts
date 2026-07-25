/* =============================================================================
 * Initiative lifecycle state-machine tests (Phase D · Sprint D2).
 *
 * The lifecycle is deterministic and forward-only. Every legal edge succeeds and
 * bumps the version; every illegal edge (skip, reversal, post-terminal) is
 * rejected without mutation; each transition carries the right event + activity.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { Initiative, InitiativeExecutionStatus } from "@brightloop/schema";
import {
  activateInitiative,
  archiveInitiative,
  canTransitionInitiative,
  completeInitiative,
  planInitiative,
  transitionInitiative,
} from "./lifecycle.js";

function initiative(status: InitiativeExecutionStatus, version = 1): Initiative {
  return {
    id: "init_1", workspaceId: "txw_1", clientId: "cli_1", sourceProposalItemId: "prop:1",
    title: "Fix SEO", objective: "Do SEO", priority: "high", effort: "small", businessImpact: "high",
    dependencies: [], supportingEvidenceIds: ["ev_1"], proposalArtifactId: "art_prop",
    executionStatus: status, version, createdAt: "2026-07-25T00:00:00.000Z",
  };
}

const LEGAL: [InitiativeExecutionStatus, InitiativeExecutionStatus][] = [
  ["seeded", "planned"], ["planned", "active"], ["active", "completed"], ["completed", "archived"],
];
const ILLEGAL: [InitiativeExecutionStatus, InitiativeExecutionStatus][] = [
  ["seeded", "active"], ["seeded", "completed"], ["seeded", "archived"],
  ["planned", "completed"], ["planned", "seeded"],
  ["active", "planned"], ["completed", "active"],
  ["archived", "planned"], ["archived", "active"], ["archived", "completed"], ["archived", "seeded"],
];

describe("initiative lifecycle — transition table", () => {
  it.each(LEGAL)("allows %s → %s", (from, to) => {
    expect(canTransitionInitiative(from, to)).toBe(true);
  });
  it.each(ILLEGAL)("rejects %s → %s", (from, to) => {
    expect(canTransitionInitiative(from, to)).toBe(false);
  });
});

describe("initiative lifecycle — pure transition", () => {
  it("advances status, bumps version, and carries the right event + activity", () => {
    const out = transitionInitiative(initiative("seeded", 1), "planned");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.initiative.executionStatus).toBe("planned");
    expect(out.value.initiative.version).toBe(2);
    expect(out.value.event).toBe("initiative.planned");
    expect(out.value.activityType).toBe("initiative_planned");
  });

  it("rejects an illegal transition without mutating the aggregate", () => {
    const out = transitionInitiative(initiative("seeded", 1), "active");
    expect(out).toEqual({ ok: false, reason: "illegal_transition" });
  });

  it("treats archived as terminal", () => {
    for (const to of ["planned", "active", "completed"] as InitiativeExecutionStatus[]) {
      expect(transitionInitiative(initiative("archived", 4), to).ok).toBe(false);
    }
  });

  it("never transitions to seeded", () => {
    expect(transitionInitiative(initiative("planned", 2), "seeded").ok).toBe(false);
  });
});

describe("initiative lifecycle — convenience services + full walk", () => {
  it("walks seeded → planned → active → completed → archived, versioning each step", () => {
    const p = planInitiative(initiative("seeded", 1));
    expect(p.ok && p.value.initiative.executionStatus).toBe("planned");
    const a = activateInitiative(p.ok ? p.value.initiative : initiative("planned", 2));
    expect(a.ok && a.value.initiative.executionStatus).toBe("active");
    const c = completeInitiative(a.ok ? a.value.initiative : initiative("active", 3));
    expect(c.ok && c.value.initiative.executionStatus).toBe("completed");
    const ar = archiveInitiative(c.ok ? c.value.initiative : initiative("completed", 4));
    expect(ar.ok && ar.value.initiative.executionStatus).toBe("archived");
    expect(ar.ok && ar.value.initiative.version).toBe(5);
  });

  it("each convenience service rejects when its precondition is unmet", () => {
    expect(activateInitiative(initiative("seeded")).ok).toBe(false);
    expect(completeInitiative(initiative("planned")).ok).toBe(false);
    expect(archiveInitiative(initiative("active")).ok).toBe(false);
  });
});
