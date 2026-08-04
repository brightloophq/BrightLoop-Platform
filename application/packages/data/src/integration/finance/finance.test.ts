/* =============================================================================
 * Finance connectors — data-layer tests (F4.6). Deterministic, offline.
 *
 * A scripted fake transport (no network) drives per-provider OAuth (authorize URL,
 * code exchange with HTTP Basic client auth, refresh rotation, expiry, revoked/missing
 * failures), Bearer authorization + base-URL/tenancy resolution (QuickBooks realmId path
 * + environment host, Xero Xero-Tenant-Id header), health/validation + 7-state error
 * classification, the normalized finance.* operations + execute dispatch, the QuickBooks
 * allowlisted query builder (injection + arbitrary-entity refusal), webhook signature
 * verification (real HMAC-SHA256 base64 vectors for Intuit + Xero) + event translation,
 * polling, rate-limit + failure mapping, and the secret-non-leak guarantee. No live
 * QuickBooks/Xero call is ever made.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { findConnector } from "@brightloop/domain";
import type { FinanceHttpRequest, FinanceHttpResponse, FinanceHttpTransport } from "./transport.js";
import { FinanceTransportError } from "./transport.js";
import { classifyHttpStatus, healthForReason, reasonForCategory } from "./errors.js";
import { createFinanceConnectorAdapters, type FinanceConnectorConfig } from "./adapter.js";
import { QUICKBOOKS_BINDING, mapQuickbooksEntity } from "./quickbooks.js";
import { XERO_BINDING, mapXeroEvent } from "./xero.js";
import { buildQboQuery, QUICKBOOKS_ENTITIES, escapeQboLiteral } from "./quickbooks-query.js";
import { verifyHmacSha256Base64, safeEqual } from "./webhook.js";

const NOW = "2026-08-10T00:00:00.000Z";
const CREDS = { quickbooks: { clientId: "qc", clientSecret: "qs" }, xero: { clientId: "xc", clientSecret: "xs" } };
const QBO_CONF = { realmId: "9130347", environment: "production" };
const XERO_CONF = { tenantId: "ten-abc" };

function makeCfg(handler: (req: FinanceHttpRequest) => FinanceHttpResponse): { config: FinanceConnectorConfig; calls: FinanceHttpRequest[] } {
  const calls: FinanceHttpRequest[] = [];
  const transport: FinanceHttpTransport = { request: async (req) => { calls.push(req); return handler(req); } };
  return { config: { transport, now: () => NOW, defaultRedirectUri: "https://app.auxion.co/oauth/cb", timeoutMs: 1000, creds: CREDS }, calls };
}
const json = (status: number, obj: unknown): FinanceHttpResponse => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
const adapters = (cfg: FinanceConnectorConfig) => createFinanceConnectorAdapters(cfg);

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
    expect(classifyHttpStatus(400, { Fault: { Error: [{ code: "2010", Message: "secret detail" }], type: "ValidationFault" } })!.code).toBe("2010");
    expect(classifyHttpStatus(401, { Type: "InvalidCredentials", Detail: "secret" })!.code).toBe("InvalidCredentials");
  });
  it("health level derives from reason", () => {
    expect(healthForReason("connected")).toBe("healthy");
    expect(healthForReason(reasonForCategory("authentication"))).toBe("unauthorized");
    expect(healthForReason(reasonForCategory("rate_limited"))).toBe("degraded");
    expect(healthForReason(reasonForCategory("provider_unavailable"))).toBe("unavailable");
  });
});

describe("authorization — Bearer auth + provider tenancy", () => {
  it("QuickBooks attaches Bearer + realmId company path", async () => {
    const { config, calls } = makeCfg(() => json(200, { CompanyInfo: { Id: "9130347", CompanyName: "Acme" } }));
    const res = await adapters(config)["quickbooks"]!.validateConnection({ connectorId: "quickbooks", authMethod: "oauth2", config: QBO_CONF, secret: "AT" });
    expect(res.ok).toBe(true);
    expect(calls[0]!.url.startsWith("https://quickbooks.api.intuit.com/v3/company/9130347/query")).toBe(true);
    expect(calls[0]!.headers["authorization"]).toBe("Bearer AT");
  });
  it("QuickBooks resolves the sandbox host from config", async () => {
    const { config, calls } = makeCfg(() => json(200, { QueryResponse: {} }));
    await adapters(config)["quickbooks"]!.validateConnection({ connectorId: "quickbooks", authMethod: "oauth2", config: { realmId: "42", environment: "sandbox" }, secret: "AT" });
    expect(calls[0]!.url.startsWith("https://sandbox-quickbooks.api.intuit.com/v3/company/42/")).toBe(true);
  });
  it("QuickBooks without a realmId is a configuration error (no call)", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["quickbooks"]!.validateConnection({ connectorId: "quickbooks", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("config_invalid");
    expect(calls.length).toBe(0);
  });
  it("Xero attaches Bearer + Xero-Tenant-Id header", async () => {
    const { config, calls } = makeCfg(() => json(200, { Organisations: [{ OrganisationID: "org-1", Name: "Acme" }] }));
    await adapters(config)["xero"]!.validateConnection({ connectorId: "xero", authMethod: "oauth2", config: XERO_CONF, secret: "AT" });
    expect(calls[0]!.url).toBe("https://api.xero.com/api.xro/2.0/Organisation");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer AT");
    expect(calls[0]!.headers["xero-tenant-id"]).toBe("ten-abc");
  });
  it("Xero without a tenantId is a configuration error (no call)", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["xero"]!.validateConnection({ connectorId: "xero", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("config_invalid");
    expect(calls.length).toBe(0);
  });
  it("a missing access token is a secret_unavailable failure (no call)", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["quickbooks"]!.execute!({ connectorId: "quickbooks", operation: "finance.invoices.list", authMethod: "oauth2", config: QBO_CONF, secret: null, input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("secret_unavailable");
    expect(calls.length).toBe(0);
  });
});

describe("OAuth 2.0 — authorize URL, Basic-auth exchange, refresh rotation, expiry", () => {
  it("QuickBooks builds a consent URL with scopes + state", () => {
    const { config } = makeCfg(() => json(200, {}));
    const url = adapters(config)["quickbooks"]!.buildAuthorizationUrl!({ connectorId: "quickbooks", scopes: ["com.intuit.quickbooks.accounting", "offline_access"], state: "st8", redirectUri: "", config: {} });
    expect(url.ok).toBe(true);
    if (url.ok) {
      expect(url.value.startsWith("https://appcenter.intuit.com/connect/oauth2?")).toBe(true);
      expect(url.value).toContain("state=st8");
      expect(url.value).toContain("scope=com.intuit.quickbooks.accounting%20offline_access");
    }
  });
  it("exchanges an authorization code using HTTP Basic client auth (no secret in body)", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "AT1", refresh_token: "RT1", expires_in: 3600, token_type: "bearer", scope: "com.intuit.quickbooks.accounting" }));
    const res = await adapters(config)["quickbooks"]!.exchangeAuthorizationCode!({ connectorId: "quickbooks", code: "code123", state: "st", redirectUri: "https://app/cb", config: {} });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.accessToken).toBe("AT1"); expect(res.value.refreshToken).toBe("RT1"); expect(res.value.expiresAt).toBe("2026-08-10T01:00:00.000Z"); }
    const expectedBasic = `Basic ${Buffer.from("qc:qs").toString("base64")}`;
    expect(calls[0]!.headers["authorization"]).toBe(expectedBasic);
    expect(calls[0]!.body).not.toContain("qs");
    expect(calls[0]!.body).toContain("grant_type=authorization_code");
  });
  it("refreshes + rotates the refresh token, and keeps the old one when the provider omits it", async () => {
    const rotate = makeCfg(() => json(200, { access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }));
    const r1 = await adapters(rotate.config)["xero"]!.refreshAccessToken!({ connectorId: "xero", refreshToken: "RT1", config: {} });
    expect(r1.ok && r1.value.refreshToken).toBe("RT2");
    const keep = makeCfg(() => json(200, { access_token: "AT3", expires_in: 1800 }));
    const r2 = await adapters(keep.config)["xero"]!.refreshAccessToken!({ connectorId: "xero", refreshToken: "RT9", config: {} });
    expect(r2.ok && r2.value.refreshToken).toBe("RT9");
  });
  it("an OAuth-less adapter (no client creds) omits the OAuth methods", () => {
    const { config } = makeCfg(() => json(200, {}));
    const noCreds: FinanceConnectorConfig = { ...config, creds: {} };
    expect(adapters(noCreds)["quickbooks"]!.buildAuthorizationUrl).toBeUndefined();
    expect(adapters(noCreds)["xero"]!.exchangeAuthorizationCode).toBeUndefined();
  });
});

describe("QuickBooks — allowlisted query builder (security-critical)", () => {
  it("rejects any entity outside the allowlist", () => {
    expect(buildQboQuery({ entity: "UserCredential" }).ok).toBe(false);
    expect(buildQboQuery({ entity: "Invoice); DROP" }).ok).toBe(false);
    expect(QUICKBOOKS_ENTITIES.has("Invoice")).toBe(true);
    expect(QUICKBOOKS_ENTITIES.has("Employee")).toBe(false);
  });
  it("escapes single quotes + strips control chars in filter literals", () => {
    expect(escapeQboLiteral("O'Brien")).toBe("O\\'Brien");
    expect(escapeQboLiteral("a\tbc")).toBe("abc");
    const q = buildQboQuery({ entity: "Customer", whereEquals: { DisplayName: "O'Brien" } });
    expect(q.ok && q.value).toBe("SELECT * FROM Customer WHERE DisplayName = 'O\\'Brien' STARTPOSITION 1 MAXRESULTS 50");
  });
  it("clamps MAXRESULTS and rejects a non-identifier filter field", () => {
    const q = buildQboQuery({ entity: "Invoice", maxResults: 99999 });
    expect(q.ok && q.value.endsWith("MAXRESULTS 1000")).toBe(true);
    expect(buildQboQuery({ entity: "Invoice", whereEquals: { "Id OR 1=1": "x" } }).ok).toBe(false);
  });
});

describe("normalized operations — execute dispatch + neutral DTOs", () => {
  it("QuickBooks lists invoices through the query endpoint and normalizes them", async () => {
    const { config, calls } = makeCfg(() => json(200, { QueryResponse: { Invoice: [{ Id: "130", DocNumber: "1001", CustomerRef: { value: "58" }, TotalAmt: 100, Balance: 0, TxnDate: "2026-08-01", MetaData: { LastUpdatedTime: "2026-08-02T10:00:00Z" } }] } }));
    const res = await adapters(config)["quickbooks"]!.execute!({ connectorId: "quickbooks", operation: "finance.invoices.list", authMethod: "oauth2", config: QBO_CONF, secret: "AT", input: { limit: 25 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const first = (res.value.data["results"] as Record<string, unknown>[])[0]!;
      expect(first["provider"]).toBe("quickbooks");
      expect(first["externalId"]).toBe("130");
      expect(first["status"]).toBe("paid");
      expect(first["total"]).toBe(100);
    }
    expect(decodeURIComponent(calls[0]!.url)).toContain("SELECT * FROM Invoice");
  });
  it("QuickBooks creates an invoice with a provider-neutral input", async () => {
    const { config, calls } = makeCfg(() => json(200, { Invoice: { Id: "200", CustomerRef: { value: "58" }, TotalAmt: 50, Balance: 50 } }));
    const res = await adapters(config)["quickbooks"]!.execute!({ connectorId: "quickbooks", operation: "finance.invoices.create", authMethod: "oauth2", config: QBO_CONF, secret: "AT", input: { customerId: "58", amount: 50 } });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value.data["record"] as Record<string, unknown>)["status"]).toBe("open");
    expect(calls[0]!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.body!)["CustomerRef"]).toEqual({ value: "58" });
  });
  it("QuickBooks refunds a payment via a refund receipt", async () => {
    const { config, calls } = makeCfg(() => json(200, { RefundReceipt: { Id: "900", TotalAmt: 25 } }));
    const res = await adapters(config)["quickbooks"]!.execute!({ connectorId: "quickbooks", operation: "finance.payments.refund", authMethod: "oauth2", config: QBO_CONF, secret: "AT", input: { customerId: "58", amount: 25 } });
    expect(res.ok && (res.value.data["refunded"])).toBe(true);
    expect(calls[0]!.url).toContain("/refundreceipt");
  });
  it("Xero lists invoices via REST and normalizes status", async () => {
    const { config, calls } = makeCfg(() => json(200, { Invoices: [{ InvoiceID: "inv-1", InvoiceNumber: "INV-1", Contact: { ContactID: "c-1" }, Status: "AUTHORISED", Total: 200, AmountDue: 200, CurrencyCode: "USD", UpdatedDateUTC: "2026-08-02T10:00:00Z" }] }));
    const res = await adapters(config)["xero"]!.execute!({ connectorId: "xero", operation: "finance.invoices.list", authMethod: "oauth2", config: XERO_CONF, secret: "AT", input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const first = (res.value.data["results"] as Record<string, unknown>[])[0]!;
      expect(first["provider"]).toBe("xero");
      expect(first["status"]).toBe("open");
      expect(first["currency"]).toBe("USD");
    }
    expect(calls[0]!.url).toContain("/Invoices?");
    expect(calls[0]!.url).toContain("order=UpdatedDateUTC");
  });
  it("Xero creates a contact wrapped in the provider envelope", async () => {
    const { config, calls } = makeCfg(() => json(200, { Contacts: [{ ContactID: "c-9", Name: "Globex" }] }));
    const res = await adapters(config)["xero"]!.execute!({ connectorId: "xero", operation: "finance.customers.create", authMethod: "oauth2", config: XERO_CONF, secret: "AT", input: { displayName: "Globex", email: "ap@globex.test" } });
    expect(res.ok && (res.value.data["record"] as Record<string, unknown>)["externalId"]).toBe("c-9");
    expect(JSON.parse(calls[0]!.body!)["Contacts"][0]["Name"]).toBe("Globex");
  });
  it("an unsupported operation is rejected before any call", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["xero"]!.execute!({ connectorId: "xero", operation: "finance.payments.refund", authMethod: "oauth2", config: XERO_CONF, secret: "AT", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("unsupported");
    expect(calls.length).toBe(0);
  });
});

describe("health + failure mapping", () => {
  it("a healthy probe reports healthy; a 429 degrades to rate_limited", async () => {
    const ok = makeCfg(() => json(200, { CompanyInfo: { Id: "42" } }));
    const h1 = await adapters(ok.config)["quickbooks"]!.healthCheck({ connectorId: "quickbooks", authMethod: "oauth2", config: QBO_CONF, secret: "AT" });
    expect(h1.ok && h1.value.level).toBe("healthy");
    const limited = makeCfg(() => json(429, {}));
    const h2 = await adapters(limited.config)["xero"]!.healthCheck({ connectorId: "xero", authMethod: "oauth2", config: XERO_CONF, secret: "AT" });
    expect(h2.ok && h2.value.level).toBe("degraded");
  });
  it("a transport failure surfaces as a normalized error, not a throw", async () => {
    const transport: FinanceHttpTransport = { request: async () => { throw new FinanceTransportError("timeout", "boom"); } };
    const cfg: FinanceConnectorConfig = { transport, now: () => NOW, defaultRedirectUri: "", timeoutMs: 10, creds: CREDS };
    const res = await adapters(cfg)["xero"]!.execute!({ connectorId: "xero", operation: "finance.invoices.list", authMethod: "oauth2", config: XERO_CONF, secret: "AT", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("timeout");
  });
});

describe("webhooks — HMAC-SHA256 base64 verification + translation", () => {
  it("verifies a real Intuit intuit-signature vector and translates entity events", () => {
    const secret = "verifier-token";
    const rawBody = JSON.stringify({ eventNotifications: [{ realmId: "9130347", dataChangeEvent: { entities: [{ name: "Invoice", id: "130", operation: "Update", lastUpdated: "2026-08-02T10:00:00Z" }] } }] });
    const sig = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    expect(verifyHmacSha256Base64(rawBody, sig, secret)).toBe(true);
    expect(verifyHmacSha256Base64(rawBody, "AAAA", secret)).toBe(false);

    const v = QUICKBOOKS_BINDING.webhook!.verify(rawBody, sig, secret);
    expect(v.ok && v.value.valid).toBe(true);
    if (v.ok) expect(v.value.externalEventId).toBe("Invoice-130-Update");
    const t = QUICKBOOKS_BINDING.webhook!.translate(rawBody, () => NOW);
    expect(t.ok && t.value[0]!.type).toBe("finance.invoice.updated");
    expect(mapQuickbooksEntity("Payment", "Create")).toBe("finance.payment.created");
    expect(mapQuickbooksEntity("Invoice", "Void")).toBe("finance.invoice.voided");
  });
  it("verifies a real Xero x-xero-signature vector and translates category events", () => {
    const secret = "xero-signing-key";
    const rawBody = JSON.stringify({ events: [{ resourceId: "inv-1", eventCategory: "INVOICE", eventType: "UPDATE", eventDateUtc: "2026-08-02T10:00:00Z" }], lastEventSequence: 7 });
    const sig = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const v = XERO_BINDING.webhook!.verify(rawBody, sig, secret);
    expect(v.ok && v.value.valid).toBe(true);
    if (v.ok) expect(v.value.externalEventId).toBe("INVOICE-inv-1-7");
    const t = XERO_BINDING.webhook!.translate(rawBody, () => NOW);
    expect(t.ok && t.value[0]!.type).toBe("finance.invoice.updated");
    expect(mapXeroEvent("CONTACT", "CREATE")).toBe("finance.customer.created");
  });
  it("an invalid signature verifies false; a missing secret never passes", () => {
    expect(verifyHmacSha256Base64("body", "sig", null)).toBe(false);
    expect(verifyHmacSha256Base64("body", null, "secret")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});

describe("polling — cursor advance", () => {
  it("QuickBooks polls invoices and advances the start-position cursor", async () => {
    const rows = Array.from({ length: 2 }, (_v, k) => ({ Id: `inv${k}`, TotalAmt: 10, Balance: 0, MetaData: { LastUpdatedTime: "2026-08-02T10:00:00Z" } }));
    const { config } = makeCfg(() => json(200, { QueryResponse: { Invoice: rows } }));
    const poll = adapters(config)["quickbooks"]!.poll!;
    const first = await poll({ connectorId: "quickbooks", authMethod: "oauth2", config: QBO_CONF, secret: "AT", cursor: null, limit: 2 });
    expect(first.ok).toBe(true);
    if (first.ok) { expect(first.value.events.length).toBe(2); expect(first.value.events[0]!.type).toBe("finance.invoice.paid"); expect(first.value.nextCursor).toBe("3"); }
  });
  it("Xero polls invoices and advances the page cursor", async () => {
    const rows = Array.from({ length: 100 }, (_v, k) => ({ InvoiceID: `inv-${k}`, Status: "AUTHORISED", UpdatedDateUTC: "2026-08-02T10:00:00Z" }));
    const { config } = makeCfg(() => json(200, { Invoices: rows }));
    const poll = adapters(config)["xero"]!.poll!;
    const first = await poll({ connectorId: "xero", authMethod: "oauth2", config: XERO_CONF, secret: "AT", cursor: null, limit: 100 });
    expect(first.ok).toBe(true);
    if (first.ok) { expect(first.value.events.length).toBe(100); expect(first.value.nextCursor).toBe("2"); }
  });
});

describe("secret non-leakage", () => {
  it("an operation result carries no token or secret material", async () => {
    const { config } = makeCfg(() => json(200, { QueryResponse: { Customer: [{ Id: "1", DisplayName: "Acme", PrimaryEmailAddr: { Address: "a@acme.test" } }] } }));
    const res = await adapters(config)["quickbooks"]!.execute!({ connectorId: "quickbooks", operation: "finance.customers.list", authMethod: "oauth2", config: QBO_CONF, secret: "super-secret-token", input: {} });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain("super-secret-token");
  });
});

describe("registry wiring", () => {
  it("both finance connectors are available finance-category descriptors", () => {
    for (const id of ["quickbooks", "xero"]) {
      const c = findConnector(id);
      expect(c!.available).toBe(true);
      expect(c!.category).toBe("finance");
    }
  });
});
