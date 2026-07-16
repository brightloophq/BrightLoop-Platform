import { describe, it, expect } from "vitest";
import { eventForTransition } from "./events.js";
import { acquisitionFunnel, countByName, countOf, formatRate } from "./funnel.js";

describe("eventForTransition — maps guarded moves to event names", () => {
  it("maps the state-truth transitions", () => {
    expect(eventForTransition("deliverable", "approved")).toBe("deliverable.approve");
    expect(eventForTransition("deliverable", "revision_requested")).toBe(
      "deliverable.revision_request",
    );
    expect(eventForTransition("proposal", "accepted")).toBe("proposal.accept");
    expect(eventForTransition("contract", "countersigned")).toBe("contract.countersign");
    expect(eventForTransition("payment", "succeeded")).toBe("payment.succeed");
    expect(eventForTransition("clientLifecycle", "client_active")).toBe("activation.complete");
    expect(eventForTransition("lead", "won")).toBe("lead.stage.change");
  });

  it("returns null for moves not worth counting", () => {
    expect(eventForTransition("deliverable", "submitted")).toBeNull();
    expect(eventForTransition("proposal", "viewed")).toBeNull();
    expect(eventForTransition("payment", "processing")).toBeNull();
    // @ts-expect-error unknown machine
    expect(eventForTransition("nope", "x")).toBeNull();
  });
});

describe("countByName / countOf", () => {
  const events = [
    { name: "deliverable.approve", at: "2026-01-01" },
    { name: "deliverable.approve", at: "2026-01-02" },
    { name: "proposal.accept", at: "2026-01-03" },
  ];

  it("counts by name", () => {
    expect(countByName(events)).toEqual({ "deliverable.approve": 2, "proposal.accept": 1 });
  });

  it("counts a single name", () => {
    expect(countOf(events, "deliverable.approve")).toBe(2);
    expect(countOf(events, "payment.succeed")).toBe(0);
  });
});

describe("acquisitionFunnel — rates never divide by zero", () => {
  it("computes stage-over-stage conversion", () => {
    const f = acquisitionFunnel({
      assessments: 100,
      proposalsAccepted: 40,
      contractsSigned: 30,
      activations: 25,
    });
    expect(f[0]).toMatchObject({ key: "assessment", count: 100, rate: null });
    expect(f[1]).toMatchObject({ count: 40, rate: 0.4 });
    expect(f[2]!.rate).toBeCloseTo(0.75);
    expect(f[3]!.rate).toBeCloseTo(25 / 30);
  });

  it("returns null rate rather than NaN/Infinity when the upstream stage is zero", () => {
    const f = acquisitionFunnel({
      assessments: 0,
      proposalsAccepted: 0,
      contractsSigned: 0,
      activations: 0,
    });
    for (const stage of f) {
      expect(stage.rate === null || Number.isFinite(stage.rate)).toBe(true);
    }
    expect(f[1]!.rate).toBeNull(); // 0 assessments upstream
  });

  it("handles a jump (activation without a recorded signed contract) without exploding", () => {
    const f = acquisitionFunnel({
      assessments: 10,
      proposalsAccepted: 5,
      contractsSigned: 0,
      activations: 3,
    });
    expect(f[3]!.rate).toBeNull(); // 0 contracts upstream → null, not Infinity
  });
});

describe("formatRate", () => {
  it("formats a rate as a percent, or — when null", () => {
    expect(formatRate(0.4)).toBe("40%");
    expect(formatRate(0.756)).toBe("76%");
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
  });
});
