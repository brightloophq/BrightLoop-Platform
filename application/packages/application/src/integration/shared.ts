/* =============================================================================
 * Integration Platform — shared use-case helpers (F4.1).
 *
 * Load-and-authorize, adapter resolution, secret resolution at the boundary,
 * lifecycle transition + append-only audit. Every command use-case composes these
 * so authorization, ownership, and audit are applied uniformly.
 * ========================================================================== */

import {
  buildAuditEvent, canTransitionInstallation, findConnector, isTokenExpired, sanitizeConnectorMetadata,
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

/**
 * Resolve the secret an adapter call expects, honouring OAuth. For `oauth2`
 * connectors this returns a FRESH access token: it reads the stored token bundle,
 * and if the reference is expired it refreshes via the adapter, ROTATES the stored
 * secret (new version + new expiry), and returns the new access token. For other
 * auth methods it returns the raw credential. The value is boundary-only — it
 * never enters a DTO, row, or log. Returns null when unavailable (caller treats as
 * unauthorized). This completes F4.1's OAuth model (token expiry + rotation).
 */
export async function resolveConnectorSecret(ctx: AppContext, inst: ConnectorInstallation, adapter: ConnectorAdapter): Promise<string | null> {
  if (inst.authMethod !== "oauth2") return resolveInstallationSecret(ctx, inst);
  const repo = requireIntegration(ctx);
  const store = requireConnectorSecrets(ctx);
  const refs = unwrap(await repo.secrets.listByInstallation(inst.id));
  const ref = refs.find((r) => r.purpose === "oauth_token" && r.validationState !== "revoked");
  if (ref === undefined) return null;
  const raw = await store.getSecret(ref.secretRef);
  if (raw === null) return null;

  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { accessToken?: unknown; refreshToken?: unknown };
    accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : null;
    refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken : null;
  } catch {
    accessToken = raw; // tolerate a bare-token secret
  }

  if (isTokenExpired(ref.expiresAt, ctx.clock()) && refreshToken !== null && adapter.refreshAccessToken !== undefined) {
    const res = await adapter.refreshAccessToken({ connectorId: inst.connectorId, refreshToken, config: inst.config });
    if (res.ok) {
      const nextRefresh = res.value.refreshToken ?? refreshToken;
      const version = await store.rotateSecret(ref.secretRef, JSON.stringify({ accessToken: res.value.accessToken, refreshToken: nextRefresh }));
      unwrap(await repo.secrets.save({ ...ref, secretVersion: version, expiresAt: res.value.expiresAt, validationState: "valid", rotatedAt: ctx.clock(), updatedAt: ctx.clock() }));
      return res.value.accessToken;
    }
    unwrap(await repo.secrets.save({ ...ref, validationState: res.category === "authorization" ? "invalid" : "expired", updatedAt: ctx.clock() }));
    return null;
  }
  return accessToken;
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
