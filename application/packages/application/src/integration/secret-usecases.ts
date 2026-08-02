/* =============================================================================
 * Integration Platform — secret reference use-cases (F4.1).
 *
 * Rotate a connector secret. The new value goes ONLY to the secret store; the
 * reference row records a new version + reset validation posture. Owner/admin
 * authority (INTEGRATION_CRED_CAP). The value never enters a DTO, log, or row.
 * ========================================================================== */

import { authorize, requireConnectorSecrets, requireIntegration, INTEGRATION_CRED_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";

export interface RotateSecretResultDTO { referenceId: string; version: string; validationState: string; rotatedAt: string | null }

/** Rotate the secret behind a connector secret reference. */
export async function rotateConnectorSecret(ctx: AppContext, rawReferenceId: unknown, newSecret: unknown): Promise<RotateSecretResultDTO> {
  const referenceId = requireId(rawReferenceId, "referenceId");
  const secret = requireString(newSecret, "secret");
  const repo = requireIntegration(ctx);
  const store = requireConnectorSecrets(ctx);
  const ref = unwrap(await repo.secrets.getById(referenceId));
  if (ref === null) throw new NotFoundError("secret reference");
  authorize(ctx.actor, INTEGRATION_CRED_CAP, ref.clientId);
  const version = await store.rotateSecret(ref.secretRef, secret);
  const next = unwrap(await repo.secrets.save({ ...ref, secretVersion: version, validationState: "unverified", rotatedAt: ctx.clock(), updatedAt: ctx.clock() }));
  return { referenceId: next.id, version: next.secretVersion, validationState: next.validationState, rotatedAt: next.rotatedAt };
}
