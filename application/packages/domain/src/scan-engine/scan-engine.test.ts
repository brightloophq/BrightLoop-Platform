import { describe, it, expect } from "vitest";
import { scanRequestSchema, scanJobSchema, scanEvidenceItemSchema, domainDiagnosisSchema } from "@brightloop/schema";
import { SCAN_PIPELINE, nextStage, isTerminalStage } from "./pipeline.js";
import { defaultEntitlementPolicy } from "./entitlements.js";

describe("scan pipeline (order)", () => {
  it("runs request → … → complete in the canonical order", () => {
    expect(SCAN_PIPELINE[0]).toBe("requested");
    expect(SCAN_PIPELINE.at(-1)).toBe("complete");
    expect(SCAN_PIPELINE).toContain("ai_orchestration");
  });
  it("advances one stage at a time and stops at the end", () => {
    expect(nextStage("requested")).toBe("crawling");
    expect(nextStage("reporting")).toBe("complete");
    expect(nextStage("complete")).toBeNull();
    expect(isTerminalStage("complete")).toBe(true);
    expect(isTerminalStage("diagnosing")).toBe(false);
  });
});

describe("default entitlement policy (access levels, billing-agnostic)", () => {
  it("public preview: headline Index only, no detail/evidence/competitors/proposal", () => {
    const e = defaultEntitlementPolicy.resolve({ tier: "public_preview" });
    expect(e.canViewIndex).toBe(true);
    expect(e.canViewDomainDetail).toBe(false);
    expect(e.canViewEvidence).toBe(false);
    expect(e.canViewCompetitors).toBe(false);
    expect(e.canGenerateProposal).toBe(false);
  });
  it("registered lead: domain detail but no evidence/competitors until committed", () => {
    const e = defaultEntitlementPolicy.resolve({ tier: "registered_lead" });
    expect(e.canViewDomainDetail).toBe(true);
    expect(e.canViewEvidence).toBe(false);
  });
  it("committed client unlocks full report only with a billing/engagement signal", () => {
    expect(defaultEntitlementPolicy.resolve({ tier: "committed_client" }).canViewEvidence).toBe(false);
    const paid = defaultEntitlementPolicy.resolve({ tier: "committed_client", hasClearedDeposit: true });
    expect(paid.canViewEvidence).toBe(true);
    expect(paid.canViewCompetitors).toBe(true);
    expect(paid.canGenerateProposal).toBe(false); // proposal is internal-only
  });
  it("internal operator can generate proposals; admin/owner sees everything", () => {
    expect(defaultEntitlementPolicy.resolve({ tier: "internal_operator" }).canGenerateProposal).toBe(true);
    const admin = defaultEntitlementPolicy.resolve({ tier: "admin_owner" });
    expect(admin.canViewEvidence).toBe(true);
    expect(admin.canGenerateProposal).toBe(true);
  });
});

describe("engine data contracts (shape integrity)", () => {
  it("a scan request parses with defaults", () => {
    const r = scanRequestSchema.parse({ id: "scnq_1", clientId: null, targetUrl: "https://example.com", tier: "public_preview", createdAt: "2026-07-19T00:00:00Z" });
    expect(r.sources).toEqual([]);
    expect(r.requestedBy).toBeNull();
  });
  it("a job defaults to queued/requested with retry budget", () => {
    const j = scanJobSchema.parse({ id: "job_1", scanRequestId: "scnq_1", clientId: null, queuedAt: "2026-07-19T00:00:00Z" });
    expect(j.status).toBe("queued");
    expect(j.stage).toBe("requested");
    expect(j.maxAttempts).toBe(3);
  });
  it("evidence is always untrusted; diagnosis is always inference (facts vs inference separated)", () => {
    const ev = scanEvidenceItemSchema.parse({ id: "ev_1", scanId: "s1", kind: "page", providerId: "crawler.default", observedAt: "2026-07-19T00:00:00Z" });
    expect(ev.trust).toBe("untrusted");
    const dx = domainDiagnosisSchema.parse({ domainKey: "web", summary: "…", confidence: { score: 0.6, method: "model" } });
    expect(dx.isInference).toBe(true);
  });
});
