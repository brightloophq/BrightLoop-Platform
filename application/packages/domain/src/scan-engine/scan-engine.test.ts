import { describe, it, expect } from "vitest";
import {
  scanRequestSchema,
  scanJobSchema,
  scanEvidenceItemSchema,
  domainDiagnosisSchema,
  evidenceBasisSchema,
  prospectStateSchema,
} from "@brightloop/schema";
import { SCAN_PIPELINE, nextStage, isTerminalStage } from "./pipeline.js";
import { defaultEntitlementPolicy } from "./entitlements.js";

describe("scan pipeline (canonical 9 stages, PDF 26 §02)", () => {
  it("is exactly nine meaningful stages in canonical order", () => {
    expect(SCAN_PIPELINE).toHaveLength(9);
    expect(SCAN_PIPELINE[0]).toBe("discovering");
    expect(SCAN_PIPELINE.at(-1)).toBe("preparing_report");
    expect(SCAN_PIPELINE).toContain("identifying_competitors");
    expect(SCAN_PIPELINE).toContain("collecting_evidence");
    expect(SCAN_PIPELINE).toContain("building_recommendations");
  });
  it("advances one stage at a time and stops at the ninth", () => {
    expect(nextStage("discovering")).toBe("crawling");
    expect(nextStage("benchmarking")).toBe("diagnosing");
    expect(nextStage("preparing_report")).toBeNull();
    expect(isTerminalStage("preparing_report")).toBe(true);
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
  it("a job defaults to queued at stage 1 (discovering) with a resume point + retry budget", () => {
    const j = scanJobSchema.parse({ id: "job_1", scanRequestId: "scnq_1", clientId: null, queuedAt: "2026-07-19T00:00:00Z" });
    expect(j.status).toBe("queued");
    expect(j.stage).toBe("discovering");
    expect(j.lastCompletedStage).toBeNull();
    expect(j.maxAttempts).toBe(3);
  });
  it("evidence is always untrusted; diagnosis is inference + carries a basis label (facts vs inference)", () => {
    const ev = scanEvidenceItemSchema.parse({ id: "ev_1", scanId: "s1", kind: "page", providerId: "crawler.default", observedAt: "2026-07-19T00:00:00Z" });
    expect(ev.trust).toBe("untrusted");
    const dx = domainDiagnosisSchema.parse({ domainKey: "web", summary: "…", basis: "observed", confidence: { score: 0.6, method: "model" } });
    expect(dx.isInference).toBe(true);
    expect(dx.basis).toBe("observed");
  });
  it("evidence basis + prospect-queue states match the canonical vocabulary (PDF 26 §04/§06)", () => {
    expect(evidenceBasisSchema.options).toEqual(["observed", "estimated", "inferred", "unavailable"]);
    expect(prospectStateSchema.options).toEqual(["queued", "scanning", "diagnosed", "awaiting_proposal", "proposal_sent"]);
  });
});
