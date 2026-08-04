/* =============================================================================
 * Integration Platform — F4.2 capability invocation + OAuth token lifecycle tests.
 *
 * Exercises the F4.2 additions through the FAKE oauth adapter (no network): the
 * Google connectors appear in the marketplace; a capability is invoked (enabled +
 * declared + operable gates); authorization is enforced; an expired access token
 * is transparently refreshed + ROTATED; and a bad grant surfaces as reconnect.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError, NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { createInMemoryIntegrationRepos, createInMemoryConnectorSecretStore, createTestConnectorAdapters } from "./testing.js";
import { configureConnector, installConnector, validateConnectorConnection } from "./installation-usecases.js";
import { beginConnectorOAuth, completeConnectorOAuth } from "./oauth-usecases.js";
import { invokeConnectorCapability } from "./invoke-usecases.js";
import { listConnectorCatalogue, getInstallationDetail } from "./integration-read.js";
import type { ConnectorSecretReference } from "@brightloop/schema";

const T0 = "2026-08-07T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const WS = "ws_g";

let repos = createInMemoryIntegrationRepos();
let secrets = createInMemoryConnectorSecretStore();
let adapters = createTestConnectorAdapters();

function makeCtx(actor: Actor): AppContext {
  let n = 0;
  const ids = (p: string) => `${p}_${(n += 1)}`;
  return { services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock: () => T0 }), actor, ids, clock: () => T0, integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
}
let ctx: AppContext;

beforeEach(() => {
  repos = createInMemoryIntegrationRepos();
  secrets = createInMemoryConnectorSecretStore();
  adapters = createTestConnectorAdapters();
  ctx = makeCtx(OWNER);
});

/** Install + connect a fake OAuth connector (token stored, status connected). */
async function connectedOAuth() {
  const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "fake-oauth", config: { accountId: "acct_1" } });
  const begin = await beginConnectorOAuth(ctx, { installationId: inst.id, redirectUri: "https://app/cb" });
  await completeConnectorOAuth(ctx, { state: begin.state, code: "c" });
  await validateConnectorConnection(ctx, inst.id);
  return inst;
}
async function oauthTokenRef(installationId: string): Promise<ConnectorSecretReference> {
  const r = await repos.secrets.listByInstallation(installationId);
  if (!r.ok) throw new Error("no refs");
  return r.value.find((x) => x.purpose === "oauth_token")!;
}

describe("marketplace — Google Workspace connectors are installable production connectors", () => {
  it("lists all four Google connectors as available OAuth2", () => {
    const cat = listConnectorCatalogue(makeCtx(OWNER));
    for (const id of ["google-gmail", "google-calendar", "google-drive", "google-contacts"]) {
      const c = cat.find((x) => x.id === id)!;
      expect(c.available).toBe(true);
      expect(c.authMethod).toBe("oauth2");
      expect(c.capabilities.length).toBeGreaterThan(0);
    }
  });
  it("Gmail declares the full capability matrix", () => {
    const gmail = listConnectorCatalogue(makeCtx(OWNER)).find((c) => c.id === "google-gmail")!;
    const keys = gmail.capabilities.map((c) => c.key);
    for (const k of ["gmail.send", "gmail.draft", "gmail.read", "gmail.search", "gmail.labels", "gmail.threads", "gmail.attachments", "gmail.reply", "gmail.archive"]) {
      expect(keys).toContain(k);
    }
  });
});

describe("capability invocation", () => {
  it("invokes an enabled capability and records an audit row", async () => {
    const inst = await connectedOAuth();
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "items.read", input: { q: "x" } });
    expect(res.connectorId).toBe("fake-oauth");
    expect(res.capabilityKey).toBe("items.read");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentAudit.some((a) => a.operation === "invoke")).toBe(true);
  });
  it("rejects a capability the connector does not declare", async () => {
    const inst = await connectedOAuth();
    await expect(invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "items.nope", input: {} })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("rejects a declared-but-not-enabled capability", async () => {
    // fake-connector declares records.read + records.write; narrow the enable list.
    const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "fake-connector", config: { workspaceRef: "w", apiKey: "k" } });
    await validateConnectorConnection(ctx, inst.id);
    await configureConnector(ctx, { installationId: inst.id, enabledCapabilities: ["records.read"] });
    await validateConnectorConnection(ctx, inst.id); // configure → configuring; re-validate → connected
    await expect(invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "records.write", input: {} })).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects invocation on a non-operable connector", async () => {
    const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "fake-oauth", config: { accountId: "a" } });
    // installed but never connected → pending/configuring, not operable
    await expect(invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "items.read", input: {} })).rejects.toBeInstanceOf(ConflictError);
  });
  it("a client actor cannot invoke a capability", async () => {
    const inst = await connectedOAuth();
    const clientCtx = { ...makeCtx(CLIENT), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    await expect(invokeConnectorCapability(clientCtx, { installationId: inst.id, capabilityKey: "items.read", input: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("OAuth token lifecycle — expiry, refresh, rotation", () => {
  it("transparently refreshes + rotates an expired access token before invoking", async () => {
    const inst = await connectedOAuth();
    // force the stored token reference to be expired
    const ref = await oauthTokenRef(inst.id);
    await repos.secrets.save({ ...ref, expiresAt: "2020-01-01T00:00:00.000Z" });
    const before = secrets.peek(ref.secretRef);
    expect(before).toContain("at-c"); // original access token

    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "items.read", input: {} });
    expect(res.capabilityKey).toBe("items.read");

    // the stored secret was rotated to the refreshed access token; reference re-validated
    const after = secrets.peek(ref.secretRef);
    expect(after).toContain("at-refreshed");
    expect(after).not.toBe(before);
    const updated = await oauthTokenRef(inst.id);
    expect(updated.validationState).toBe("valid");
    expect(updated.rotatedAt).not.toBeNull();
  });
  it("surfaces reconnect when the access token cannot be resolved", async () => {
    const inst = await connectedOAuth();
    const ref = await oauthTokenRef(inst.id);
    // the stored secret value is gone (revoked out-of-band) → no token resolvable
    await secrets.revokeSecret(ref.secretRef);
    await expect(invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "items.read", input: {} })).rejects.toBeInstanceOf(RuntimeUnavailableError);
  });
});

describe("secret non-leakage (F4.2 paths)", () => {
  it("an operation result carries no token or secret", async () => {
    const inst = await connectedOAuth();
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "items.read", input: { note: "hi" } });
    const blob = JSON.stringify(res);
    expect(blob).not.toContain("at-c");
    expect(blob).not.toContain("rt-c");
    expect(blob).not.toContain("secretRef");
  });
});
