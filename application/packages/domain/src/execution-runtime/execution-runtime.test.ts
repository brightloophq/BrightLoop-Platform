/* =============================================================================
 * Execution Runtime domain tests (Phase F · Sprint F3) — pure units.
 *
 * Lifecycle machines + illegal transitions, deployment policy evaluation,
 * idempotency keys, failure normalization + bounded retry, secret redaction,
 * drift classification, package validation + incompatibility detection.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { RuntimePolicy } from "@brightloop/schema";
import {
  canTransitionDeployment, canTransitionExecution, canTransitionRollback, canTransitionRuntime, isDeploymentTerminal,
  deployKey, rollbackKey, webhookKey,
  evaluateDeploymentPolicy, defaultPolicyPosture,
  normalizeFailure, decideRuntimeRetry, isRetryableCategory,
  sanitizeMetadata, hasNoSecrets, redactInline,
  classifyDrift,
  hashString, readNeutralPackage, validateNeutralPackage, detectIncompatibilities,
} from "./index.js";

describe("lifecycle machines", () => {
  it("permits the canonical deployment path and rejects illegal jumps", () => {
    expect(canTransitionDeployment("draft", "validating")).toBe(true);
    expect(canTransitionDeployment("deploying", "deployed")).toBe(true);
    expect(canTransitionDeployment("active", "rolling_back")).toBe(true);
    expect(canTransitionDeployment("rolling_back", "rolled_back")).toBe(true);
    // illegal: cannot jump draft → active, nor leave a terminal state
    expect(canTransitionDeployment("draft", "active")).toBe(false);
    expect(canTransitionDeployment("rolled_back", "active")).toBe(false);
    // a superseded (immutable) version can be RESTORED to active by rollback
    expect(canTransitionDeployment("superseded", "active")).toBe(true);
    expect(isDeploymentTerminal("cancelled")).toBe(true);
    expect(isDeploymentTerminal("active")).toBe(false);
  });
  it("recovers failed → queued and supersedes rolled-back", () => {
    expect(canTransitionDeployment("failed", "queued")).toBe(true);
    expect(canTransitionDeployment("rolled_back", "superseded")).toBe(true);
  });
  it("runs runtime + rollback + execution machines", () => {
    expect(canTransitionRuntime("pending_configuration", "validating")).toBe(true);
    expect(canTransitionRuntime("revoked", "healthy")).toBe(false);
    expect(canTransitionRollback("requested", "approved")).toBe(true);
    expect(canTransitionRollback("completed", "executing")).toBe(false);
    expect(canTransitionExecution("running", "succeeded")).toBe(true);
    expect(canTransitionExecution("succeeded", "running")).toBe(false);
  });
});

describe("idempotency keys", () => {
  it("are stable + distinct per operation", () => {
    expect(deployKey("ws", "pkg", "rt", "h1")).toBe("deploy:ws:pkg:rt:h1");
    // a modified package (new hash) ⇒ a different key ⇒ no duplicate deploy
    expect(deployKey("ws", "pkg", "rt", "h1")).not.toBe(deployKey("ws", "pkg", "rt", "h2"));
    expect(rollbackKey("a", "b")).toBe("rollback:a:b");
    expect(webhookKey("n8n", "rt", "evt")).toBe("webhook:n8n:rt:evt");
  });
});

function policy(over: Partial<RuntimePolicy>): RuntimePolicy {
  return { id: "pol", workspaceId: "ws", clientId: null, environment: "production", provider: "n8n", requiresApproval: true, exactHashApproval: true, rollbackRequired: true, healthCheckRequired: true, autoActivate: false, maxRetries: 3, maxExecutionMs: 1000, allowedDeployerRoles: [], createdByUserId: "u", version: 1, createdAt: "t", updatedAt: "t", ...over };
}

describe("deployment policy evaluation", () => {
  it("permits a fully-satisfied production deployment", () => {
    const r = evaluateDeploymentPolicy(policy({}), { actorRole: "owner", approvalPresent: true, approvalExpired: false, approvalHashMatches: true, rollbackTargetPresent: true, runtimeHealthy: true });
    expect(r.permitted).toBe(true);
    expect(r.violations).toEqual([]);
  });
  it("rejects on missing approval, hash mismatch, missing rollback, unhealthy runtime, role", () => {
    const r = evaluateDeploymentPolicy(policy({ allowedDeployerRoles: ["owner"] }), { actorRole: "team_member", approvalPresent: false, approvalExpired: false, approvalHashMatches: false, rollbackTargetPresent: false, runtimeHealthy: false });
    expect(r.permitted).toBe(false);
    const codes = r.violations.map((v) => v.code);
    expect(codes).toContain("role_not_allowed");
    expect(codes).toContain("approval_required");
    expect(codes).toContain("rollback_target_required");
    expect(codes).toContain("health_required");
  });
  it("flags an expired approval and a hash mismatch distinctly", () => {
    const expired = evaluateDeploymentPolicy(policy({}), { actorRole: "owner", approvalPresent: true, approvalExpired: true, approvalHashMatches: true, rollbackTargetPresent: true, runtimeHealthy: true });
    expect(expired.violations.map((v) => v.code)).toContain("approval_expired");
    const mismatch = evaluateDeploymentPolicy(policy({}), { actorRole: "owner", approvalPresent: true, approvalExpired: false, approvalHashMatches: false, rollbackTargetPresent: true, runtimeHealthy: true });
    expect(mismatch.violations.map((v) => v.code)).toContain("hash_mismatch");
  });
  it("defaults production to the strict posture and dev to the permissive one", () => {
    expect(defaultPolicyPosture("production")).toMatchObject({ requiresApproval: true, exactHashApproval: true, rollbackRequired: true, autoActivate: false });
    expect(defaultPolicyPosture("development")).toMatchObject({ requiresApproval: false, autoActivate: true });
  });
});

describe("failure normalization + bounded retry", () => {
  it("classifies retryable vs terminal categories with safe messages", () => {
    expect(isRetryableCategory("timeout")).toBe(true);
    expect(isRetryableCategory("authentication")).toBe(false);
    const f = normalizeFailure("authentication", "AUTH-401");
    expect(f.retryable).toBe(false);
    expect(f.userMessage).not.toContain("stack");
    expect(f.providerCode).toBe("AUTH-401");
    // an unsafe/long provider code is dropped
    expect(normalizeFailure("timeout", "a body with spaces and secrets").providerCode).toBe(null);
  });
  it("bounds exponential backoff and never retries terminal failures", () => {
    expect(decideRuntimeRetry("authentication", 1, { maxAttempts: 5 }).shouldRetry).toBe(false);
    const a1 = decideRuntimeRetry("timeout", 1, { maxAttempts: 3, baseDelayMs: 1000 });
    expect(a1).toMatchObject({ shouldRetry: true, nextAttempt: 2, delayMs: 1000 });
    expect(decideRuntimeRetry("timeout", 2, { maxAttempts: 3, baseDelayMs: 1000 }).delayMs).toBe(2000);
    expect(decideRuntimeRetry("timeout", 3, { maxAttempts: 3 }).shouldRetry).toBe(false); // budget exhausted
  });
});

describe("secret redaction", () => {
  it("drops sensitive keys and body-like fields, keeps benign ones", () => {
    const clean = sanitizeMetadata({ apiKey: "sk_live_abc123", Authorization: "Bearer xyz", workflowId: "wf_1", response: { huge: "body" }, nested: { password: "p", ok: 1 } });
    expect(clean["apiKey"]).toBe("[redacted]");
    expect(clean["Authorization"]).toBe("[redacted]");
    expect(clean["workflowId"]).toBe("wf_1");
    expect(clean["response"]).toBe("[redacted]");
    expect(hasNoSecrets(clean)).toBe(true);
  });
  it("redacts secret-looking substrings inline", () => {
    expect(redactInline("call with Bearer abc.def-123 token")).toContain("[redacted]");
    expect(redactInline("https://x?api_key=SECRET123&q=1")).toContain("[redacted]");
  });
});

describe("drift classification", () => {
  const baseline = { translatedWorkflowHash: "h1", workflowName: "wf", active: true, nodeCount: 5, connectionCount: 4 };
  it("detects no drift when the snapshot matches", () => {
    expect(classifyDrift(baseline, { workflowHash: "h1", workflowName: "wf", active: true, nodeCount: 5, connectionCount: 4 }).driftClass).toBe("no_drift");
  });
  it("flags missing provider workflow and destructive drift, requiring a decision", () => {
    expect(classifyDrift(baseline, { workflowHash: null, workflowName: null, active: null, nodeCount: null, connectionCount: null }).driftClass).toBe("missing_provider_workflow");
    const destructive = classifyDrift(baseline, { workflowHash: "h2", workflowName: "wf", active: true, nodeCount: 2, connectionCount: 1 });
    expect(destructive.driftClass).toBe("destructive_drift");
    expect(destructive.requiresDecision).toBe(true);
  });
  it("classifies metadata-only drift as non-destructive", () => {
    const r = classifyDrift(baseline, { workflowHash: "h1", workflowName: "renamed", active: true, nodeCount: 5, connectionCount: 4 });
    expect(r.driftClass).toBe("metadata_drift");
    expect(r.requiresDecision).toBe(false);
  });
});

describe("package validation + incompatibility", () => {
  const payload = {
    schemaVersion: "auxion.automation.v1", target: "n8n",
    workflow: { name: "Onboarding", entryStepKey: "t1" },
    nodes: [{ key: "t1", kind: "trigger", next: ["a1"], refId: null }, { key: "a1", kind: "action", next: [], refId: null }],
    triggers: [{ kind: "webhook", name: "in" }],
    actions: [{ kind: "http_request", name: "call" }],
    variables: [{ key: "v", scope: "workspace", type: "string" }],
    integrations: [{ provider: "http", capability: "request" }],
  };
  it("hashes deterministically", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
  it("validates a well-formed neutral package and rejects a broken one", () => {
    const pkg = readNeutralPackage(payload);
    expect(validateNeutralPackage(pkg).ok).toBe(true);
    const broken = readNeutralPackage({ ...payload, nodes: [{ key: "t1", kind: "trigger", next: ["missing"], refId: null }] });
    const v = validateNeutralPackage(broken);
    expect(v.ok).toBe(false);
    expect(v.issues.join(" ")).toContain("unknown step");
  });
  it("reports incompatibilities instead of silently omitting them", () => {
    const pkg = readNeutralPackage(payload);
    const support = { triggerKinds: new Set(["webhook"]), actionKinds: new Set(["http_request"]), variableTypes: new Set(["string"]), nodeKinds: new Set(["trigger", "action"]) };
    expect(detectIncompatibilities(pkg, support).compatible).toBe(true);
    const narrow = { triggerKinds: new Set<string>(), actionKinds: new Set(["http_request"]), variableTypes: new Set(["string"]), nodeKinds: new Set(["trigger", "action"]) };
    const report = detectIncompatibilities(pkg, narrow);
    expect(report.compatible).toBe(false);
    expect(report.items[0]!.kind).toBe("trigger");
    expect(report.items[0]!.remediation).not.toBe("");
  });
});
