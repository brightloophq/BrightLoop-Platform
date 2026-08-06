/* =============================================================================
 * Evidence-validation projection tests (Sprint C-EV).
 *
 * Prove the SAFETY of the surface: rejected (ungrounded) claim prose never
 * crosses the boundary, tags/controls are stripped, and the taxonomy projects
 * faithfully. Pure — the mapper takes artifact envelopes, no services.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { RuntimeArtifact } from "@brightloop/schema";
import { toEvidenceValidationDTO } from "./evidence-validation.js";

const artifact = (envelope: Record<string, unknown>): RuntimeArtifact => ({ envelope } as unknown as RuntimeArtifact);

const CLAIMS = artifact({
  providerAttempted: true,
  enrichmentStatus: "partial",
  groundedCount: 1,
  rejectedCount: 1,
  support: { supported: 1, partiallySupported: 0, weakSupport: 0, unsupported: 1, contradicted: 0, surviving: 1, averageConfidence: 82 },
  claims: [{ id: "c1", claim: "The site publishes <b>contact</b> details.", evidenceIds: ["ev:1"], supportLevel: "supported", recomputedConfidence: 82, reasonCodes: ["multi_source", "observed_evidence"], survives: true }],
  rejected: [{ id: "c2", claim: "The business is the market leader.", evidenceIds: [], reasons: ["no_evidence"], supportLevel: "unsupported", recomputedConfidence: 0, reasonCodes: ["no_evidence"], survives: false }],
});

const FINDINGS = artifact({
  strengths: [{ id: "f1", kind: "strength", category: "digital_presence", title: "Clear service pages", confidence: 74, evidenceIds: ["ev:1", "ev:2"] }],
  weaknesses: [{ id: "f2", kind: "weakness", category: "conversion", title: "No online booking", confidence: 55, evidenceIds: ["ev:3"] }],
});

const BUNDLE = artifact({
  items: [
    { id: "ev:1", source: "website", state: "observed", provenance: { origin: "https://acme.test/" }, citations: ["https://acme.test/"] },
    { id: "ev:2", source: "pages", state: "observed", provenance: { origin: "https://acme.test/services" }, citations: [] },
  ],
});

describe("toEvidenceValidationDTO", () => {
  it("returns an explicit empty DTO when nothing has run", () => {
    const dto = toEvidenceValidationDTO(null, null);
    expect(dto.present).toBe(false);
    expect(dto.providerAttempted).toBe(false);
    expect(dto.findings).toEqual([]);
    expect(dto.claims).toEqual([]);
  });

  it("projects deterministic strengths and weaknesses with their evidence links", () => {
    const dto = toEvidenceValidationDTO(null, FINDINGS);
    expect(dto.present).toBe(true);
    expect(dto.findings.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(dto.findings[0]!.kind).toBe("strength");
    expect(dto.findings[0]!.evidenceIds).toEqual(["ev:1", "ev:2"]);
    expect(dto.findings[1]!.kind).toBe("weakness");
  });

  it("projects the evidence index (id → origin) for the drill-down join", () => {
    const dto = toEvidenceValidationDTO(CLAIMS, FINDINGS, BUNDLE);
    expect(dto.evidence.map((e) => e.id)).toEqual(["ev:1", "ev:2"]);
    expect(dto.evidence[0]!.url).toBe("https://acme.test/");
    expect(dto.evidence[0]!.state).toBe("observed");
  });

  it("projects the support taxonomy and surviving averages", () => {
    const dto = toEvidenceValidationDTO(CLAIMS, FINDINGS, BUNDLE);
    expect(dto.providerAttempted).toBe(true);
    expect(dto.supported).toBe(1);
    expect(dto.unsupported).toBe(1);
    expect(dto.surviving).toBe(1);
    expect(dto.averageConfidence).toBe(82);
    expect(dto.claims[0]!.supportLevel).toBe("supported");
    expect(dto.claims[0]!.reasonCodes).toContain("multi_source");
  });

  it("strips markup from a surviving claim statement (no raw HTML on the wire)", () => {
    const dto = toEvidenceValidationDTO(CLAIMS, null);
    expect(dto.claims[0]!.statement).toBe("The site publishes contact details.");
    expect(dto.claims[0]!.statement).not.toContain("<b>");
  });

  it("NEVER surfaces a rejected claim's statement — only its level and reasons", () => {
    const dto = toEvidenceValidationDTO(CLAIMS, null);
    expect(dto.rejectedClaims[0]!.statement).toBe("");
    expect(dto.rejectedClaims[0]!.supportLevel).toBe("unsupported");
    expect(dto.rejectedClaims[0]!.reasonCodes).toContain("no_evidence");
    // the ungrounded prose must not appear anywhere in the projected DTO
    expect(JSON.stringify(dto)).not.toContain("market leader");
  });
});
