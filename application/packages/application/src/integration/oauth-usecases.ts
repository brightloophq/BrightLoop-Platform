/* =============================================================================
 * Integration Platform — OAuth use-cases (F4.1).
 *
 * The vendor-neutral OAuth2 install flow: begin (mint state + build authorize URL)
 * and complete (verify state, exchange the code, store the token bundle by
 * reference). Tokens go STRAIGHT to the secret store — never a DTO, log, or row.
 * The adapter owns URL construction + code exchange; the domain owns state, scope,
 * and expiry semantics; the runtime owns idempotency + persistence.
 * ========================================================================== */

import {
  buildConnectorSecretReference, buildOAuthGrant, buildOAuthState, canTransitionOAuthGrant,
  normalizeConnectorFailure, normalizeScopes, verifyOAuthState,
} from "@brightloop/domain";
import {
  authorize, requireConnectorSecrets, requireIntegration, INTEGRATION_OAUTH_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { adapterFor, descriptorFor, loadInstallation } from "./shared.js";
import { toOAuthBeginDTO, type OAuthBeginDTO } from "./dto.js";

export interface BeginOAuthInput { installationId: string; redirectUri: string; scopes?: string[] }

/** Begin an OAuth2 authorization: mint state, build the authorize URL, persist a grant. */
export async function beginConnectorOAuth(ctx: AppContext, input: BeginOAuthInput): Promise<OAuthBeginDTO> {
  const inst = await loadInstallation(ctx, requireId(input.installationId, "installationId"), INTEGRATION_OAUTH_CAP);
  const redirectUri = requireString(input.redirectUri, "redirectUri");
  const descriptor = descriptorFor(inst.connectorId);
  if (descriptor.authMethod !== "oauth2") throw new ValidationError("This connector does not use OAuth", { connectorId: "not_oauth" });
  const adapter = adapterFor(ctx, inst.connectorId);
  if (adapter.buildAuthorizationUrl === undefined) throw new ValidationError("This connector does not support OAuth authorization", { connectorId: "no_oauth_support" });

  const repo = requireIntegration(ctx);
  const scopes = normalizeScopes(input.scopes && input.scopes.length > 0 ? input.scopes : descriptor.scopes);
  const state = buildOAuthState(inst.id, ctx.ids("nonce"));
  const urlRes = adapter.buildAuthorizationUrl({ connectorId: inst.connectorId, state, scopes, redirectUri, config: inst.config });
  if (!urlRes.ok) throw new ValidationError(normalizeConnectorFailure(urlRes.category).userMessage);

  const grant = buildOAuthGrant({
    id: ctx.ids("cgrant"), connectorInstallationId: inst.id, workspaceId: inst.workspaceId, clientId: inst.clientId,
    connectorId: inst.connectorId, stateToken: state, scopes, redirectUri, authorizationUrl: urlRes.value,
    expiresAt: null, createdByUserId: ctx.actor.userId, now: ctx.clock(),
  });
  unwrap(await repo.oauthGrants.create(grant));
  return toOAuthBeginDTO(grant);
}

export interface CompleteOAuthInput { state: string; code: string }

/** Complete an OAuth2 authorization: verify state, exchange the code, store the token by reference. */
export async function completeConnectorOAuth(ctx: AppContext, input: CompleteOAuthInput): Promise<{ installationId: string; status: string }> {
  const state = requireString(input.state, "state");
  const code = requireString(input.code, "code");
  const repo = requireIntegration(ctx);
  const store = requireConnectorSecrets(ctx);

  const grant = unwrap(await repo.oauthGrants.findByState(state));
  if (grant === null) throw new NotFoundError("oauth grant");
  authorize(ctx.actor, INTEGRATION_OAUTH_CAP, grant.clientId);
  if (!verifyOAuthState(grant.stateToken, state)) throw new ValidationError("OAuth state did not verify", { state: "mismatch" });
  if (grant.status !== "pending" && grant.status !== "authorized") throw new ConflictError("This OAuth grant is already resolved");

  const adapter = adapterFor(ctx, grant.connectorId);
  if (adapter.exchangeAuthorizationCode === undefined) throw new ValidationError("This connector cannot exchange authorization codes", { connectorId: "no_exchange" });

  const authorized = canTransitionOAuthGrant(grant.status, "authorized")
    ? unwrap(await repo.oauthGrants.save({ ...grant, status: "authorized", version: grant.version + 1, updatedAt: ctx.clock() }, grant.version))
    : grant;

  const res = await adapter.exchangeAuthorizationCode({ connectorId: grant.connectorId, code, state, redirectUri: grant.redirectUri, config: {} });
  if (!res.ok) {
    unwrap(await repo.oauthGrants.save({ ...authorized, status: "failed", version: authorized.version + 1, updatedAt: ctx.clock() }, authorized.version));
    throw new ValidationError(normalizeConnectorFailure(res.category).userMessage);
  }

  // Store the token bundle by reference (value straight to the store — never a row).
  const secretRef = ctx.ids("csec");
  await store.putSecret(secretRef, JSON.stringify({ accessToken: res.value.accessToken, refreshToken: res.value.refreshToken }), { connectorId: grant.connectorId, purpose: "oauth_token", version: "1", rotatedAt: null, expiresAt: res.value.expiresAt });
  const ref = buildConnectorSecretReference({
    id: ctx.ids("csecref"), workspaceId: grant.workspaceId, clientId: grant.clientId, connectorInstallationId: grant.connectorInstallationId,
    connectorId: grant.connectorId, purpose: "oauth_token", secretRef, metadata: { scopes: res.value.scopes }, expiresAt: res.value.expiresAt, createdByUserId: ctx.actor.userId, now: ctx.clock(),
  });
  unwrap(await repo.secrets.create(ref));
  unwrap(await repo.oauthGrants.save({ ...authorized, status: "exchanged", secretReferenceId: ref.id, version: authorized.version + 1, updatedAt: ctx.clock() }, authorized.version));

  // Link the token reference to the installation + advance it to configuring.
  const inst = unwrap(await repo.installations.getById(grant.connectorInstallationId));
  if (inst !== null) {
    const to = inst.status === "pending_configuration" ? "configuring" : inst.status;
    unwrap(await repo.installations.save({ ...inst, secretReferenceId: ref.id, status: to, version: inst.version + 1, updatedAt: ctx.clock() }, inst.version));
  }
  return { installationId: grant.connectorInstallationId, status: "exchanged" };
}
