import { describe, expect, it } from "vitest";
import { classifyClaimSupport, type SupportInput } from "./support.js";
import type { EvidenceFacts } from "./grounding.js";
import type { GroundingRejection } from "@brightloop/schema";

const fact = (over: Partial<EvidenceFacts> = {}): EvidenceFacts => ({ state: "observed", freshnessBand: "fresh", confidenceValue: 90, ...over });
const reject = (reason: GroundingRejection["reason"]): GroundingRejection => ({ reason, claimId: "c", detail: reason });
const base = (over: Partial<SupportInput> = {}): SupportInput => ({ citedFacts: [fact()], rejections: [], providerConfidence: 90, ...over });

describe("classifyClaimSupport — negative outcomes", () => {
  it("contradicts a claim resting on an unavailable source", () => {
    const r = classifyClaimSupport(base({ rejections: [reject("references_unavailable_source")] }));
    expect(r.level).toBe("contradicted");
    expect(r.confidence).toBe(0);
    expect(r.reasonCodes).toContain("rests_on_unavailable_source");
  });

  it("contradicts a claim flagged by a bundle conflict", () => {
    const r = classifyClaimSupport(base({ conflicted: true }));
    expect(r.level).toBe("contradicted");
    expect(r.reasonCodes).toContain("evidence_conflict");
  });

  it("marks a claim with no cited evidence as unsupported", () => {
    const r = classifyClaimSupport(base({ citedFacts: [], rejections: [reject("no_evidence")] }));
    expect(r.level).toBe("unsupported");
    expect(r.confidence).toBe(0);
    expect(r.reasonCodes).toContain("no_evidence");
  });

  it("marks a fabricated metric as unsupported and names the reason", () => {
    const r = classifyClaimSupport(base({ rejections: [reject("fabricated_metric")] }));
    expect(r.level).toBe("unsupported");
    expect(r.reasonCodes).toContain("fabricated_metric");
  });

  it("contradiction takes precedence over an unsupported reason", () => {
    const r = classifyClaimSupport(base({ rejections: [reject("references_unavailable_source"), reject("no_evidence")] }));
    expect(r.level).toBe("contradicted");
  });
});

describe("classifyClaimSupport — graded support", () => {
  it("SUPPORTED for multiple fresh observed sources", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact(), fact()], providerConfidence: 88 }));
    expect(r.level).toBe("supported");
    expect(r.confidence).toBeGreaterThanOrEqual(60);
    expect(r.reasonCodes).toEqual(expect.arrayContaining(["multi_source", "observed_evidence", "high_confidence"]));
  });

  it("SUPPORTED for a single strong observed source with high confidence", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact({ confidenceValue: 95 })], providerConfidence: 90 }));
    expect(r.level).toBe("supported");
  });

  it("PARTIALLY_SUPPORTED for a single observed source with moderate confidence", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact({ confidenceValue: 65 })], providerConfidence: 65 }));
    expect(r.level).toBe("partially_supported");
    expect(r.reasonCodes).toContain("single_source");
  });

  it("WEAK_SUPPORT when only inferred evidence backs the claim", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact({ state: "inferred", confidenceValue: 50 })], providerConfidence: 50 }));
    expect(r.level).toBe("weak_support");
    expect(r.reasonCodes).toEqual(expect.arrayContaining(["inferred_evidence", "low_confidence"]));
  });

  it("caps a soft-rejected claim (e.g. missing_limitations) at weak_support despite strong evidence", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact(), fact()], rejections: [reject("missing_limitations")] }));
    expect(r.level).toBe("weak_support");
    expect(r.reasonCodes).toContain("missing_limitations");
  });

  it("WEAK_SUPPORT when all evidence is stale, even if observed", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact({ freshnessBand: "expired" }), fact({ freshnessBand: "stale" })] }));
    expect(r.level).toBe("weak_support");
    expect(r.reasonCodes).toContain("stale_evidence");
  });
});

describe("classifyClaimSupport — confidence recalculation", () => {
  it("never inflates beyond the provider's advisory confidence", () => {
    const r = classifyClaimSupport(base({ citedFacts: [fact(), fact()], providerConfidence: 40 }));
    expect(r.confidence).toBeLessThanOrEqual(40);
  });

  it("caps confidence at the evidence ceiling for weaker evidence states", () => {
    // estimated ceiling is 70; provider advised 100 — recomputed must not exceed 70.
    const r = classifyClaimSupport(base({ citedFacts: [fact({ state: "estimated", confidenceValue: 70 })], providerConfidence: 100 }));
    expect(r.confidence).toBeLessThanOrEqual(70);
  });

  it("falls back to the evidence score when the provider advised nothing", () => {
    const r = classifyClaimSupport(base({ providerConfidence: 0 }));
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("is deterministic for a repeated input", () => {
    const input = base({ citedFacts: [fact(), fact({ state: "estimated", confidenceValue: 60 })] });
    expect(classifyClaimSupport(input)).toEqual(classifyClaimSupport(input));
  });
});
