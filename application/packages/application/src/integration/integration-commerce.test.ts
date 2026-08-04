/* =============================================================================
 * Integration Platform — F4.4 commerce connectors (application tests).
 *
 * Verifies the three commerce connectors are installable production connectors with
 * a NORMALIZED capability vocabulary, drives a capability invocation through the
 * api_key path end-to-end via the real use-cases, and exercises the full webhook
 * ingestion pipeline — signature verification, event translation, idempotent
 * persistence, and REPLAY (duplicate) — plus authorization (clients cannot invoke)
 * and secret non-leak. A deterministic stub commerce adapter stands in for the data-
 * layer adapter so the application package stays domain+schema only.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import {
  connectorErr, connectorOk, createRuntimeServices, InMemoryRuntimeRepository,
  type Actor, type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry, type ConnectorResult,
} from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
import { createInMemoryIntegrationRepos, createInMemoryConnectorSecretStore } from "./testing.js";
import { installConnector, validateConnectorConnection } from "./installation-usecases.js";
import { invokeConnectorCapability } from "./invoke-usecases.js";
import { ingestConnectorWebhook } from "./ingestion-usecases.js";
import { listConnectorCatalogue, getInstallationDetail } from "./integration-read.js";

const T0 = "2026-08-08T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const WS = "ws_commerce";

/**
 * A deterministic stub commerce adapter: authenticates on secret presence, echoes
 * on execute, and verifies webhooks by an exact signature==signingSecret match while
 * translating the body id into ONE canonical `commerce.order.updated` event. It
 * mirrors the framework contract the real data-layer adapter fulfils, without a
 * transport.
 */
function stubCommerceAdapter(connectorId: string): ConnectorAdapter {
  const authed = (s: string | null) => s !== null && s.length > 0;
  return {
    connectorId,
    async validateConnection(i) { return authed(i.secret) ? connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 }) : connectorErr("secret_unavailable", "no secret"); },
    async healthCheck(i) { return connectorOk({ level: authed(i.secret) ? "healthy" : "unauthorized", providerVersion: "v1", latencyMs: 0, detail: {} }); },
    async discoverCapabilities() { return connectorOk([]); },
    async execute(i) { return authed(i.secret) ? connectorOk({ data: { operation: i.operation, ok: true } }) : connectorErr("secret_unavailable", "no secret"); },
    verifyWebhook(i) {
      const valid = i.signingSecret !== null && i.signature === i.signingSecret;
      let id = "";
      try { id = String((JSON.parse(i.rawBody) as Record<string, unknown>)["id"] ?? ""); } catch { id = ""; }
      return connectorOk({ valid, externalEventId: id.length > 0 ? id : "unknown" });
    },
    translateWebhook(i): ConnectorResult<CanonicalConnectorEvent[]> {
      let id = "";
      try { id = String((JSON.parse(i.rawBody) as Record<string, unknown>)["id"] ?? ""); } catch { id = ""; }
      if (id.length === 0) return connectorOk([]);
      const ev: CanonicalConnectorEvent = { type: "commerce.order.updated", externalId: id, occurredAt: T0, payload: { financialStatus: "paid" }, provenance: `${connectorId}:webhook` };
      return connectorOk([ev]);
    },
  };
}

let repos = createInMemoryIntegrationRepos();
let secrets = createInMemoryConnectorSecretStore();
let adapters: ConnectorAdapterRegistry = { shopify: stubCommerceAdapter("shopify"), stripe: stubCommerceAdapter("stripe"), paypal: stubCommerceAdapter("paypal") };

function makeCtx(actor: Actor): AppContext {
  let n = 0;
  const ids = (p: string) => `${p}_${(n += 1)}`;
  return { services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock: () => T0 }), actor, ids, clock: () => T0, integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
}
let ctx: AppContext;

beforeEach(() => {
  repos = createInMemoryIntegrationRepos();
  secrets = createInMemoryConnectorSecretStore();
  adapters = { shopify: stubCommerceAdapter("shopify"), stripe: stubCommerceAdapter("stripe"), paypal: stubCommerceAdapter("paypal") };
  ctx = makeCtx(OWNER);
});

/** Install + connect Shopify (webhook-driven), with an Admin token + signing secret. */
async function connectedShopify() {
  const inst = await installConnector(ctx, { workspaceId: WS, connectorId: "shopify", config: { shopDomain: "demo.myshopify.com", accessToken: "shpat_1", webhookSigningSecret: "whsig" } });
  await validateConnectorConnection(ctx, inst.id);
  return inst;
}

