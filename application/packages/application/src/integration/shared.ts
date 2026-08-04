/* =============================================================================
 * Integration Platform — shared use-case helpers (F4.1).
 *
 * Load-and-authorize, adapter resolution, secret resolution at the boundary,
 * lifecycle transition + append-only audit. Every command use-case composes these
 * so authorization, ownership, and audit are applied uniformly.
 * ========================================================================== */

import {
  buildAuditEvent, canTransitionInstallation, findConnector, sanitizeConnectorMetadata,
  type ConnectorAdapter,
} from "@brightloop/domain";
import type { ConnectorDescriptor, ConnectorInstallation, ConnectorOperation } from "@brightloop/schema";
import {
  authorize, requireConnectorAdapters, requireConnectorSecrets, requireIntegration, type AppContext,
} from "../context.js";
import { NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";

/** Resolve a connector descriptor from the registry, or throw a 422. */
export function descriptorFor(connectorId: string): ConnectorDescriptor {
  const d = findConnector(connectorId);
  if (d === null) throw new ValidationError("Unknown connector", { connectorId: "unknown" });
  return d;
}

/** Resolve the live adapter for a connector, or fail 503 (not configured). */
export function adapterFor(ctx: AppContext, connectorId: string): ConnectorAdapter {
  const a = requireConnectorAdapters(ctx)[connectorId];
  if (a === undefined) throw new RuntimeUnavailableError(`No adapter is configured for connector ${connectorId}`);
  return a;
}

/** Load an installation and authorize the actor on its tenant, or throw 404/403. */
export async function loadInstallation(ctx: AppContext, id: string, cap: string): Promise<ConnectorInstallation> {
  const repo = requireIntegration(ctx);
  const inst = unwrap(await repo.installations.getById(id));
  if (inst === null) throw new NotFoundError("connector installation");
  authorize(ctx.actor, cap, inst.clientId);
  return inst;
}

/**
 * Resolve the primary credential/token secret for an installation at the adapter
 * boundary. Returns null for `none` auth or when no reference exists. The VALUE
 * never leaves this call — it is passed straight into an adapter invocation.
 */
export async function resolveInstallationSecret(ctx: AppContext, inst: ConnectorInstallation): Promise<string | null> {
  if (inst.secretReferenceId === null) return null;
  const repo = requireIntegration(ctx);
  const secrets = requireConnectorSecrets(ctx);
  const ref = unwrap(await repo.secrets.getById(inst.secretReferenceId));
  if (ref === null) return null;
  return secrets.getSecret(ref.secretRef);
}

/** Resolve the webhook-signing secret for an installation (purpose scoped), or null. */
export async function resolveSigningSecret(ctx: AppContext, inst: ConnectorInstallation): Promise<string | null> {
  const repo = requireIntegration(ctx);
  const secrets = requireConnectorSecrets(ctx);
  const refs = unwrap(await repo.secrets.listByInstallation(inst.id));
  const signing = refs.find((r) => r.purpose === "webhook_signing") ?? refs.find((r) => r.purpose === "credential");
  if (signing === undefined) return null;
  return secrets.getSecret(signing.secretRef);
}

/** Append an immutable audit event for a lifecycle operation. */
export async function auditInstallation(
  ctx: AppContext, inst: ConnectorInstallation, operation: ConnectorOperation,
  fromStatus: string | null, toStatus: string | null, summary: string,
): Promise<void> {
  const repo = requireIntegration(ctx);
  unwrap(await repo.audit.append(buildAuditEvent({
    id: ctx.ids("caud"), connectorInstallationId: inst.id, workspaceId: inst.workspaceId, clientId: inst.clientId,
    operation, fromStatus, toStatus, actorUserId: ctx.actor.userId, summary, correlationId: inst.correlationId, now: ctx.clock(),
  })));
}

/**
 * Transition an installation's status (guard-checked) with an optional patch,
 * bumping the version, and record the transition in the audit log.
 */
export async function transitionInstallation(
  ctx: AppContext, inst: ConnectorInstallation, to: ConnectorInstallation["status"],
  patch: Partial<ConnectorInstallation>, operation: ConnectorOperation, summary: string,
): Promise<ConnectorInstallation> {
  const repo = requireIntegration(ctx);
  const status = canTransitionInstallation(inst.status, to) ? to : inst.status;
  const next: ConnectorInstallation = { ...inst, ...patch, status, version: inst.version + 1, updatedAt: ctx.clock() };
  const saved = unwrap(await repo.installations.save(next, inst.version));
  if (status !== inst.status) await auditInstallation(ctx, saved, operation, inst.status, status, summary);
  return saved;
}

/** Sanitize a submitted config object for logging/echo (never persists secrets). */
export const safeConfig = (config: Record<string, unknown>): Record<string, unknown> => sanitizeConnectorMetadata(config);
