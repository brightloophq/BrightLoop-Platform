/* =============================================================================
 * Execution Runtime — lifecycle state machines (Phase F · Sprint F3). PURE.
 *
 * Every legal transition is declared here; anything else fails deterministically.
 * The deployment DEFINITION (package id, hash, external ids, version) is immutable
 * once deployed — only status/activation move through these machines. No io.
 * ========================================================================== */

import type { ActivationState, RuntimeDeploymentStatus, RuntimeExecutionStatus, RuntimeStatus, RollbackStatus } from "@brightloop/schema";

function machine<S extends string>(edges: Record<S, readonly S[]>) {
  const can = (from: S, to: S): boolean => (edges[from] ?? []).includes(to);
  const isTerminal = (s: S): boolean => (edges[s] ?? []).length === 0;
  return { can, isTerminal, edges };
}

/* ---- deployment lifecycle -------------------------------------------------- */

export const DEPLOYMENT_TRANSITIONS: Record<RuntimeDeploymentStatus, readonly RuntimeDeploymentStatus[]> = {
  draft: ["validating", "cancelled"],
  validating: ["awaiting_approval", "queued", "failed", "cancelled"],
  awaiting_approval: ["queued", "cancelled", "failed"],
  queued: ["deploying", "cancelled", "failed"],
  deploying: ["deployed", "failed"],
  deployed: ["activating", "active", "superseded", "failed"],
  activating: ["active", "failed"],
  active: ["paused", "degraded", "rolling_back", "superseded"],
  paused: ["active", "rolling_back", "superseded", "cancelled"],
  degraded: ["active", "paused", "rolling_back", "failed"],
  failed: ["queued", "cancelled", "rolling_back"],
  rolling_back: ["rolled_back", "failed"],
  rolled_back: ["superseded"],
  // A superseded deployment is an immutable, previously-valid version that rollback
  // can RESTORE to active (it is never rebuilt) — so it is not strictly terminal.
  superseded: ["active"],
  cancelled: [],
};
const deployment = machine(DEPLOYMENT_TRANSITIONS);
export const canTransitionDeployment = (from: RuntimeDeploymentStatus, to: RuntimeDeploymentStatus): boolean => deployment.can(from, to);
export const isDeploymentTerminal = (s: RuntimeDeploymentStatus): boolean => deployment.isTerminal(s);

/** Activation is derived from a small machine layered over the lifecycle. */
export const ACTIVATION_TRANSITIONS: Record<ActivationState, readonly ActivationState[]> = {
  inactive: ["active"],
  active: ["paused", "inactive"],
  paused: ["active", "inactive"],
};
export const canTransitionActivation = (from: ActivationState, to: ActivationState): boolean =>
  (ACTIVATION_TRANSITIONS[from] ?? []).includes(to);

/* ---- runtime registration lifecycle ---------------------------------------- */

export const RUNTIME_TRANSITIONS: Record<RuntimeStatus, readonly RuntimeStatus[]> = {
  pending_configuration: ["validating", "disabled"],
  validating: ["healthy", "degraded", "unavailable", "disabled"],
  healthy: ["degraded", "unavailable", "disabled", "revoked", "validating"],
  degraded: ["healthy", "unavailable", "disabled", "revoked", "validating"],
  unavailable: ["healthy", "degraded", "disabled", "revoked", "validating"],
  disabled: ["validating", "revoked"],
  revoked: [],
};
const runtime = machine(RUNTIME_TRANSITIONS);
export const canTransitionRuntime = (from: RuntimeStatus, to: RuntimeStatus): boolean => runtime.can(from, to);
export const isRuntimeTerminal = (s: RuntimeStatus): boolean => runtime.isTerminal(s);

/* ---- rollback request lifecycle -------------------------------------------- */

export const ROLLBACK_TRANSITIONS: Record<RollbackStatus, readonly RollbackStatus[]> = {
  requested: ["approved", "failed"],
  approved: ["executing", "failed"],
  executing: ["completed", "failed"],
  completed: [],
  failed: [],
};
const rollback = machine(ROLLBACK_TRANSITIONS);
export const canTransitionRollback = (from: RollbackStatus, to: RollbackStatus): boolean => rollback.can(from, to);

/* ---- runtime execution lifecycle (normalized from provider states) --------- */

export const EXECUTION_TRANSITIONS: Record<RuntimeExecutionStatus, readonly RuntimeExecutionStatus[]> = {
  discovered: ["queued", "running", "waiting", "succeeded", "failed", "cancelled", "unknown"],
  queued: ["running", "waiting", "cancelled", "failed", "unknown"],
  running: ["waiting", "succeeded", "failed", "cancelled", "unknown"],
  waiting: ["running", "succeeded", "failed", "cancelled", "unknown"],
  succeeded: [],
  failed: [],
  cancelled: [],
  unknown: ["queued", "running", "waiting", "succeeded", "failed", "cancelled"],
};
const execution = machine(EXECUTION_TRANSITIONS);
export const canTransitionExecution = (from: RuntimeExecutionStatus, to: RuntimeExecutionStatus): boolean => execution.can(from, to);
export const isExecutionTerminal = (s: RuntimeExecutionStatus): boolean => execution.isTerminal(s);
