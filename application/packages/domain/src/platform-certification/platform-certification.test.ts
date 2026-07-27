/* =============================================================================
 * Platform certification domain tests (Phase E · Sprint E8) — pure units.
 *
 * The audit engine must certify the LIVE platform metadata: layered architecture,
 * a clean capability registry, least-privilege authorization, mandatory approvals,
 * instruction-trust precedence, and a consistent RLS/table posture.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  auditApprovals, auditArchitecture, auditAuthorization, auditBoundary, auditCapabilities, auditObservability,
  auditRls, auditSecurity, runAllAudits, PLATFORM_CONTEXTS,
} from "./index.js";

describe("architecture audit", () => {
  it("certifies a layered, acyclic dependency graph", () => {
    const r = auditArchitecture();
    expect(r.outcome).toBe("passed");
    expect(r.issues).toEqual([]);
    // every declared dependency points to an earlier context
    const idx = new Map(PLATFORM_CONTEXTS.map((c, i) => [c.key, i]));
    for (const c of PLATFORM_CONTEXTS) for (const d of c.dependsOn) expect(idx.get(d)!).toBeLessThan(idx.get(c.key)!);
  });
});

describe("capability + boundary audit", () => {
  it("passes: unique keys, public services, no external side effects", () => {
    const cap = auditCapabilities();
    expect(cap.outcome).toBe("passed");
    const bnd = auditBoundary();
    expect(bnd.outcome).toBe("passed");
  });
});

describe("authorization audit", () => {
  it("certifies least privilege: owner holds all, clients hold no write capability", () => {
    const r = auditAuthorization();
    expect(r.outcome).toBe("passed");
    expect(r.checks.some((c) => c.name.includes("client_denied"))).toBe(true);
    expect(r.checks.filter((c) => c.name.includes("client_denied")).every((c) => c.ok)).toBe(true);
  });
});

describe("approval + security + rls + observability audits", () => {
  it("certifies mandatory approvals are enforced", () => {
    const r = auditApprovals();
    expect(r.outcome).toBe("passed");
    for (const cls of ["plan_approval", "workflow_publish", "deployment_package"]) expect(r.checks.some((c) => c.name === `mandatory:${cls}` && c.ok)).toBe(true);
  });
  it("certifies security invariants (no external caps, policy precedence)", () => {
    const r = auditSecurity();
    expect(r.outcome).toBe("passed");
    expect(r.checks.find((c) => c.name === "policy_first")!.ok).toBe(true);
    expect(r.checks.find((c) => c.name === "evidence_below_policy")!.ok).toBe(true);
  });
  it("certifies the RLS/table posture is consistent", () => {
    expect(auditRls().outcome).toBe("passed");
    expect(auditObservability().outcome).toBe("passed");
  });
});

describe("full sweep", () => {
  it("runs one report per category with no failures", () => {
    const reports = runAllAudits();
    expect(reports.length).toBe(16);
    const categories = new Set(reports.map((r) => r.category));
    expect(categories.size).toBe(16); // checkpoint + recovery both represented
    expect(reports.every((r) => r.outcome !== "failed")).toBe(true);
    const totalChecks = reports.reduce((s, r) => s + r.total, 0);
    expect(totalChecks).toBeGreaterThan(50);
  });
});
