import { describe, it, expect } from "vitest";
import {
  MACHINES,
  MACHINE_NAMES,
  can,
  nextStates,
  isTerminal,
  isValidState,
} from "./machines.js";

describe("state machine guard — can()", () => {
  it("allows legal transitions", () => {
    expect(can("proposal", "draft", "sent")).toBe(true);
    expect(can("proposal", "viewed", "accepted")).toBe(true);
    expect(can("contract", "countersigned", "active")).toBe(true);
    expect(can("deliverable", "in_review", "revision_requested")).toBe(true);
    expect(can("onboarding", "in_progress", "in_progress")).toBe(true); // save-and-exit
  });

  it("rejects prohibited transitions", () => {
    // Must qualify a lead before sending a proposal.
    expect(can("lead", "new", "proposal_sent")).toBe(false);
    // A prospect cannot become active without account + payment.
    expect(can("clientLifecycle", "prospect", "client_active")).toBe(false);
    // Cannot mark a deliverable final without approval.
    expect(can("deliverable", "in_review", "final")).toBe(false);
    // Cannot revert a paid invoice to pending.
    expect(can("invoice", "paid", "pending")).toBe(false);
    // Cannot skip milestone approval.
    expect(can("milestone", "in_progress", "completed")).toBe(false);
  });

  it("rejects unknown machines, states, and targets", () => {
    // @ts-expect-error unknown machine name
    expect(can("nope", "a", "b")).toBe(false);
    expect(can("proposal", "does_not_exist", "sent")).toBe(false);
    expect(can("proposal", "draft", "does_not_exist")).toBe(false);
  });

  it("identifies terminal states", () => {
    expect(isTerminal("proposal", "accepted")).toBe(true);
    expect(isTerminal("lead", "won")).toBe(true);
    expect(isTerminal("payment", "succeeded")).toBe(true);
    expect(isTerminal("proposal", "draft")).toBe(false);
  });

  it("returns the legal next states", () => {
    expect(nextStates("payment", "processing")).toEqual(["succeeded", "failed", "pending_3ds"]);
    expect(nextStates("payment", "succeeded")).toEqual([]);
  });

  it("validates membership of a state in a machine", () => {
    expect(isValidState("project", "paused")).toBe(true);
    expect(isValidState("project", "banana")).toBe(false);
  });
});

describe("state machine integrity", () => {
  it("every transition target is itself a declared state", () => {
    for (const name of MACHINE_NAMES) {
      const m = MACHINES[name];
      const states = new Set<string>(m.states);
      for (const [from, targets] of Object.entries(m.transitions)) {
        expect(states.has(from), `${name}: '${from}' is a declared state`).toBe(true);
        for (const to of targets as readonly string[]) {
          expect(states.has(to), `${name}: '${from}'→'${to}' target is declared`).toBe(true);
        }
      }
    }
  });

  it("every machine's initial state is a declared state", () => {
    for (const name of MACHINE_NAMES) {
      const m = MACHINES[name];
      expect((m.states as readonly string[]).includes(m.initial)).toBe(true);
    }
  });
});
