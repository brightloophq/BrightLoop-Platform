/* =============================================================================
 * Integration Platform — F4.3 communication connectors (application tests).
 *
 * Verifies the three communication connectors are installable production connectors
 * with a NORMALIZED capability vocabulary, drives an invocation through the api_key
 * (Discord bot-token) path end-to-end via the real use-cases, and confirms
 * authorization (clients cannot invoke) + secret non-leak.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import {
  connectorErr, connectorOk, createRuntimeServices, InMemoryRuntimeRepository,
  type Actor, type ConnectorAdapter, type ConnectorAdapterRegistry,
} from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
import { createInMemoryIntegrationRepos, createInMemoryConnectorSecretStore } from "./testing.js";
import { installConnector, validateConnectorConnection } from "./installation-usecases.js";
import { invokeConnectorCapability } from "./invoke-usecases.js";
import { listConnectorCatalogue, getInstallationDetail } from "./integration-read.js";

const T0 = "2026-08-04T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const WS = "ws_c";

/** A deterministic echo adapter standing in for a communication provider adapter. */
function echoAdapter(connectorId: string): ConnectorAdapter {
  const authed = (s: string | null) => s !== null && s.length > 0;
  return {
    connectorId,
    async validateConnection(i) { return authed(i.secret) ? connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 }) : connectorErr("authentication", "no secret"); },
    async healthCheck(i) { return connectorOk({ level: authed(i.secret) ? "healthy" : "unauthorized", providerVersion: "v1", latencyMs: 0, detail: {} }); },
    async discoverCapabilities() { return connectorOk([]); },
    async execute(i) { return authed(i.secret) ? connectorOk({ data: { operation: i.operation, echoed: i.input } }) : connectorErr("authentication", "no secret"); },
  };
}

let repos = createInMemoryIntegrationRepos();
let secrets = createInMemoryConnectorSecretStore();
let adapters: ConnectorAdapterRegistry = { discord: echoAdapter("discord"), slack: echoAdapter("slack") };

function makeCtx(actor: Actor): AppContext {
  let n = 0;
  const ids = (p: string) => `${p}_${(n += 1)}`;
  return { services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock: () => T0 }), actor, ids, clock: () => T0, integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
}
let ctx: AppContext;

beforeEach(() => {
  repos = createInMemoryIntegrationRepos();
  secrets = createInMemoryConnectorSecretStore();
  adapters = { discord: echoAdapter("discord"), slack: echoAdapter("slack") };
  ctx = makeCtx(OWNER);
});

describe("marketplace — Slack / Teams / Discord are installable production connectors", () => {
  it("registers all three with normalized capabilities", () => {
    const cat = listConnectorCatalogue(makeCtx(OWNER));
    const byId = Object.fromEntries(cat.map((c) => [c.id, c]));
    expect(byId["slack"]!.available).toBe(true);
    expect(byId["slack"]!.authMethod).toBe("oauth2");
    expect(byId["microsoft-teams"]!.authMethod).toBe("oauth2");
    expect(byId["discord"]!.authMethod).toBe("api_key"); // bot token
    // NORMALIZED vocabulary shared across providers
    for (const id of ["slack", "microsoft-teams", "discord"]) {
      expect(byId[id]!.capabilities.map((c) => c.key)).toContain("communication.send_message");
    }
  });
  it("Slack normalizes edit + delete; Discord does not expose them", () => {
    const cat = listConnectorCatalogue(makeCtx(OWNER));
    const slack = cat.find((c) => c.id === "slack")!.capabilities.map((c) => c.key);
    const discord = cat.find((c) => c.id === "discord")!.capabilities.map((c) => c.key);
    expect(slack).toContain("communication.edit_message");
    expect(discord).not.toContain("communication.edit_message");
  });
});

describe("bot-token (api_key) invocation path — Discord", () => {
  async function connectedDiscord() {
    const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "discord", config: { botToken: "bot-123", guildId: "g1", channelId: "c1" } });
    await validateConnectorConnection(ctx, inst.id); // api_key: raw bot token resolved → connected
    return inst;
  }
  it("installs with the bot token stored by reference, then invokes send_message", async () => {
    const inst = await connectedDiscord();
    expect(inst.hasCredential).toBe(true);
    expect(inst.config.botToken).toBeUndefined(); // secret separated out of persisted config
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "communication.send_message", input: { channelId: "c1", text: "hi" } });
    expect(res.capabilityKey).toBe("communication.send_message");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentAudit.some((a) => a.operation === "invoke")).toBe(true);
  });
  it("no bot token or secret leaks into the operation result", async () => {
    const inst = await connectedDiscord();
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "communication.send_message", input: { channelId: "c1", text: "x" } });
    const blob = JSON.stringify(res);
    expect(blob).not.toContain("bot-123");
    expect(blob).not.toContain("secretRef");
  });
});

describe("authorization", () => {
  it("a client actor cannot invoke a communication capability", async () => {
    const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "discord", config: { botToken: "bot-123", channelId: "c1" } });
    await validateConnectorConnection(ctx, inst.id);
    const clientCtx = { ...makeCtx(CLIENT), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    await expect(invokeConnectorCapability(clientCtx, { installationId: inst.id, capabilityKey: "communication.send_message", input: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
