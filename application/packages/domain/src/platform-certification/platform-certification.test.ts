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
  auditRls, auditRuntime, auditSecurity, runAllAudits, PLATFORM_CONTEXTS,
} from "./index.js";
import { CAPABILITY_REGISTRY, externalGovernanceIssues, isGovernedExternalCapability, type CapabilitySpec } from "../agents/index.js";

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
  it("passes: unique keys, public services, GOVERNED external side effects (F3)", () => {
    const cap = auditCapabilities();
    expect(cap.outcome).toBe("passed");
    // F3: external capabilities now exist and are certified as governed (not absent).
    expect(CAPABILITY_REGISTRY.some((c) => c.sideEffect === "external")).toBe(true);
    expect(cap.checks.some((c) => c.name.endsWith(".external_governed"))).toBe(true);
    const bnd = auditBoundary();
    expect(bnd.outcome).toBe("passed");
  });
});

describe("runtime side-effect governance audit (F3)", () => {
  const governed: CapabilitySpec = {
    key: "runtime.deploy_test", owningContext: "execution-runtime", service: "deployPackage", requiredPermission: "deployment.deploy",
    sideEffect: "external", approval: "required", approvalClass: "external_side_effect", retry: "idempotent_retry", idempotency: "idempotent",
    timeoutMs: 60_000, costCategory: "high", description: "t", provider: "n8n", audited: true, rollback: "supported",
    observableOperation: "runtime.deploy_workflow", promotion: true,
  };

  it("certifies that all registered external capabilities are governed", () => {
    const r = auditRuntime();
    expect(r.outcome).toBe("passed");
    expect(r.checks.some((c) => c.name.endsWith(".provider_boundary"))).toBe(true);
  });

  it("PROOF: a compliant governed external capability passes", () => {
    expect(externalGovernanceIssues(governed)).toEqual([]);
    expect(isGovernedExternalCapability(governed)).toBe(true);
  });
  it("PROOF: an unapproved promoting deployment capability fails", () => {
    const bad = { ...governed, approval: "none" as const, approvalClass: null };
    expect(isGovernedExternalCapability(bad)).toBe(false);
    expect(externalGovernanceIssues(bad).join(" ")).toContain("mandatory approval");
  });
  it("PROOF: a non-idempotent retryable external capability fails", () => {
    const bad = { ...governed, idempotency: "non_idempotent" as const, retry: "at_least_once" as const };
    expect(externalGovernanceIssues(bad).join(" ")).toContain("non-idempotent");
  });
  it("PROOF: a side-effectful capability without an audit policy fails", () => {
    const bad = { ...governed, audited: false };
    expect(externalGovernanceIssues(bad).join(" ")).toContain("audit policy");
  });
  it("PROOF: a promoting production action without rollback/compensation fails", () => {
    const bad = { ...governed, rollback: "none" as const };
    expect(externalGovernanceIssues(bad).join(" ")).toContain("rollback/compensation");
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
  it("certifies security invariants (external side effects governed, policy precedence)", () => {
    const r = auditSecurity();
    expect(r.outcome).toBe("passed");
    expect(r.checks.find((c) => c.name === "external_side_effects_governed")!.ok).toBe(true);
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
    expect(reports.length).toBe(17);
    const categories = new Set(reports.map((r) => r.category));
    expect(categories.size).toBe(17); // checkpoint + recovery both represented; + runtime (F3)
    expect(reports.every((r) => r.outcome !== "failed")).toBe(true);
    const totalChecks = reports.reduce((s, r) => s + r.total, 0);
    expect(totalChecks).toBeGreaterThan(50);
  });
});
