import { describe, it, expect } from "vitest";
import { assertTransition, transition, allowedTransitions } from "./guard.js";
import { TransitionError } from "./errors.js";

const FIXED_CLOCK = () => "2026-01-01T00:00:00.000Z";

describe("assertTransition()", () => {
  it("passes legal transitions", () => {
    expect(() => assertTransition("proposal", "draft", "sent")).not.toThrow();
    expect(() => assertTransition("milestone", "waiting_client_approval", "approved")).not.toThrow();
  });

  it("throws TransitionError with 409 on illegal transitions", () => {
    try {
      assertTransition("deliverable", "in_review", "final");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TransitionError);
      const e = err as TransitionError;
      expect(e.httpStatus).toBe(409);
      expect(e.machine).toBe("deliverable");
      expect(e.from).toBe("in_review");
      expect(e.to).toBe("final");
      expect(e.message).toContain("Illegal transition");
    }
  });

  it("blocks the documented prohibited moves", () => {
    // §03.2 must qualify a lead before a proposal
    expect(() => assertTransition("lead", "new", "proposal_sent")).toThrow(TransitionError);
    // §03.3 prospect cannot activate without account + payment
    expect(() => assertTransition("clientLifecycle", "prospect", "client_active")).toThrow(
      TransitionError,
    );
    // §03.6 cannot un-pay an invoice
    expect(() => assertTransition("invoice", "paid", "pending")).toThrow(TransitionError);
    // §03.5 contract cannot go active without both signatures
    expect(() => assertTransition("contract", "sent", "active")).toThrow(TransitionError);
  });

  it("refuses to move out of terminal states", () => {
    expect(() => assertTransition("proposal", "accepted", "revised")).toThrow(TransitionError);
    expect(() => assertTransition("payment", "succeeded", "processing")).toThrow(TransitionError);
  });
});

describe("transition()", () => {
  it("returns an audit record for a legal move", () => {
    const record = transition(
      {
        machine: "contract",
        entityId: "ctr_123",
        from: "signed_client",
        to: "countersigned",
        actorId: "usr_admin",
        reason: "countersigned by owner",
      },
      FIXED_CLOCK,
    );

    expect(record).toEqual({
      machine: "contract",
      entityId: "ctr_123",
      from: "signed_client",
      to: "countersigned",
      actorId: "usr_admin",
      reason: "countersigned by owner",
      at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("defaults reason to null", () => {
    const record = transition(
      { machine: "project", entityId: "prj_1", from: "created", to: "active", actorId: null },
      FIXED_CLOCK,
    );
    expect(record.reason).toBeNull();
  });

  it("throws before producing a record when the move is illegal", () => {
    expect(() =>
      transition(
        { machine: "project", entityId: "prj_1", from: "created", to: "completed", actorId: null },
        FIXED_CLOCK,
      ),
    ).toThrow(TransitionError);
  });
});

describe("allowedTransitions()", () => {
  it("gives the UI exactly the legal next states", () => {
    expect(allowedTransitions("milestone", "waiting_client_approval")).toEqual([
      "approved",
      "revision_requested",
    ]);
    expect(allowedTransitions("proposal", "accepted")).toEqual([]);
  });
});
