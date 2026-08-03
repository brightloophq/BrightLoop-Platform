/* =============================================================================
 * Integration Platform — installation lifecycle use-cases (F4.1).
 *
 * Install / configure / enable / disable / revoke a connector, validate its
 * connection, and probe its health. Secrets go STRAIGHT to the secret store and
 * are never persisted, logged, or returned — the installation carries only
 * references. Every command is capability-checked, tenant-owned, and audited.
 * Auxion remains the system of record.
 * ========================================================================== */

import {
  buildConnectorHealthSnapshot, buildConnectorInstallation, buildConnectorSecretReference,
  healthFromFailure, isConfigComplete, normalizeConnectorFailure, resolveEnabledCapabilities,
  sanitizeConnectorMetadata, statusFromHealth, validateConnectorConfig,
} from "@brightloop/domain";
import type { ConnectorHealthLevel, SecretPurpose } from "@brightloop/schema";
import {
  authorize, requireConnectorSecrets, requireIntegration,
  INTEGRATION_CONFIGURE_CAP, INTEGRATION_DISABLE_CAP, INTEGRATION_ENABLE_CAP, INTEGRATION_HEALTH_CAP,
  INTEGRATION_INSTALL_CAP, INTEGRATION_REVOKE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString, requireObject } from "../validate.js";
import {
  adapterFor, auditInstallation, descriptorFor, loadInstallation, resolveConnectorSecret, transitionInstallation,
} from "./shared.js";
import { toConnectorHealthDTO, toInstallationDTO, type ConnectorHealthDTO, type InstallationDTO } from "./dto.js";

const purposeForField = (key: string): SecretPurpose => (/sign/i.test(key) ? "webhook_signing" : "credential");

/** Persist each secret field into the store + a secret reference row. Returns the primary (credential) reference id. */
async function persistSecrets(
  ctx: AppContext, installationId: string, workspaceId: string, clientId: string | null,
  connectorId: string, secrets: Record<string, string>,
): Promise<string | null> {
  const repo = requireIntegration(ctx);
  const store = requireConnectorSecrets(ctx);
  let primary: string | null = null;
  for (const [field, value] of Object.entries(secrets)) {
    const purpose = purposeForField(field);
    const secretRef = ctx.ids("csec");
    await store.putSecret(secretRef, value, { connectorId, purpose, version: "1", rotatedAt: null, expiresAt: null });
    const ref = buildConnectorSecretReference({
      id: ctx.ids("csecref"), workspaceId, clientId, connectorInstallationId: installationId,
      connectorId, purpose, secretRef, metadata: { field }, createdByUserId: ctx.actor.userId, now: ctx.clock(),
    });
    unwrap(await repo.secrets.create(ref));
    if (purpose === "credential" && primary === null) primary = ref.id;
    if (primary === null) primary = ref.id;
  }
  return primary;
}

export interface InstallConnectorInput { workspaceId: string; connectorId: string; displayName?: string; config?: Record<string, unknown> }

