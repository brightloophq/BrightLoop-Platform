/* =============================================================================
 * Execution Runtime — runtime registration + health use-cases (F3).
 *
 * Register/validate/health-check/discover an external runtime and manage its
 * credential REFERENCE. Secrets are written straight to the secret store and are
 * never persisted, logged, returned, or embedded in metadata. Auxion remains the
 * system of record for the registration itself.
 * ========================================================================== */

import {
  buildCapabilitySnapshot, buildCredentialReference, buildHealthSnapshot, buildRuntimeRegistration,
  canTransitionRuntime, normalizeFailure, sanitizeMetadata, type RuntimeAdapter,
} from "@brightloop/domain";
import type { RuntimeEnvironment, RuntimeHealthLevel, RuntimeProvider, RuntimeRegistration, RuntimeStatus } from "@brightloop/schema";
import {
  authorize, requireExecutionRuntime, requireRuntimeAdapters, requireRuntimeSecrets,
  RUNTIME_MANAGE_CAP, RUNTIME_HEALTH_CAP, RUNTIME_CRED_CAP, type AppContext,
} from "../context.js";
import { NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toCredentialStatusDTO, toHealthDTO, toRuntimeDTO, type RuntimeCredentialStatusDTO, type RuntimeHealthDTO, type RuntimeRegistrationDTO } from "./dto.js";

function adapterFor(ctx: AppContext, provider: RuntimeProvider): RuntimeAdapter {
  const a = requireRuntimeAdapters(ctx)[provider];
  if (a === undefined) throw new RuntimeUnavailableError(`No adapter is configured for provider ${provider}`);
  return a;
}

async function loadRuntime(ctx: AppContext, id: string, cap: string): Promise<RuntimeRegistration> {
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(id));
  if (rt === null) throw new NotFoundError("runtime");
  authorize(ctx.actor, cap, rt.clientId);
  return rt;
}

/** Resolve a runtime's base URL + secret at the adapter boundary (never surfaced). */
async function resolveConnection(ctx: AppContext, rt: RuntimeRegistration): Promise<{ baseUrl: string; secret: string }> {
  const secrets = requireRuntimeSecrets(ctx);
  const er = requireExecutionRuntime(ctx);
  const baseUrl = await secrets.getSecret(rt.baseUrlRef);
  const cred = rt.credentialReferenceId ? unwrap(await er.credentials.getById(rt.credentialReferenceId)) : null;
  const secret = cred ? await secrets.getSecret(cred.secretRef) : null;
  if (baseUrl === null || secret === null) throw new ValidationError("The runtime credential reference is unavailable", { secret_unavailable: "resolve" });
  return { baseUrl, secret };
}

export interface RegisterRuntimeInput { workspaceId: string; provider?: RuntimeProvider; displayName: string; environment: RuntimeEnvironment; baseUrl: string; secret: string }

/** Register an external runtime + store its credentials by reference. */
export async function registerRuntime(ctx: AppContext, input: RegisterRuntimeInput): Promise<RuntimeRegistrationDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  requireString(input.displayName, "displayName");
  requireString(input.baseUrl, "baseUrl");
  requireString(input.secret, "secret");
  const provider = input.provider ?? "n8n";
  const er = requireExecutionRuntime(ctx);
  const secrets = requireRuntimeSecrets(ctx);
  authorize(ctx.actor, RUNTIME_MANAGE_CAP, ctx.actor.clientId);

  const now = ctx.clock();
  const baseUrlRef = ctx.ids("rturl");
  const secretRef = ctx.ids("rtsec");
  const meta = { provider, version: "1", rotatedAt: null, expiresAt: null };
  await secrets.putSecret(baseUrlRef, input.baseUrl, meta);
  await secrets.putSecret(secretRef, input.secret, meta);

  const cred = buildCredentialReference({ id: ctx.ids("rtcred"), workspaceId, clientId: ctx.actor.clientId, runtimeRegistrationId: null, provider, secretRef, createdByUserId: ctx.actor.userId, now });
  unwrap(await er.credentials.create(cred));
  const rt = buildRuntimeRegistration({ id: ctx.ids("rt"), workspaceId, clientId: ctx.actor.clientId, provider, displayName: input.displayName.slice(0, 200), environment: input.environment, baseUrlRef, credentialReferenceId: cred.id, createdByUserId: ctx.actor.userId, correlationId: ctx.ids("corr"), now });
  unwrap(await er.runtimes.create(rt));
  return toRuntimeDTO(rt);
}

async function transitionRuntime(ctx: AppContext, rt: RuntimeRegistration, to: RuntimeStatus, patch: Partial<RuntimeRegistration>): Promise<RuntimeRegistration> {
  const er = requireExecutionRuntime(ctx);
  const status = canTransitionRuntime(rt.status, to) ? to : rt.status;
  const next: RuntimeRegistration = { ...rt, ...patch, status, version: rt.version + 1, updatedAt: ctx.clock() };
  return unwrap(await er.runtimes.save(next, rt.version));
}

