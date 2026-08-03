/* =============================================================================
 * Integration Platform — capability invocation (F4.2).
 *
 * Invoke ONE enabled connector capability (e.g. Gmail "send", Calendar "create").
 * The F4.2 completion of the F4.1 capability model: F4.1 DECLARED capabilities;
 * this executes them. Every invocation is capability-checked, tenant-owned, gated
 * on the installation being connected + the capability enabled + declared, runs
 * with a freshly-resolved (auto-refreshed) access token, is normalized through the
 * adapter, and is audited. Secrets never enter the input, output, or audit.
 * ========================================================================== */

import { findConnectorCapability } from "@brightloop/domain";
import { requireConnectorAdapters, INTEGRATION_INVOKE_CAP, type AppContext } from "../context.js";
import { ConflictError, NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { requireId, requireString } from "../validate.js";
import { adapterFor, auditInstallation, loadInstallation, resolveConnectorSecret } from "./shared.js";
import type { OperationResultDTO } from "./dto.js";

const OPERABLE = new Set(["connected", "degraded"]);

export interface InvokeConnectorCapabilityInput { installationId: string; capabilityKey: string; input?: Record<string, unknown> }

/** Invoke one enabled connector capability against the live provider. */
export async function invokeConnectorCapability(ctx: AppContext, raw: InvokeConnectorCapabilityInput): Promise<OperationResultDTO> {
  const inst = await loadInstallation(ctx, requireId(raw.installationId, "installationId"), INTEGRATION_INVOKE_CAP);
  const capabilityKey = requireString(raw.capabilityKey, "capabilityKey");
  if (!OPERABLE.has(inst.status)) throw new ConflictError("The connector is not in an operable state");

  // The capability must be DECLARED by the connector AND ENABLED on the installation.
  const capability = findConnectorCapability(inst.connectorId, capabilityKey);
  if (capability === null) throw new NotFoundError("connector capability");
  if (!inst.enabledCapabilities.includes(capabilityKey)) throw new ValidationError("This capability is not enabled for the installation", { capabilityKey: "not_enabled" });

  const adapter = adapterFor(ctx, inst.connectorId);
  if (requireConnectorAdapters(ctx)[inst.connectorId]?.execute === undefined || adapter.execute === undefined) {
    throw new ValidationError("This connector does not support capability invocation", { connectorId: "no_execute" });
  }

  const secret = await resolveConnectorSecret(ctx, inst, adapter);
  const res = await adapter.execute({
    connectorId: inst.connectorId, operation: capability.operation, authMethod: inst.authMethod,
    config: inst.config, secret, input: raw.input ?? {},
  });

  if (!res.ok) {
    await auditInstallation(ctx, inst, "invoke", inst.status, inst.status, `Invoke ${capabilityKey} failed (${res.category})`);
    if (res.category === "authentication") throw new RuntimeUnavailableError("The connector must be reconnected");
    if (res.category === "authorization") throw new ValidationError("The connector is missing a required permission", { capabilityKey: "permission_missing" });
    throw new ValidationError(`The connector operation failed (${res.category})`);
  }

  await auditInstallation(ctx, inst, "invoke", inst.status, inst.status, `Invoked ${capabilityKey}`);
  return { connectorId: inst.connectorId, capabilityKey, data: res.value.data };
}
