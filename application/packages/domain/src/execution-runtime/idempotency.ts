/* =============================================================================
 * Execution Runtime — idempotency keys (Phase F · Sprint F3). PURE.
 *
 * Every provider-changing operation derives a STABLE key so a repeated request
 * returns the existing result, never a duplicate workflow / deployment / audit
 * event. Keys are deterministic string joins — no clock, no randomness.
 * ========================================================================== */

const join = (...parts: readonly (string | number)[]): string => parts.map((p) => String(p)).join(":");

/** deploy: workspace + package + runtime + packageHash (a modified package ⇒ new key). */
export const deployKey = (workspaceId: string, deploymentPackageId: string, runtimeId: string, packageHash: string): string =>
  join("deploy", workspaceId, deploymentPackageId, runtimeId, packageHash);

/** activate: deployment + version + "activate". */
export const activateKey = (deploymentId: string, deploymentVersion: number): string =>
  join("activate", deploymentId, deploymentVersion);

export const operationKey = (op: string, deploymentId: string, deploymentVersion: number): string =>
  join(op, deploymentId, deploymentVersion);

/** rollback: source + target + "rollback". */
export const rollbackKey = (sourceDeploymentId: string, targetDeploymentId: string): string =>
  join("rollback", sourceDeploymentId, targetDeploymentId);

/** webhook receipt: provider + runtime + externalEventId. */
export const webhookKey = (provider: string, runtimeId: string, externalEventId: string): string =>
  join("webhook", provider, runtimeId, externalEventId);
