/* =============================================================================
 * Integration Platform application tests (F4.1).
 *
 * Drives the connector framework through the FAKE adapters (no network): install,
 * configure, validate, health, the OAuth begin/complete flow, webhook ingestion
 * (with signature verification + idempotent replay), polling (cursor advance +
 * event dedupe), revoke, authorization + tenant denial, and the guarantee that
 * secrets never surface in a DTO.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError, ValidationError } from "../errors.js";
import {
  createInMemoryIntegrationRepos, createInMemoryConnectorSecretStore, createTestConnectorAdapters, testWebhookSignature,
} from "./testing.js";
import { installConnector, configureConnector, validateConnectorConnection, checkConnectorHealth, enableConnector, disableConnector, revokeConnector } from "./installation-usecases.js";
import { beginConnectorOAuth, completeConnectorOAuth } from "./oauth-usecases.js";
import { ingestConnectorWebhook, pollConnector } from "./ingestion-usecases.js";
import { listConnectorCatalogue, getConnectorDescriptor, listInstallations, getInstallationDetail } from "./integration-read.js";
import { rotateConnectorSecret } from "./secret-usecases.js";

const T0 = "2026-08-06T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const WS = "ws_alpha";

let repos = createInMemoryIntegrationRepos();
let secrets = createInMemoryConnectorSecretStore();
let adapters = createTestConnectorAdapters();

function makeCtx(actor: Actor): AppContext {
  let n = 0;
  const ids = (prefix: string) => `${prefix}_${(n += 1)}`;
  return {
    services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock: () => T0 }),
    actor,
    ids,
    clock: () => T0,
    integration: repos,
    connectorAdapters: adapters,
    connectorSecrets: secrets,
  };
}
let ctx: AppContext;

beforeEach(() => {
  repos = createInMemoryIntegrationRepos();
  secrets = createInMemoryConnectorSecretStore();
  adapters = createTestConnectorAdapters();
  ctx = makeCtx(OWNER);
});

async function installFake(config: Record<string, unknown> = { workspaceRef: "wr", apiKey: "sk-test" }) {
  return installConnector(ctx, { workspaceId: WS, connectorId: "fake-connector", config });
}

describe("marketplace / catalogue", () => {
  it("lists connectors and one descriptor", () => {
    const cat = listConnectorCatalogue(ctx);
    expect(cat.some((c) => c.id === "fake-connector" && c.available)).toBe(true);
    expect(getConnectorDescriptor(ctx, "fake-connector").capabilities.length).toBeGreaterThan(0);
  });
  it("descriptor config fields never expose secret values (only the secret flag)", () => {
    const d = getConnectorDescriptor(ctx, "fake-connector");
    const apiKeyField = d.configFields.find((f) => f.key === "apiKey")!;
    expect(apiKeyField.secret).toBe(true);
  });
});

describe("install + configure lifecycle", () => {
  it("installs, separates the secret, and advances to configuring", async () => {
    const inst = await installFake();
    expect(inst.status).toBe("configuring");
    expect(inst.hasCredential).toBe(true);
    // the secret was separated out of persisted config
    expect(inst.config.apiKey).toBeUndefined();
    expect(inst.config.workspaceRef).toBe("wr");
  });
  it("rejects a duplicate install", async () => {
    await installFake();
    await expect(installFake()).rejects.toBeInstanceOf(ConflictError);
  });
  it("rejects installing an unavailable (example) connector", async () => {
    await expect(installConnector(ctx, { workspaceId: WS, connectorId: "example-webhook", config: {} })).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects missing required config", async () => {
    await expect(installConnector(ctx, { workspaceId: WS, connectorId: "fake-connector", config: { region: "us" } })).rejects.toBeInstanceOf(ValidationError);
  });
  it("reconfigure returns a connected installation to configuring", async () => {
    let inst = await installFake();
    inst = await validateConnectorConnection(ctx, inst.id).then(() => listInstallations(ctx, WS)).then((l) => l[0]!);
    expect(inst.status).toBe("connected");
    const reconf = await configureConnector(ctx, { installationId: inst.id, displayName: "Renamed" });
    expect(reconf.displayName).toBe("Renamed");
    expect(reconf.status).toBe("configuring");
  });
});

describe("validation + health", () => {
  it("validates the connection → connected", async () => {
    const inst = await installFake();
    const res = await validateConnectorConnection(ctx, inst.id);
    expect(res.ok).toBe(true);
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.installation.status).toBe("connected");
    expect(detail.recentAudit.some((a) => a.operation === "validate")).toBe(true);
  });
  it("appends an immutable health snapshot", async () => {
    const inst = await installFake();
    await validateConnectorConnection(ctx, inst.id);
    const h = await checkConnectorHealth(ctx, inst.id);
    expect(h.level).toBe("healthy");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentHealth.length).toBe(1);
  });
});

describe("OAuth abstraction (fake-oauth)", () => {
  async function installOAuth() {
    return installConnector(ctx, { workspaceId: WS, connectorId: "fake-oauth", config: { accountId: "acct_1" } });
  }
  it("begins and completes an OAuth grant, storing the token by reference", async () => {
    const inst = await installOAuth();
    const begin = await beginConnectorOAuth(ctx, { installationId: inst.id, redirectUri: "https://app/redirect" });
    expect(begin.authorizationUrl).toContain("state=");
    const done = await completeConnectorOAuth(ctx, { state: begin.state, code: "auth-code-123" });
    expect(done.status).toBe("exchanged");
    // now validate + it becomes connected (token resolved at the boundary)
    const v = await validateConnectorConnection(ctx, inst.id);
    expect(v.ok).toBe(true);
  });
  it("rejects a bad OAuth state", async () => {
    const inst = await installOAuth();
    await beginConnectorOAuth(ctx, { installationId: inst.id, redirectUri: "https://app/redirect" });
    await expect(completeConnectorOAuth(ctx, { state: "st_forged", code: "x" })).rejects.toBeTruthy();
  });
});

describe("webhook ingestion (verify → translate → persist, idempotent)", () => {
  const body = JSON.stringify({ events: [{ id: "evt-1", type: "message.received", at: T0, data: {} }, { id: "evt-2", type: "message.received", at: T0 }] });
  async function connected() {
    const inst = await installFake();
    await validateConnectorConnection(ctx, inst.id);
    return inst;
  }
  it("rejects an invalid signature", async () => {
    const inst = await connected();
    const res = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: "wrong", externalEventId: "evt-1" });
    expect(res.status).toBe("rejected");
    expect(res.signatureValid).toBe(false);
  });
  it("ingests a verified webhook and persists canonical events", async () => {
    const inst = await connected();
    const sig = testWebhookSignature("sk-test", body);
    const res = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: sig });
    expect(res.status).toBe("processed");
    expect(res.eventCount).toBe(2);
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentEvents.length).toBe(2);
  });
  it("is idempotent — a replayed webhook writes no new events", async () => {
    const inst = await connected();
    const sig = testWebhookSignature("sk-test", body);
    await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: sig });
    const replay = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: sig });
    expect(replay.status).toBe("duplicate");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentEvents.length).toBe(2); // still 2, not 4
  });
});

describe("polling ingestion (cursor advance, event dedupe)", () => {
  async function connectedOAuthPolling() {
    const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "fake-oauth", config: { accountId: "acct_1" } });
    const begin = await beginConnectorOAuth(ctx, { installationId: inst.id, redirectUri: "https://app/redirect" });
    await completeConnectorOAuth(ctx, { state: begin.state, code: "c" });
    await validateConnectorConnection(ctx, inst.id);
    return inst;
  }
  it("advances the cursor and persists distinct events across turns", async () => {
    const inst = await connectedOAuthPolling();
    const first = await pollConnector(ctx, { installationId: inst.id });
    expect(first.eventCount).toBe(2);
    expect(first.cursor).toBe("2");
    const second = await pollConnector(ctx, { installationId: inst.id });
    expect(second.cursor).toBe("4");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentEvents.length).toBe(4); // 4 distinct events
  });
});

describe("secret rotation + revoke", () => {
  it("rotates a credential (new version, value never surfaces)", async () => {
    const inst = await installFake();
    const detail = await getInstallationDetail(ctx, inst.id);
    // find the credential reference id via the repo (internal)
    const refs = (await repos.secrets.listByInstallation(inst.id)) as { ok: true; value: { id: string; purpose: string }[] };
    const cred = refs.value.find((r) => r.purpose === "credential")!;
    const res = await rotateConnectorSecret(ctx, cred.id, "sk-rotated");
    expect(res.version).toBe("2");
    expect(res.validationState).toBe("unverified");
    expect(JSON.stringify(res)).not.toContain("sk-rotated");
    void detail;
  });
  it("revokes the connector and its secret references", async () => {
    const inst = await installFake();
    const revoked = await revokeConnector(ctx, inst.id);
    expect(revoked.status).toBe("revoked");
    const refs = (await repos.secrets.listByInstallation(inst.id)) as { ok: true; value: { validationState: string }[] };
    expect(refs.value.every((r) => r.validationState === "revoked")).toBe(true);
  });
  it("enable/disable transitions", async () => {
    const inst = await installFake();
    const disabled = await disableConnector(ctx, inst.id);
    expect(disabled.status).toBe("disabled");
    const enabled = await enableConnector(ctx, inst.id);
    expect(enabled.status).toBe("validating");
  });
});

describe("authorization + tenant isolation", () => {
  it("a client actor cannot install", async () => {
    const clientCtx = { ...makeCtx(CLIENT), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    await expect(installConnector(clientCtx, { workspaceId: WS, connectorId: "fake-connector", config: { workspaceRef: "w", apiKey: "k" } })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("a client cannot read an internal-owned installation", async () => {
    const inst = await installFake(); // owner install → clientId null
    const clientCtx = { ...makeCtx(CLIENT), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    await expect(getInstallationDetail(clientCtx, inst.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("secret non-leakage in DTOs", () => {
  it("no installation DTO carries a secret value, secretRef, or idempotency key", async () => {
    const inst = await installFake();
    await validateConnectorConnection(ctx, inst.id);
    const detail = await getInstallationDetail(ctx, inst.id);
    const blob = JSON.stringify(detail);
    expect(blob).not.toContain("sk-test");
    expect(blob).not.toContain("secretRef");
    expect(blob).not.toContain("idempotencyKey");
  });
});