/** Validate connectivity + auth against the runtime (external read). */
export async function validateRuntimeConnection(ctx: AppContext, rawRuntimeId: unknown): Promise<{ ok: boolean; providerVersion: string | null; message: string }> {
  const rt = await loadRuntime(ctx, requireId(rawRuntimeId, "runtimeId"), RUNTIME_HEALTH_CAP);
  const er = requireExecutionRuntime(ctx);
  const { baseUrl, secret } = await resolveConnection(ctx, rt);
  const validating = await transitionRuntime(ctx, rt, "validating", {});
  const res = await adapterFor(ctx, rt.provider).validateConnection({ baseUrl, secret, provider: rt.provider });
  if (!res.ok) {
    await transitionRuntime(ctx, validating, res.category === "authentication" ? "unavailable" : "degraded", { healthState: res.category === "authentication" ? "unauthorized" : "degraded" });
    if (rt.credentialReferenceId) { const c = unwrap(await er.credentials.getById(rt.credentialReferenceId)); if (c) unwrap(await er.credentials.save({ ...c, validationState: "invalid", updatedAt: ctx.clock() })); }
    const nf = normalizeFailure(res.category, res.code);
    return { ok: false, providerVersion: null, message: nf.userMessage };
  }
  await transitionRuntime(ctx, validating, "healthy", { healthState: "healthy", providerVersion: res.value.providerVersion, lastHealthCheckAt: ctx.clock() });
  if (rt.credentialReferenceId) { const c = unwrap(await er.credentials.getById(rt.credentialReferenceId)); if (c) unwrap(await er.credentials.save({ ...c, validationState: "valid", updatedAt: ctx.clock() })); }
  return { ok: res.value.authenticated, providerVersion: res.value.providerVersion, message: "Runtime connection validated." };
}

/** Probe runtime health; append an immutable health snapshot. */
export async function checkRuntimeHealth(ctx: AppContext, rawRuntimeId: unknown): Promise<RuntimeHealthDTO> {
  const rt = await loadRuntime(ctx, requireId(rawRuntimeId, "runtimeId"), RUNTIME_HEALTH_CAP);
  const er = requireExecutionRuntime(ctx);
  const res = await adapterFor(ctx, rt.provider).healthCheck({ baseUrl: (await resolveConnection(ctx, rt)).baseUrl, secret: (await resolveConnection(ctx, rt)).secret, provider: rt.provider });
  const level: RuntimeHealthLevel = res.ok ? res.value.level : res.category === "authentication" ? "unauthorized" : res.category === "provider_unavailable" || res.category === "network" ? "unavailable" : "degraded";
  const snap = buildHealthSnapshot(ctx.ids("rthlth"), rt.id, rt.workspaceId, rt.clientId, level, res.ok ? res.value.latencyMs : 0, res.ok ? res.value.providerVersion : null, sanitizeMetadata(res.ok ? res.value.detail : { error: res.category }), ctx.clock());
  unwrap(await er.healthSnapshots.append(snap));
  const status: RuntimeStatus = level === "healthy" ? "healthy" : level === "unavailable" || level === "unauthorized" ? "unavailable" : "degraded";
  await transitionRuntime(ctx, rt, status, { healthState: level, lastHealthCheckAt: ctx.clock(), providerVersion: res.ok ? res.value.providerVersion : rt.providerVersion });
  return toHealthDTO(snap);
}

/** Discover provider capabilities; append an immutable capability snapshot. */
export async function discoverRuntimeCapabilities(ctx: AppContext, rawRuntimeId: unknown): Promise<{ operation: string; supported: boolean }[]> {
  const rt = await loadRuntime(ctx, requireId(rawRuntimeId, "runtimeId"), RUNTIME_HEALTH_CAP);
  const er = requireExecutionRuntime(ctx);
  const { baseUrl, secret } = await resolveConnection(ctx, rt);
  const res = await adapterFor(ctx, rt.provider).discoverCapabilities({ baseUrl, secret, provider: rt.provider });
  if (!res.ok) throw new ValidationError(normalizeFailure(res.category, res.code).userMessage);
  const snap = buildCapabilitySnapshot(ctx.ids("rtcap"), rt.id, rt.workspaceId, rt.clientId, rt.provider, res.value, rt.providerVersion, ctx.clock());
  unwrap(await er.capabilitySnapshots.append(snap));
  await transitionRuntime(ctx, rt, rt.status, { supportedCapabilities: res.value.filter((c) => c.supported).map((c) => c.operation) });
  return res.value;
}

/** Disable a runtime (Auxion-side; blocks further deploys/polling). */
export async function disableRuntime(ctx: AppContext, rawRuntimeId: unknown): Promise<RuntimeRegistrationDTO> {
  const rt = await loadRuntime(ctx, requireId(rawRuntimeId, "runtimeId"), RUNTIME_MANAGE_CAP);
  return toRuntimeDTO(await transitionRuntime(ctx, rt, "disabled", {}));
}

/** Rotate a runtime credential reference (secret value goes only to the store). */
export async function rotateRuntimeCredentialReference(ctx: AppContext, rawCredentialId: unknown, newSecret: unknown): Promise<RuntimeCredentialStatusDTO> {
  const credentialId = requireId(rawCredentialId, "credentialId");
  const secret = requireString(newSecret, "secret");
  const er = requireExecutionRuntime(ctx);
  const secrets = requireRuntimeSecrets(ctx);
  const cred = unwrap(await er.credentials.getById(credentialId));
  if (cred === null) throw new NotFoundError("credential");
  authorize(ctx.actor, RUNTIME_CRED_CAP, cred.clientId);
  const version = await secrets.rotateSecret(cred.secretRef, secret);
  const next = unwrap(await er.credentials.save({ ...cred, secretVersion: version, validationState: "unverified", rotatedAt: ctx.clock(), updatedAt: ctx.clock() }));
  return toCredentialStatusDTO(next);
}