describe("marketplace — Shopify / Stripe / PayPal are installable production connectors", () => {
  it("registers all three with normalized commerce capabilities", () => {
    const cat = listConnectorCatalogue(makeCtx(OWNER));
    const byId = Object.fromEntries(cat.map((c) => [c.id, c]));
    for (const id of ["shopify", "stripe", "paypal"]) {
      expect(byId[id]!.available, id).toBe(true);
      expect(byId[id]!.authMethod, id).toBe("api_key");
      expect(byId[id]!.category, id).toBe("commerce");
      // NORMALIZED vocabulary shared across providers
      expect(byId[id]!.capabilities.map((c) => c.key)).toContain("commerce.payments.refund");
      expect(byId[id]!.capabilities.map((c) => c.key)).toContain("commerce.health");
    }
  });
  it("Stripe normalizes subscriptions + disputes; PayPal exposes transactions instead", () => {
    const cat = listConnectorCatalogue(makeCtx(OWNER));
    const stripe = cat.find((c) => c.id === "stripe")!.capabilities.map((c) => c.key);
    const paypal = cat.find((c) => c.id === "paypal")!.capabilities.map((c) => c.key);
    expect(stripe).toContain("commerce.subscriptions.read");
    expect(stripe).toContain("commerce.disputes.read");
    expect(paypal).not.toContain("commerce.subscriptions.read");
    expect(paypal).toContain("commerce.transactions.read");
  });
});

describe("api_key invocation path", () => {
  it("installs with credentials stored by reference, then invokes a capability", async () => {
    const inst = await connectedShopify();
    expect(inst.hasCredential).toBe(true);
    expect(inst.config.accessToken).toBeUndefined(); // secret separated out of persisted config
    expect(inst.config.webhookSigningSecret).toBeUndefined();
    expect(inst.config.shopDomain).toBe("demo.myshopify.com"); // non-secret config retained
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "commerce.products.read", input: { limit: 5 } });
    expect(res.capabilityKey).toBe("commerce.products.read");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentAudit.some((a) => a.operation === "invoke")).toBe(true);
  });
  it("no access token or secret leaks into the operation result", async () => {
    const inst = await connectedShopify();
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "commerce.products.read", input: {} });
    const blob = JSON.stringify(res);
    expect(blob).not.toContain("shpat_1");
    expect(blob).not.toContain("whsig");
    expect(blob).not.toContain("secretRef");
  });
});

describe("webhook ingestion — verify, translate, persist, replay (idempotent)", () => {
  const body = JSON.stringify({ id: "ORDER-77", financial_status: "paid" });

  it("verifies a signed webhook, translates it, and persists one canonical event", async () => {
    const inst = await connectedShopify();
    const res = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: "whsig" });
    expect(res.signatureValid).toBe(true);
    expect(res.status).toBe("processed");
    expect(res.eventCount).toBe(1);
    const events = await repos.events.listByInstallation(inst.id, 50);
    expect(events.ok && events.value[0]!.type).toBe("commerce.order.updated");
    expect(events.ok && events.value[0]!.externalId).toBe("ORDER-77");
  });
  it("REPLAY: a repeated delivery of the same event is a duplicate and writes no new event", async () => {
    const inst = await connectedShopify();
    await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: "whsig" });
    const second = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: "whsig" });
    expect(second.status).toBe("duplicate");
    const events = await repos.events.listByInstallation(inst.id, 50);
    expect(events.ok && events.value.length).toBe(1); // no duplicate event row
  });
  it("rejects a webhook whose signature does not verify (no events persisted)", async () => {
    const inst = await connectedShopify();
    const res = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: body, signature: "tampered", externalEventId: "ORDER-77" });
    expect(res.signatureValid).toBe(false);
    expect(res.status).toBe("rejected");
    const events = await repos.events.listByInstallation(inst.id, 50);
    expect(events.ok && events.value.length).toBe(0);
  });
});

describe("authorization", () => {
  it("a client actor cannot invoke a commerce capability", async () => {
    const inst = await connectedShopify();
    const clientCtx = { ...makeCtx(CLIENT), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    await expect(invokeConnectorCapability(clientCtx, { installationId: inst.id, capabilityKey: "commerce.products.read", input: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
