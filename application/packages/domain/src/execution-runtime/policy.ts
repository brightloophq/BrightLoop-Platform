/* =============================================================================
 * Execution Runtime — deployment policy evaluation (Phase F · Sprint F3). PURE.
 *
 * A tenant-scoped runtime policy governs whether a deployment may proceed in a
 * given environment: approval requirements, exact-hash binding, rollback target,
 * health, allowed deployer roles. Evaluation returns the unmet requirements as
 * structured violations — the use-case never re-implements policy. No io.
 * ========================================================================== */

import type { RuntimeFailureCategory, RuntimePolicy } from "@brightloop/schema";

export interface PolicyContext {
  actorRole: string;
  /** An approval exists AND is still valid (not expired). */
  approvalPresent: boolean;
  approvalExpired: boolean;
  /** The approval binds the exact current package hash. */
  approvalHashMatches: boolean;
  rollbackTargetPresent: boolean;
  runtimeHealthy: boolean;
}

export interface PolicyViolation { code: string; category: RuntimeFailureCategory; detail: string }

export interface PolicyEvaluation {
  permitted: boolean;
  autoActivate: boolean;
  violations: PolicyViolation[];
}

/** Evaluate a deployment against its runtime policy. Deterministic. */
export function evaluateDeploymentPolicy(policy: RuntimePolicy, ctx: PolicyContext): PolicyEvaluation {
  const violations: PolicyViolation[] = [];
  const v = (code: string, category: RuntimeFailureCategory, detail: string) => violations.push({ code, category, detail });

  if (policy.allowedDeployerRoles.length > 0 && !policy.allowedDeployerRoles.includes(ctx.actorRole)) {
    v("role_not_allowed", "authorization", `role ${ctx.actorRole} may not deploy in ${policy.environment}`);
  }
  if (policy.requiresApproval) {
    if (!ctx.approvalPresent) v("approval_required", "approval_missing", "policy requires an approval");
    else if (ctx.approvalExpired) v("approval_expired", "approval_expired", "the approval has expired");
    if (policy.exactHashApproval && ctx.approvalPresent && !ctx.approvalHashMatches) {
      v("hash_mismatch", "package_mismatch", "approval does not bind the exact package hash");
    }
  }
  if (policy.rollbackRequired && !ctx.rollbackTargetPresent) {
    v("rollback_target_required", "validation", "policy requires an available rollback target");
  }
  if (policy.healthCheckRequired && !ctx.runtimeHealthy) {
    v("health_required", "provider_unavailable", "policy requires a healthy runtime");
  }
  return { permitted: violations.length === 0, autoActivate: policy.autoActivate, violations };
}

/** The default (safe) policy posture for an environment when none is configured. */
export function defaultPolicyPosture(environment: RuntimePolicy["environment"]): Pick<RuntimePolicy,
  "requiresApproval" | "exactHashApproval" | "rollbackRequired" | "healthCheckRequired" | "autoActivate"> {
  switch (environment) {
    case "development": return { requiresApproval: false, exactHashApproval: false, rollbackRequired: false, healthCheckRequired: false, autoActivate: true };
    case "staging": return { requiresApproval: true, exactHashApproval: false, rollbackRequired: false, healthCheckRequired: true, autoActivate: false };
    case "production": return { requiresApproval: true, exactHashApproval: true, rollbackRequired: true, healthCheckRequired: true, autoActivate: false };
  }
}
