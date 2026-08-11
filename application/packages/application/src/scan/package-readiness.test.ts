/* Prospect Package readiness — pure fold tests (the spec's PACKAGE matrix). */
import { describe, it, expect } from "vitest";
import { computeProspectPackage, type ProspectPackageInput } from "./package-readiness.js";

const base = (over: Partial<ProspectPackageInput> = {}): ProspectPackageInput => ({
  scanCompleted: true,
  reportPresent: true,
  competitor: "ready",
  proposal: "needs_review",
  narrative: "needs_review",
  commercialFailed: false,
  commercialEnqueued: true,
  reviewDecision: "pending",
  pricingComplete: false,
  ...over,
});

describe("computeProspectPackage", () => {
  it("competitor ready + proposal + narrative → ready_for_review", () => {
    expect(computeProspectPackage(base()).state).toBe("ready_for_review");
  });

  it("competitor insufficient_evidence does NOT block readiness", () => {
    expect(computeProspectPackage(base({ competitor: "insufficient_evidence" })).state).toBe("ready_for_review");
  });

  it("proposal insufficient (no draft) → blocked", () => {
    const p = computeProspectPackage(base({ proposal: "insufficient_evidence" }));
    expect(p.state).toBe("blocked");
  });

  it("narrative missing/not-yet-run while enqueued → running (not ready)", () => {
    expect(computeProspectPackage(base({ narrative: "not_started" })).state).toBe("running");
  });

  it("a failed commercial stage → blocked", () => {
    expect(computeProspectPackage(base({ commercialFailed: true })).state).toBe("blocked");
  });

  it("pricing is not an input — a needs_pricing draft still reaches ready_for_review", () => {
    // The proposal component status is the review status, independent of pricing;
    // a draft_ready/needs_pricing proposal is `needs_review` here → ready.
    expect(computeProspectPackage(base()).componentsReady).toBe(true);
  });

  it("a recorded approval overrides the generated state (generated ≠ approved)", () => {
    expect(computeProspectPackage(base({ reviewDecision: "approved" })).state).toBe("approved");
    expect(computeProspectPackage(base({ reviewDecision: "revision_requested" })).state).toBe("revision_requested");
    expect(computeProspectPackage(base({ reviewDecision: "rejected" })).state).toBe("rejected");
  });

  it("before the core scan completes → not_started", () => {
    expect(computeProspectPackage(base({ scanCompleted: false })).state).toBe("not_started");
  });

  it("approved but pricing incomplete → NOT client-ready (approval alone is not client-ready)", () => {
    const p = computeProspectPackage(base({ reviewDecision: "approved", pricingComplete: false }));
    expect(p.state).toBe("approved");
    expect(p.clientReady).toBe(false);
    expect(p.reason).toMatch(/pricing is still required/i);
  });

  it("approved AND pricing complete → client-ready", () => {
    const p = computeProspectPackage(base({ reviewDecision: "approved", pricingComplete: true }));
    expect(p.state).toBe("approved");
    expect(p.clientReady).toBe(true);
    expect(p.reason).toMatch(/client-ready/i);
  });

  it("pricing complete WITHOUT approval is still not client-ready (human approval required)", () => {
    expect(computeProspectPackage(base({ reviewDecision: "pending", pricingComplete: true })).clientReady).toBe(false);
  });
});
