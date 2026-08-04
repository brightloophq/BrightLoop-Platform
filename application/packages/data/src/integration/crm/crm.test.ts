/* =============================================================================
 * CRM connectors — data-layer tests (F4.5). Deterministic, offline.
 *
 * A scripted fake transport (no network) drives per-provider OAuth (authorize URL,
 * code exchange, refresh rotation, expiry, revoked/missing-scope failures), Bearer
 * authorization + base-URL resolution (HubSpot host, Salesforce instance URL,
 * Pipedrive company domain), health/validation + 7-state error classification, the
 * normalized crm.* operations + execute dispatch, the Salesforce allowlisted SOQL
 * builder (injection + arbitrary-object refusal), webhook signature verification
 * (real HubSpot v1 HMAC vector) + event translation, polling, rate-limit + failure
 * mapping, and the secret-non-leak guarantee. No live HubSpot/Salesforce/Pipedrive
 * call is ever made.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { findConnector } from "@brightloop/domain";
import type { CrmHttpRequest, CrmHttpResponse, CrmHttpTransport } from "./transport.js";
import { CrmTransportError } from "./transport.js";
import { classifyHttpStatus, healthForReason, reasonForCategory } from "./errors.js";
import { createCrmConnectorAdapters, type CrmConnectorConfig } from "./adapter.js";
import { HUBSPOT_BINDING } from "./hubspot.js";
import { SALESFORCE_BINDING } from "./salesforce.js";
import { PIPEDRIVE_BINDING } from "./pipedrive.js";
import { buildSoql, SALESFORCE_SCHEMA, escapeSoqlLiteral } from "./salesforce-soql.js";
import { verifyHubspotV1, verifyPipedriveStructural, safeEqual } from "./webhook.js";

const NOW = "2026-08-08T00:00:00.000Z";
const CREDS = { hubspot: { clientId: "hc", clientSecret: "hs" }, salesforce: { clientId: "sc", clientSecret: "ss" }, pipedrive: { clientId: "pc", clientSecret: "ps" } };
const SF_CONF = { instanceUrl: "https://acme.my.salesforce.com", apiVersion: "v59.0" };
const PD_CONF = { companyDomain: "acme" };

function makeCfg(handler: (req: CrmHttpRequest) => CrmHttpResponse): { config: CrmConnectorConfig; calls: CrmHttpRequest[] } {
  const calls: CrmHttpRequest[] = [];
  const transport: CrmHttpTransport = { request: async (req) => { calls.push(req); return handler(req); } };
  return { config: { transport, now: () => NOW, defaultRedirectUri: "https://app.auxion.co/oauth/cb", timeoutMs: 1000, creds: CREDS }, calls };
}
const json = (status: number, obj: unknown): CrmHttpResponse => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
const adapters = (cfg: CrmConnectorConfig) => createCrmConnectorAdapters(cfg);

describe("error classification (7 health states)", () => {
  it("maps HTTP statuses onto the normalized taxonomy + reasons", () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(classifyHttpStatus(401)!.reason).toBe("expired");
    expect(classifyHttpStatus(401)!.category).toBe("authentication");
    expect(classifyHttpStatus(403)!.reason).toBe("permission_missing");
    expect(classifyHttpStatus(429)!.reason).toBe("rate_limited");
    expect(classifyHttpStatus(400)!.reason).toBe("configuration_error");
    expect(classifyHttpStatus(500)!.reason).toBe("disconnected");
  });
  it("reads a safe provider error code without leaking a message", () => {
    expect(classifyHttpStatus(400, { category: "VALIDATION_ERROR", message: "secret detail" })!.code).toBe("VALIDATION_ERROR");
    expect(classifyHttpStatus(401, { errorCode: "INVALID_SESSION_ID", message: "secret" })!.code).toBe("INVALID_SESSION_ID");
  });
  it("health level derives from reason", () => {
    expect(healthForReason("connected")).toBe("healthy");
    expect(healthForReason(reasonForCategory("authentication"))).toBe("unauthorized");
    expect(healthForReason(reasonForCategory("rate_limited"))).toBe("degraded");
    expect(healthForReason(reasonForCategory("provider_unavailable"))).toBe("unavailable");
  });
});

describe("authorization — Bearer auth + provider base URLs", () => {
  it("HubSpot attaches Bearer + api.hubapi.com base", async () => {
    const { config, calls } = makeCfg(() => json(200, { portalId: 42, companyName: "Acme" }));
    const res = await adapters(config)["hubspot"]!.validateConnection({ connectorId: "hubspot", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(res.ok).toBe(true);
    expect(calls[0]!.url).toBe("https://api.hubapi.com/account-info/v3/details");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer AT");
  });
  it("Salesforce builds calls against the configured instance URL", async () => {
    const { config, calls } = makeCfg(() => json(200, { records: [{ Id: "00D", Name: "Acme" }] }));
    await adapters(config)["salesforce"]!.validateConnection({ connectorId: "salesforce", authMethod: "oauth2", config: SF_CONF, secret: "AT" });
    expect(calls[0]!.url.startsWith("https://acme.my.salesforce.com/services/data/v59.0/query")).toBe(true);
    expect(calls[0]!.headers["authorization"]).toBe("Bearer AT");
  });
  it("Pipedrive resolves the company API host", async () => {
    const { config, calls } = makeCfg(() => json(200, { data: { id: 1, name: "Me" } }));
    await adapters(config)["pipedrive"]!.validateConnection({ connectorId: "pipedrive", authMethod: "oauth2", config: PD_CONF, secret: "AT" });
    expect(calls[0]!.url).toBe("https://acme.pipedrive.com/api/v1/users/me");
  });
  it("Salesforce refuses to build a call without an instance URL", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["salesforce"]!.execute!({ connectorId: "salesforce", operation: "crm.health", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("config_invalid");
    expect(calls.length).toBe(0);
  });
  it("a missing access token never reaches the network", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    for (const [id, conf] of [["hubspot", {}], ["salesforce", SF_CONF], ["pipedrive", PD_CONF]] as const) {
      const res = await adapters(config)[id]!.execute!({ connectorId: id, operation: "crm.health", authMethod: "oauth2", config: conf, secret: null, input: {} });
      expect(res.ok, id).toBe(false);
      if (!res.ok) expect(res.category).toBe("secret_unavailable");
    }
    expect(calls.length).toBe(0);
  });
});

describe("OAuth 2.0 authorization-code flow", () => {
  it("HubSpot builds a consent URL with state + scopes", () => {
    const { config } = makeCfg(() => json(200, {}));
    const url = adapters(config)["hubspot"]!.buildAuthorizationUrl!({ connectorId: "hubspot", state: "st_1", scopes: ["crm.objects.contacts.read"], redirectUri: "", config: {} });
    expect(url.ok && url.value).toContain("https://app.hubspot.com/oauth/authorize?");
    expect(url.ok && url.value).toContain("state=st_1");
    expect(url.ok && url.value).toContain("redirect_uri=https%3A%2F%2Fapp.auxion.co%2Foauth%2Fcb");
  });
  it("exchanges a code into a token bundle with a computed expiry", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "AT1", refresh_token: "RT1", expires_in: 1800, scope: "a b", token_type: "bearer" }));
    const res = await adapters(config)["hubspot"]!.exchangeAuthorizationCode!({ connectorId: "hubspot", code: "code_1", state: "st", redirectUri: "", config: {} });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.accessToken).toBe("AT1"); expect(res.value.refreshToken).toBe("RT1"); expect(res.value.expiresAt).toBe("2026-08-08T00:30:00.000Z"); expect(res.value.scopes).toEqual(["a", "b"]); }
    expect(calls[0]!.body).toContain("grant_type=authorization_code");
    expect(calls[0]!.body).toContain("client_secret=hs");
  });
  it("refresh rotation keeps the old refresh token when the provider omits a new one", async () => {
    const { config } = makeCfg(() => json(200, { access_token: "AT2", expires_in: 1800 }));
    const res = await adapters(config)["hubspot"]!.refreshAccessToken!({ connectorId: "hubspot", refreshToken: "RT_OLD", config: {} });
    expect(res.ok && res.value.accessToken).toBe("AT2");
    expect(res.ok && res.value.refreshToken).toBe("RT_OLD");
  });
  it("Pipedrive presents client credentials via HTTP Basic (not body)", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600 }));
    await adapters(config)["pipedrive"]!.exchangeAuthorizationCode!({ connectorId: "pipedrive", code: "c", state: "s", redirectUri: "", config: {} });
    expect(calls[0]!.headers["authorization"]).toMatch(/^Basic /);
    expect(calls[0]!.body).not.toContain("client_secret");
    expect(calls[0]!.body).toContain("grant_type=authorization_code");
  });
  it("maps an expired/revoked token and a missing scope to normalized failures", async () => {
    const expired = makeCfg(() => json(401, { errorCode: "invalid_grant" }));
    const r1 = await adapters(expired.config)["hubspot"]!.refreshAccessToken!({ connectorId: "hubspot", refreshToken: "RT", config: {} });
    expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.category).toBe("authentication");
    const scope = makeCfg(() => json(403, { category: "MISSING_SCOPES" }));
    const r2 = await adapters(scope.config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.contacts.list", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.category).toBe("authorization");
  });
  it("no OAuth methods are exposed when client creds are absent", () => {
    const { config } = makeCfg(() => json(200, {}));
    const noCreds = { ...config, creds: {} };
    expect(createCrmConnectorAdapters(noCreds)["hubspot"]!.buildAuthorizationUrl).toBeUndefined();
  });
});

describe("capability coverage — every declared operation has an executable handler", () => {
  const maps: Record<string, Record<string, unknown>> = { hubspot: HUBSPOT_BINDING.ops, salesforce: SALESFORCE_BINDING.ops, pipedrive: PIPEDRIVE_BINDING.ops };
  for (const connectorId of Object.keys(maps)) {
    it(`${connectorId} implements all declared capabilities`, () => {
      const descriptor = findConnector(connectorId)!;
      for (const cap of descriptor.capabilities) expect(maps[connectorId]![cap.operation], `${connectorId}:${cap.operation}`).toBeDefined();
    });
  }
  it("discoverCapabilities reports every operation supported", async () => {
    const { config } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["hubspot"]!.discoverCapabilities({ connectorId: "hubspot", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(res.ok && res.value.every((c) => c.supported)).toBe(true);
  });
});

describe("operations hit the right endpoint and normalize output", () => {
  it("HubSpot contacts.list normalizes properties + pagination cursor", async () => {
    const { config, calls } = makeCfg(() => json(200, { results: [{ id: "1", properties: { firstname: "Ada", lastname: "Lovelace", email: "ada@x.io" }, createdAt: NOW, updatedAt: NOW }], paging: { next: { after: "20" } } }));
    const res = await adapters(config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.contacts.list", authMethod: "oauth2", config: {}, secret: "AT", input: { limit: 20 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const results = res.value.data["results"] as Record<string, unknown>[];
      expect(results[0]).toMatchObject({ provider: "hubspot", externalId: "1", displayName: "Ada Lovelace", email: "ada@x.io", archived: false });
      expect(res.value.data["pagination"]).toMatchObject({ nextCursor: "20", hasMore: true });
    }
    expect(calls[0]!.url).toContain("/crm/v3/objects/contacts");
  });
  it("HubSpot deal stage update PATCHes dealstage and derives won/lost", async () => {
    const { config, calls } = makeCfg(() => json(200, { id: "9", properties: { dealname: "Big", dealstage: "closedwon" } }));
    const res = await adapters(config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.deals.stage.update", authMethod: "oauth2", config: {}, secret: "AT", input: { id: "9", stageId: "closedwon" } });
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.body).toContain("dealstage");
    if (res.ok) expect((res.value.data["record"] as Record<string, unknown>)["status"]).toBe("won");
  });
  it("HubSpot contacts.search POSTs a safe free-text query (never a raw filter)", async () => {
    const { config, calls } = makeCfg(() => json(200, { results: [] }));
    await adapters(config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.contacts.search", authMethod: "oauth2", config: {}, secret: "AT", input: { query: "ada" } });
    expect(calls[0]!.method).toBe("POST");
    const body = JSON.parse(calls[0]!.body ?? "{}");
    expect(body.query).toBe("ada");
    expect(body).not.toHaveProperty("filterGroups");
  });
  it("Salesforce contacts.read queries via allowlisted SOQL (no raw SOQL)", async () => {
    const { config, calls } = makeCfg(() => json(200, { records: [{ Id: "003", FirstName: "Grace", LastName: "Hopper", Email: "g@x.io" }] }));
    const res = await adapters(config)["salesforce"]!.execute!({ connectorId: "salesforce", operation: "crm.contacts.read", authMethod: "oauth2", config: SF_CONF, secret: "AT", input: { id: "003" } });
    expect(res.ok && (res.value.data["record"] as Record<string, unknown>)["displayName"]).toBe("Grace Hopper");
    const q = decodeURIComponent(calls[0]!.url.split("q=")[1] ?? "");
    expect(q).toContain("SELECT");
    expect(q).toContain("FROM Contact");
    expect(q).toContain("Id = '003'");
  });
  it("Pipedrive contacts.list reads Pipedrive data + next_start cursor", async () => {
    const { config } = makeCfg(() => json(200, { success: true, data: [{ id: 5, name: "Ada", email: [{ value: "ada@x.io" }] }], additional_data: { pagination: { more_items_in_collection: true, next_start: 20 } } }));
    const res = await adapters(config)["pipedrive"]!.execute!({ connectorId: "pipedrive", operation: "crm.contacts.list", authMethod: "oauth2", config: PD_CONF, secret: "AT", input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.value.data["results"] as Record<string, unknown>[])[0]).toMatchObject({ provider: "pipedrive", externalId: "5", email: "ada@x.io" });
      expect(res.value.data["pagination"]).toMatchObject({ nextCursor: "20", hasMore: true });
    }
  });
});

describe("Salesforce SOQL allowlist — injection + arbitrary-object refusal", () => {
  it("builds a bounded, ordered query for an allowlisted object", () => {
    const r = buildSoql({ object: "Opportunity", limit: 5, orderBy: "LastModifiedDate", orderDir: "DESC" });
    expect(r.ok && r.value).toContain("FROM Opportunity");
    expect(r.ok && r.value).toContain("ORDER BY LastModifiedDate DESC");
    expect(r.ok && r.value).toContain("LIMIT 5");
  });
  it("rejects an object outside the allowlist", () => {
    const r = buildSoql({ object: "User_Password__c" });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("object_not_allowed");
  });
  it("rejects a field outside the object allowlist", () => {
    const r = buildSoql({ object: "Contact", fields: ["Id", "SSN__c"] });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("field_not_allowed");
  });
  it("escapes single quotes in a filter literal (no SOQL injection)", () => {
    const r = buildSoql({ object: "Contact", whereEquals: { Email: "x' OR Name != '" } });
    expect(r.ok && r.value).toContain("Email = 'x\\' OR Name != \\''");
    expect(escapeSoqlLiteral("a'b\\c")).toBe("a\\'b\\\\c");
  });
  it("clamps LIMIT to the maximum", () => {
    const r = buildSoql({ object: "Contact", limit: 100000 });
    expect(r.ok && r.value.endsWith("LIMIT 200")).toBe(true);
  });
  it("only exposes a curated set of queryable objects", () => {
    expect(Object.keys(SALESFORCE_SCHEMA).sort()).toEqual(["Account", "Contact", "Lead", "Opportunity", "Organization", "OpportunityStage", "Task", "User"].sort());
  });
});

describe("webhook verification + translation", () => {
  it("HubSpot v1 verifies a real HMAC vector and rejects a bad one", () => {
    const secret = "app_client_secret_placeholder";
    const body = JSON.stringify([{ eventId: 100, subscriptionType: "contact.creation", objectId: 55, occurredAt: 1_700_000_000_000 }]);
    const sig = createHash("sha256").update(`${secret}${body}`, "utf8").digest("hex");
    expect(verifyHubspotV1(body, sig, secret)).toBe(true);
    expect(verifyHubspotV1(body, "deadbeef", secret)).toBe(false);
    expect(verifyHubspotV1(body, sig, null)).toBe(false);
  });
  it("HubSpot translates subscriptionType into canonical crm.* events", () => {
    const { config } = makeCfg(() => json(200, {}));
    const body = JSON.stringify([
      { eventId: 1, subscriptionType: "contact.creation", objectId: 5, occurredAt: 1_700_000_000_000 },
      { eventId: 2, subscriptionType: "deal.propertyChange", propertyName: "dealstage", objectId: 9, occurredAt: 1_700_000_000_000 },
    ]);
    const res = adapters(config)["hubspot"]!.translateWebhook!({ connectorId: "hubspot", rawBody: body, source: "webhook" });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value[0]!.type).toBe("crm.contact.created"); expect(res.value[1]!.type).toBe("crm.deal.stage_changed"); }
  });
  it("HubSpot rejects a malformed webhook body", () => {
    const { config } = makeCfg(() => json(200, {}));
    const res = adapters(config)["hubspot"]!.translateWebhook!({ connectorId: "hubspot", rawBody: "{not json", source: "webhook" });
    expect(res.ok).toBe(false);
  });
  it("Pipedrive verifies structurally and translates meta.action + meta.object", () => {
    const { config } = makeCfg(() => json(200, {}));
    expect(verifyPipedriveStructural(JSON.stringify({ meta: { action: "updated", object: "deal", id: 7 }, current: {} }), null, null)).toBe(true);
    expect(verifyPipedriveStructural("nope", null, null)).toBe(false);
    const body = JSON.stringify({ meta: { action: "updated", object: "deal", id: 7 }, current: { id: 7, status: "won", stage_id: 3, update_time: NOW }, previous: { stage_id: 2 } });
    const res = adapters(config)["pipedrive"]!.translateWebhook!({ connectorId: "pipedrive", rawBody: body, source: "webhook" });
    expect(res.ok && res.value[0]!.type).toBe("crm.deal.won");
  });
  it("Pipedrive structural verify honours a configured shared secret", () => {
    const body = JSON.stringify({ meta: { action: "added", object: "person", id: 1 } });
    expect(verifyPipedriveStructural(body, "shhh", "shhh")).toBe(true);
    expect(verifyPipedriveStructural(body, "wrong", "shhh")).toBe(false);
  });
});

describe("polling", () => {
  it("HubSpot poll emits contact events + advances the cursor", async () => {
    const { config } = makeCfg(() => json(200, { results: [{ id: "5", updatedAt: NOW }], paging: { next: { after: "50" } } }));
    const res = await adapters(config)["hubspot"]!.poll!({ connectorId: "hubspot", authMethod: "oauth2", config: {}, secret: "AT", cursor: null, limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.events[0]!.type).toBe("crm.contact.updated"); expect(res.value.nextCursor).toBe("50"); }
  });
  it("Salesforce poll classifies won/lost opportunities", async () => {
    const { config } = makeCfg(() => json(200, { records: [{ Id: "006", IsWon: true, IsClosed: true, LastModifiedDate: NOW, StageName: "Closed Won" }] }));
    const res = await adapters(config)["salesforce"]!.poll!({ connectorId: "salesforce", authMethod: "oauth2", config: SF_CONF, secret: "AT", cursor: null, limit: 10 });
    expect(res.ok && res.value.events[0]!.type).toBe("crm.deal.won");
  });
});

describe("failure + rate-limit mapping and transport errors", () => {
  it("maps 429 to rate_limited and 500 to provider_unavailable", async () => {
    const rl = makeCfg(() => json(429, {}));
    const r1 = await adapters(rl.config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.contacts.list", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.category).toBe("rate_limited");
    const down = makeCfg(() => json(500, {}));
    const r2 = await adapters(down.config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.contacts.list", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.category).toBe("provider_unavailable");
  });
  it("maps transport timeout + network errors to normalized categories", async () => {
    const timeout: CrmHttpTransport = { request: async () => { throw new CrmTransportError("timeout", "x"); } };
    const r1 = await adapters({ transport: timeout, now: () => NOW, defaultRedirectUri: "", creds: CREDS })["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.health", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.category).toBe("timeout");
    const network: CrmHttpTransport = { request: async () => { throw new CrmTransportError("network", "x"); } };
    const r2 = await adapters({ transport: network, now: () => NOW, defaultRedirectUri: "", creds: CREDS })["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.health", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.category).toBe("network");
  });
});

describe("secret non-leak", () => {
  it("never places the access token in a normalized error", async () => {
    const { config } = makeCfg(() => json(401, { errorCode: "expired" }));
    const res = await adapters(config)["hubspot"]!.execute!({ connectorId: "hubspot", operation: "crm.contacts.list", authMethod: "oauth2", config: {}, secret: "SUPER_SECRET_TOKEN", input: {} });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain("SUPER_SECRET_TOKEN");
  });
  it("safeEqual is length-safe and value-correct", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