/** Install a connector into a workspace (one per connector per workspace). */
export async function installConnector(ctx: AppContext, input: InstallConnectorInput): Promise<InstallationDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const connectorId = requireString(input.connectorId, "connectorId");
  const descriptor = descriptorFor(connectorId);
  authorize(ctx.actor, INTEGRATION_INSTALL_CAP, ctx.actor.clientId);
  if (!descriptor.available) throw new ValidationError("This connector has no live adapter and cannot be installed", { connectorId: "unavailable" });

  const repo = requireIntegration(ctx);
  const existing = unwrap(await repo.installations.findByConnector(workspaceId, connectorId));
  if (existing !== null) throw new ConflictError("This connector is already installed in the workspace");

  const submitted = input.config ? requireObject(input.config) : {};
  const validated = validateConnectorConfig(descriptor, submitted);
  if (!validated.ok) throw new ValidationError("Invalid connector configuration", Object.fromEntries(validated.issues.map((i) => [i.field, i.message])));

  const now = ctx.clock();
  const installationId = ctx.ids("cinst");
  const inst = buildConnectorInstallation({
    id: installationId, workspaceId, clientId: ctx.actor.clientId, connectorId,
    displayName: input.displayName ?? descriptor.name, authMethod: descriptor.authMethod,
    triggerKind: descriptor.triggerKinds[0] ?? "none", config: validated.config,
    enabledCapabilities: resolveEnabledCapabilities(descriptor, descriptor.capabilities.map((c) => c.key)),
    secretReferenceId: null, createdByUserId: ctx.actor.userId, correlationId: ctx.ids("corr"), now,
  });
  unwrap(await repo.installations.create(inst));
  await auditInstallation(ctx, inst, "install", null, inst.status, `Installed ${descriptor.name}`);

  const primaryRef = await persistSecrets(ctx, installationId, workspaceId, ctx.actor.clientId, connectorId, validated.secrets);
  let current = inst;
  if (primaryRef !== null) current = unwrap(await repo.installations.save({ ...inst, secretReferenceId: primaryRef, version: inst.version + 1, updatedAt: ctx.clock() }, inst.version));

  // If the config is complete, advance to `configuring` (ready to validate).
  if (isConfigComplete(descriptor, validated)) {
    current = await transitionInstallation(ctx, current, "configuring", {}, "install", "Configuration complete");
  }
  return toInstallationDTO(current);
}

export interface ConfigureConnectorInput { installationId: string; displayName?: string; config?: Record<string, unknown>; enabledCapabilities?: string[] }

/** Reconfigure an installation (non-secret config, secrets, enabled capabilities). */
export async function configureConnector(ctx: AppContext, input: ConfigureConnectorInput): Promise<InstallationDTO> {
  const inst = await loadInstallation(ctx, requireId(input.installationId, "installationId"), INTEGRATION_CONFIGURE_CAP);
  if (inst.status === "revoked") throw new ConflictError("A revoked connector cannot be reconfigured");
  const descriptor = descriptorFor(inst.connectorId);
  const repo = requireIntegration(ctx);

  const submitted = input.config ? requireObject(input.config) : {};
  // Secrets already provisioned for this installation need not be re-supplied.
  const existingRefs = unwrap(await repo.secrets.listByInstallation(inst.id));
  const provisioned = new Set<string>(existingRefs.map((r) => (typeof r.metadata["field"] === "string" ? (r.metadata["field"] as string) : "")).filter((f) => f.length > 0));
  const validated = validateConnectorConfig(descriptor, { ...inst.config, ...submitted }, provisioned);
  if (!validated.ok) throw new ValidationError("Invalid connector configuration", Object.fromEntries(validated.issues.map((i) => [i.field, i.message])));

  let primaryRef = inst.secretReferenceId;
  const fresh = await persistSecrets(ctx, inst.id, inst.workspaceId, inst.clientId, inst.connectorId, validated.secrets);
  if (fresh !== null) primaryRef = fresh;

  const enabled = input.enabledCapabilities ? resolveEnabledCapabilities(descriptor, input.enabledCapabilities) : inst.enabledCapabilities;
  const patch = {
    displayName: input.displayName ?? inst.displayName, config: sanitizeConnectorMetadata(validated.config),
    enabledCapabilities: enabled, secretReferenceId: primaryRef,
  };
  // Reconfiguration returns a fully-configured installation to `configuring` so it
  // must be re-validated before it is trusted again.
  const to = inst.status === "connected" || inst.status === "degraded" ? "configuring" : inst.status;
  const next = { ...inst, ...patch, status: to, version: inst.version + 1, updatedAt: ctx.clock() };
  const saved = unwrap(await repo.installations.save(next, inst.version));
  await auditInstallation(ctx, saved, "configure", inst.status, saved.status, "Reconfigured connector");
  return toInstallationDTO(saved);
}

