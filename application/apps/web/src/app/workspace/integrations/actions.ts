"use server";

/* =============================================================================
 * Integration Platform server actions (Phase F · Sprint F4.1) — the ONLY write path.
 *
 * Authenticate → application use-case → revalidate. React never touches a
 * repository, connector adapter, or secret store: every connector operation goes
 * through @brightloop/application, so authorization, config validation, the secret
 * boundary, idempotency, tenancy, audit and the error taxonomy are exactly those
 * the use-cases enforce. Only a canonical ApplicationError message ever crosses
 * back — never a stack, SQLSTATE, provider body, or secret.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  beginConnectorOAuth, checkConnectorHealth, configureConnector, disableConnector, enableConnector, installConnector,
  invokeConnectorCapability, isApplicationError, revokeConnector, validateConnectorConnection, type InstallationDTO,
} from "@brightloop/application";
import { buildAppContext } from "@/lib/runtime-api";
import { resolveWorkspaces } from "@/lib/workspace-data";

/** The OAuth callback URL for connector reconnection (registered with the provider). */
async function oauthRedirectUri(): Promise<string> {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (configured && configured.length > 0) return configured;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}/workspace/integrations/oauth/callback`;
}

export interface ActionResult { ok: boolean; error?: string }
export interface InstallActionResult extends ActionResult { installationId?: string }

const PATHS = ["/workspace/integrations", "/workspace/integrations/marketplace"];
function revalidate() { for (const p of PATHS) revalidatePath(p); }
function fail(error: unknown, fallback: string): ActionResult { return { ok: false, error: isApplicationError(error) ? error.message : fallback }; }

async function run(fn: (ctx: NonNullable<Awaited<ReturnType<typeof buildAppContext>>>) => Promise<unknown>, fallback: string): Promise<ActionResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    await fn(ctx);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err, fallback);
  }
}

/** Install a connector into the caller's workspace, returning the new id on success. */
export async function installConnectorAction(connectorId: string, config: Record<string, unknown>, displayName?: string): Promise<InstallActionResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    const workspaceId = (await resolveWorkspaces())[0]?.id;
    if (workspaceId === undefined) return { ok: false, error: "No workspace is available." };
    const inst: InstallationDTO = await installConnector(ctx, { workspaceId, connectorId, config, displayName });
    revalidate();
    revalidatePath(`/workspace/integrations/${inst.id}`);
    return { ok: true, installationId: inst.id };
  } catch (err) {
    return fail(err, "The connector could not be installed.");
  }
}

export async function configureConnectorAction(installationId: string, config: Record<string, unknown>, displayName?: string): Promise<ActionResult> {
  return run((ctx) => configureConnector(ctx, { installationId, config, displayName }), "The connector could not be configured.");
}
export async function validateConnectorAction(installationId: string): Promise<ActionResult> {
  return run((ctx) => validateConnectorConnection(ctx, installationId), "The connector could not be validated.");
}
export async function checkConnectorHealthAction(installationId: string): Promise<ActionResult> {
  return run((ctx) => checkConnectorHealth(ctx, installationId), "The connector health check failed.");
}
export async function enableConnectorAction(installationId: string): Promise<ActionResult> {
  return run((ctx) => enableConnector(ctx, installationId), "The connector could not be enabled.");
}
export async function disableConnectorAction(installationId: string): Promise<ActionResult> {
  return run((ctx) => disableConnector(ctx, installationId), "The connector could not be disabled.");
}
export async function revokeConnectorAction(installationId: string): Promise<ActionResult> {
  return run((ctx) => revokeConnector(ctx, installationId), "The connector could not be revoked.");
}

/** Begin (or re-begin) the OAuth flow; returns the provider consent URL to redirect to. */
export async function connectConnectorAction(installationId: string): Promise<ActionResult & { authorizationUrl?: string }> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    const begin = await beginConnectorOAuth(ctx, { installationId, redirectUri: await oauthRedirectUri() });
    return { ok: true, authorizationUrl: begin.authorizationUrl };
  } catch (err) {
    return fail(err, "The connector could not start authorization.");
  }
}

/** Invoke one enabled connector capability. Returns the safe operation result. */
export async function invokeCapabilityAction(installationId: string, capabilityKey: string, input: Record<string, unknown>): Promise<ActionResult & { data?: Record<string, unknown> }> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    const res = await invokeConnectorCapability(ctx, { installationId, capabilityKey, input });
    revalidate();
    return { ok: true, data: res.data };
  } catch (err) {
    return fail(err, "The connector operation failed.");
  }
}