/** Validate connectivity + auth against the provider (external read). */
export async function validateConnectorConnection(ctx: AppContext, rawId: unknown): Promise<{ ok: boolean; providerVersion: string | null; message: string }> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_HEALTH_CAP);
  const adapter = adapterFor(ctx, inst.connectorId);
  const secret = await resolveConnectorSecret(ctx, inst, adapter);
  const validating = await transitionInstallation(ctx, inst, "validating", {}, "validate", "Validating connection");
  const res = await adapter.validateConnection({ connectorId: inst.connectorId, authMethod: inst.authMethod, config: inst.config, secret });
  if (!res.ok) {
    const level = healthFromFailure(res.category);
    await transitionInstallation(ctx, validating, statusFromHealth(level), { healthLevel: level, lastHealthCheckAt: ctx.clock() }, "validate", "Validation failed");
    return { ok: false, providerVersion: null, message: normalizeConnectorFailure(res.category).userMessage };
  }
  await transitionInstallation(ctx, validating, "connected", { healthLevel: "healthy", lastHealthCheckAt: ctx.clock() }, "validate", "Connection validated");
  return { ok: res.value.authenticated, providerVersion: res.value.providerVersion, message: "Connector connection validated." };
}

/** Probe connector health; append an immutable health snapshot. */
export async function checkConnectorHealth(ctx: AppContext, rawId: unknown): Promise<ConnectorHealthDTO> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_HEALTH_CAP);
  const repo = requireIntegration(ctx);
  const adapter = adapterFor(ctx, inst.connectorId);
  const secret = await resolveConnectorSecret(ctx, inst, adapter);
  const res = await adapter.healthCheck({ connectorId: inst.connectorId, authMethod: inst.authMethod, config: inst.config, secret });
  const level: ConnectorHealthLevel = res.ok ? res.value.level : healthFromFailure(res.category);
  const snap = buildConnectorHealthSnapshot(ctx.ids("chlth"), inst.id, inst.workspaceId, inst.clientId, level, res.ok ? res.value.latencyMs : 0, sanitizeConnectorMetadata(res.ok ? res.value.detail : { error: res.category }), ctx.clock());
  unwrap(await repo.health.append(snap));
  // Reflect health on the installation only while it is in a live state.
  if (inst.status === "connected" || inst.status === "degraded" || inst.status === "error") {
    await transitionInstallation(ctx, inst, statusFromHealth(level), { healthLevel: level, lastHealthCheckAt: ctx.clock() }, "health_check", `Health: ${level}`);
  } else {
    unwrap(await repo.installations.save({ ...inst, healthLevel: level, lastHealthCheckAt: ctx.clock(), version: inst.version + 1, updatedAt: ctx.clock() }, inst.version));
  }
  return toConnectorHealthDTO(snap);
}

/** Enable a previously-disabled connector (returns it to validation). */
export async function enableConnector(ctx: AppContext, rawId: unknown): Promise<InstallationDTO> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_ENABLE_CAP);
  if (inst.status !== "disabled") throw new ConflictError("Only a disabled connector can be enabled");
  return toInstallationDTO(await transitionInstallation(ctx, inst, "validating", {}, "enable", "Enabled connector"));
}

/** Disable a connector (blocks further ingestion/operations; recoverable). */
export async function disableConnector(ctx: AppContext, rawId: unknown): Promise<InstallationDTO> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_DISABLE_CAP);
  return toInstallationDTO(await transitionInstallation(ctx, inst, "disabled", {}, "disable", "Disabled connector"));
}

/** Revoke a connector permanently and revoke its secret references (terminal). */
export async function revokeConnector(ctx: AppContext, rawId: unknown): Promise<InstallationDTO> {
  const inst = await loadInstallation(ctx, requireId(rawId, "installationId"), INTEGRATION_REVOKE_CAP);
  const repo = requireIntegration(ctx);
  const store = requireConnectorSecrets(ctx);
  const refs = unwrap(await repo.secrets.listByInstallation(inst.id));
  for (const ref of refs) {
    await store.revokeSecret(ref.secretRef);
    unwrap(await repo.secrets.save({ ...ref, validationState: "revoked", updatedAt: ctx.clock() }));
  }
  return toInstallationDTO(await transitionInstallation(ctx, inst, "revoked", { healthLevel: "unknown" }, "revoke", "Revoked connector"));
}
