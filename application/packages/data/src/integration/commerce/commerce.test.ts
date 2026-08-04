/* =============================================================================
 * Commerce connectors — data-layer tests (F4.4). Deterministic, offline.
 *
 * A scripted fake transport (no network) drives per-provider authorization
 * (Shopify header, Stripe bearer, PayPal client-credentials token exchange),
 * health/validation + error classification (7 states), normalized commerce.*
 * operations + execute dispatch, webhook signature verification (real HMAC vectors)
 * + event translation, polling, and the secret-non-leak guarantee. No live
 * Shopify/Stripe/PayPal call is ever made.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { findConnector } from "@brightloop/domain";
import type { CommerceHttpRequest, CommerceHttpResponse, CommerceHttpTransport } from "./transport.js";
import { CommerceTransportError } from "./transport.js";
import { classifyHttpStatus, healthForReason, reasonForCategory } from "./errors.js";
import { createCommerceConnectorAdapters, loadCommerceConfig } from "./adapter.js";
import { SHOPIFY_BINDING } from "./shopify.js";
import { STRIPE_BINDING, mapStripeEventType } from "./stripe.js";
import { PAYPAL_BINDING, mapPaypalEventType } from "./paypal.js";
import { verifyShopifyHmac, verifyStripeSignature, parseStripeSignature } from "./webhook.js";
import type { CommerceConfig } from "./client.js";

const NOW = "2026-08-08T00:00:00.000Z";

function makeCfg(handler: (req: CommerceHttpRequest) => CommerceHttpResponse): { config: CommerceConfig; calls: CommerceHttpRequest[] } {
  const calls: CommerceHttpRequest[] = [];
  const transport: CommerceHttpTransport = { request: async (req) => { calls.push(req); return handler(req); } };
  return { config: { transport, now: () => NOW, timeoutMs: 1000 }, calls };
}
const json = (status: number, obj: unknown): CommerceHttpResponse => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
const adapters = (cfg: CommerceConfig) => createCommerceConnectorAdapters(cfg);

const SHOPIFY_CONF = { shopDomain: "demo.myshopify.com", apiVersion: "2024-01" };

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
  it("reads a safe Stripe error code without leaking a message", () => {
    const c = classifyHttpStatus(402, { error: { code: "card_declined", message: "secret detail" } });
    expect(c!.code).toBe("card_declined");
  });
  it("health level derives from reason", () => {
    expect(healthForReason("connected")).toBe("healthy");
    expect(healthForReason(reasonForCategory("authentication"))).toBe("unauthorized");
    expect(healthForReason(reasonForCategory("rate_limited"))).toBe("degraded");
    expect(healthForReason(reasonForCategory("provider_unavailable"))).toBe("unavailable");
  });
});

describe("authorization — per-provider auth styles", () => {
  it("Shopify attaches the X-Shopify-Access-Token header + shop base URL", async () => {
    const { config, calls } = makeCfg(() => json(200, { shop: { id: 1, name: "Demo" } }));
    const shopify = adapters(config)["shopify"]!;
    const v = await shopify.validateConnection({ connectorId: "shopify", authMethod: "api_key", config: SHOPIFY_CONF, secret: "shpat_x" });
    expect(v.ok).toBe(true);
    expect(calls[0]!.url).toBe("https://demo.myshopify.com/admin/api/2024-01/shop.json");
    expect(calls[0]!.headers["x-shopify-access-token"]).toBe("shpat_x");
    expect(JSON.stringify(calls[0]!.headers)).not.toContain("Bearer");
  });
  it("Stripe attaches an Authorization: Bearer header", async () => {
    const { config, calls } = makeCfg(() => json(200, { available: [], pending: [] }));
    const stripe = adapters(config)["stripe"]!;
    await stripe.validateConnection({ connectorId: "stripe", authMethod: "api_key", config: {}, secret: "sk_test_1" });
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/balance");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer sk_test_1");
  });
  it("PayPal exchanges client-credentials for a bearer token before any op", async () => {
    const { config, calls } = makeCfg((req) => req.url.includes("/v1/oauth2/token") ? json(200, { access_token: "A_TOKEN", token_type: "Bearer" }) : json(200, { id: "ORDER1", status: "CREATED", intent: "CAPTURE" }));
    const paypal = adapters(config)["paypal"]!;
    const res = await paypal.execute!({ connectorId: "paypal", operation: "commerce.orders.read", authMethod: "api_key", config: { clientId: "cid", environment: "sandbox" }, secret: "csecret", input: { orderId: "ORDER1" } });
    expect(res.ok).toBe(true);
    // first call is the token exchange (Basic auth), second is the order read (Bearer)
    expect(calls[0]!.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(calls[0]!.headers["authorization"]).toMatch(/^Basic /);
    expect(calls[0]!.body).toContain("grant_type=client_credentials");
    expect(calls[1]!.headers["authorization"]).toBe("Bearer A_TOKEN");
    // client secret only ever went to the token endpoint as Basic auth, never in the URL
    expect(calls[1]!.url).not.toContain("csecret");
  });
  it("PayPal uses the live host when environment=live", async () => {
    const { config, calls } = makeCfg((req) => req.url.includes("/v1/oauth2/token") ? json(200, { access_token: "T" }) : json(200, {}));
    const paypal = adapters(config)["paypal"]!;
    await paypal.execute!({ connectorId: "paypal", operation: "commerce.store.read", authMethod: "api_key", config: { clientId: "cid", environment: "live" }, secret: "s", input: {} });
    expect(calls[0]!.url).toBe("https://api-m.paypal.com/v1/oauth2/token");
  });
  it("a missing credential never reaches the network", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    for (const id of ["shopify", "stripe", "paypal"]) {
      const res = await adapters(config)[id]!.execute!({ connectorId: id, operation: "commerce.health", authMethod: "api_key", config: id === "shopify" ? SHOPIFY_CONF : id === "paypal" ? { clientId: "c", environment: "sandbox" } : {}, secret: null, input: {} });
      expect(res.ok, id).toBe(false);
      if (!res.ok) expect(res.category).toBe("secret_unavailable");
    }
    expect(calls.length).toBe(0);
  });
});

describe("health probing (7 states) from provider failures", () => {
  it("Shopify maps probe failures to expired / permission_missing / rate_limited", async () => {
    for (const [status, level, reason] of [[401, "unauthorized", "expired"], [403, "unauthorized", "permission_missing"], [429, "degraded", "rate_limited"]] as const) {
      const { config } = makeCfg(() => json(status, { errors: "x" }));
      const h = await adapters(config)["shopify"]!.healthCheck({ connectorId: "shopify", authMethod: "api_key", config: SHOPIFY_CONF, secret: "t" });
      expect(h.ok).toBe(true);
      if (h.ok) { expect(h.value.level).toBe(level); expect(h.value.detail["reason"]).toBe(reason); }
    }
  });
  it("PayPal reports healthy when the token exchange succeeds (no separate probe)", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "T" }));
    const h = await adapters(config)["paypal"]!.healthCheck({ connectorId: "paypal", authMethod: "api_key", config: { clientId: "c", environment: "sandbox" }, secret: "s" });
    expect(h.ok && h.value.level).toBe("healthy");
    expect(calls.length).toBe(1); // only the token exchange
  });
  it("PayPal reports expired when the token exchange is unauthorized", async () => {
    const { config } = makeCfg(() => json(401, {}));
    const h = await adapters(config)["paypal"]!.healthCheck({ connectorId: "paypal", authMethod: "api_key", config: { clientId: "c", environment: "sandbox" }, secret: "bad" });
    expect(h.ok).toBe(true);
    if (h.ok) { expect(h.value.level).toBe("unauthorized"); expect(h.value.detail["reason"]).toBe("expired"); }
  });
});

describe("capability coverage — every declared operation has an executable handler", () => {
  const maps: Record<string, Record<string, unknown>> = { shopify: SHOPIFY_BINDING.ops, stripe: STRIPE_BINDING.ops, paypal: PAYPAL_BINDING.ops };
  for (const connectorId of Object.keys(maps)) {
    it(`${connectorId} implements all declared capabilities`, () => {
      const descriptor = findConnector(connectorId)!;
      for (const cap of descriptor.capabilities) expect(maps[connectorId]![cap.operation], `${connectorId}:${cap.operation}`).toBeDefined();
    });
  }
  it("discoverCapabilities reports every operation supported", async () => {
    const { config } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["stripe"]!.discoverCapabilities({ connectorId: "stripe", authMethod: "api_key", config: {}, secret: "sk" });
    expect(res.ok && res.value.every((c) => c.supported)).toBe(true);
  });
});

describe("operations hit the right endpoint and normalize output", () => {
  it("shopify products.write PUTs on update, POSTs on create", async () => {
    const { config, calls } = makeCfg(() => json(200, { product: { id: 9, title: "T", status: "active" } }));
    const shopify = adapters(config)["shopify"]!;
    await shopify.execute!({ connectorId: "shopify", operation: "commerce.products.write", authMethod: "api_key", config: SHOPIFY_CONF, secret: "t", input: { title: "T", productId: "9" } });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/products/9.json");
  });
  it("stripe checkout.create posts a form-encoded line item", async () => {
    const { config, calls } = makeCfg(() => json(200, { id: "cs_1", url: "https://pay", status: "open" }));
    const stripe = adapters(config)["stripe"]!;
    const res = await stripe.execute!({ connectorId: "stripe", operation: "commerce.checkout.create", authMethod: "api_key", config: {}, secret: "sk", input: { priceId: "price_1", successUrl: "https://s", cancelUrl: "https://c" } });
    expect(res.ok && res.value.data["checkoutSessionId"]).toBe("cs_1");
    expect(calls[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(calls[0]!.body).toContain("line_items%5B0%5D%5Bprice%5D=price_1");
  });
  it("stripe refund accepts a payment intent and returns a normalized refund", async () => {
    const { config, calls } = makeCfg(() => json(200, { id: "re_1", amount: 500, currency: "usd", status: "succeeded" }));
    const stripe = adapters(config)["stripe"]!;
    const res = await stripe.execute!({ connectorId: "stripe", operation: "commerce.payments.refund", authMethod: "api_key", config: {}, secret: "sk", input: { paymentIntentId: "pi_1", amount: 500 } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data["refund"]).toMatchObject({ id: "re_1", amount: 500, currency: "usd", status: "succeeded" });
    expect(calls[0]!.body).toContain("payment_intent=pi_1");
  });
  it("paypal capture posts to the order capture endpoint", async () => {
    const { config, calls } = makeCfg((req) => req.url.includes("/v1/oauth2/token") ? json(200, { access_token: "T" }) : json(201, { id: "O1", status: "COMPLETED", intent: "CAPTURE" }));
    const paypal = adapters(config)["paypal"]!;
    const res = await paypal.execute!({ connectorId: "paypal", operation: "commerce.payments.capture", authMethod: "api_key", config: { clientId: "c", environment: "sandbox" }, secret: "s", input: { orderId: "O1" } });
    expect(res.ok && (res.value.data["order"] as Record<string, unknown>)["status"]).toBe("COMPLETED");
    expect(calls[1]!.url).toContain("/v2/checkout/orders/O1/capture");
  });
  it("a required-field-missing op is rejected as validation before the network", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const stripe = adapters(config)["stripe"]!;
    const res = await stripe.execute!({ connectorId: "stripe", operation: "commerce.payments.refund", authMethod: "api_key", config: {}, secret: "sk", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("validation");
    expect(calls.length).toBe(0);
  });
  it("an unsupported operation is rejected without authorizing", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["shopify"]!.execute!({ connectorId: "shopify", operation: "commerce.nope", authMethod: "api_key", config: SHOPIFY_CONF, secret: "t", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("unsupported");
    expect(calls.length).toBe(0);
  });
});

describe("webhook signature verification (real HMAC vectors)", () => {
  const shopifyBody = JSON.stringify({ id: 12345, financial_status: "paid", line_items: [{}] });
  const stripeBody = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", created: 1_700_000_000, data: { object: { id: "pi_1" } } });

  it("Shopify accepts a correct base64 HMAC and rejects a tampered body", () => {
    const secret = "shopify_signing";
    const sig = createHmac("sha256", secret).update(shopifyBody, "utf8").digest("base64");
    expect(verifyShopifyHmac(shopifyBody, sig, secret)).toBe(true);
    expect(verifyShopifyHmac(shopifyBody + " ", sig, secret)).toBe(false);
    expect(verifyShopifyHmac(shopifyBody, sig, "wrong")).toBe(false);
    expect(verifyShopifyHmac(shopifyBody, null, secret)).toBe(false);
    expect(verifyShopifyHmac(shopifyBody, sig, null)).toBe(false);
  });
  it("Stripe verifies the t.payload scheme and rejects a wrong secret", () => {
    const secret = "whsec_x";
    const t = "1700000000";
    const v1 = createHmac("sha256", secret).update(`${t}.${stripeBody}`, "utf8").digest("hex");
    const header = `t=${t},v1=${v1}`;
    expect(parseStripeSignature(header)).toEqual({ t, v1: [v1] });
    expect(verifyStripeSignature(stripeBody, header, secret)).toBe(true);
    expect(verifyStripeSignature(stripeBody, header, "whsec_wrong")).toBe(false);
    expect(verifyStripeSignature(stripeBody, `t=${t},v1=deadbeef`, secret)).toBe(false);
  });

  it("adapter.verifyWebhook (Shopify) returns valid + the external id", () => {
    const { config } = makeCfg(() => json(200, {}));
    const secret = "sig";
    const sig = createHmac("sha256", secret).update(shopifyBody, "utf8").digest("base64");
    const res = adapters(config)["shopify"]!.verifyWebhook!({ connectorId: "shopify", rawBody: shopifyBody, signature: sig, signingSecret: secret });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.valid).toBe(true); expect(res.value.externalEventId).toBe("12345"); }
  });
  it("adapter.verifyWebhook (Stripe) returns invalid for a bad signature but still yields the id", () => {
    const { config } = makeCfg(() => json(200, {}));
    const res = adapters(config)["stripe"]!.verifyWebhook!({ connectorId: "stripe", rawBody: stripeBody, signature: "t=1,v1=bad", signingSecret: "whsec_x" });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.valid).toBe(false); expect(res.value.externalEventId).toBe("evt_1"); }
  });
  it("PayPal verification is structural: needs a configured webhook id + a present signature", () => {
    const { config } = makeCfg(() => json(200, {}));
    const body = JSON.stringify({ id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "cap1" } });
    const paypal = adapters(config)["paypal"]!;
    expect(paypal.verifyWebhook!({ connectorId: "paypal", rawBody: body, signature: "present", signingSecret: "webhook-id" }).ok).toBe(true);
    const missingId = paypal.verifyWebhook!({ connectorId: "paypal", rawBody: body, signature: "present", signingSecret: null });
    expect(missingId.ok && missingId.value.valid).toBe(false);
    const missingSig = paypal.verifyWebhook!({ connectorId: "paypal", rawBody: body, signature: null, signingSecret: "webhook-id" });
    expect(missingSig.ok && missingSig.value.valid).toBe(false);
  });
});

describe("event translation (provider → normalized commerce.*, no vendor shape exposed)", () => {
  it("Stripe event types map to the canonical vocabulary", () => {
    expect(mapStripeEventType("payment_intent.succeeded")).toBe("commerce.payment.completed");
    expect(mapStripeEventType("charge.refunded")).toBe("commerce.payment.refunded");
    expect(mapStripeEventType("checkout.session.completed")).toBe("commerce.checkout.completed");
    expect(mapStripeEventType("charge.dispute.created")).toBe("commerce.dispute.created");
    expect(mapStripeEventType("unknown.event")).toBe("commerce.event.received");
  });
  it("PayPal event types map to the canonical vocabulary", () => {
    expect(mapPaypalEventType("PAYMENT.CAPTURE.COMPLETED")).toBe("commerce.payment.completed");
    expect(mapPaypalEventType("PAYMENT.CAPTURE.REFUNDED")).toBe("commerce.payment.refunded");
    expect(mapPaypalEventType("CHECKOUT.ORDER.COMPLETED")).toBe("commerce.order.paid");
  });
  it("Stripe translateWebhook yields one canonical event with a computed occurredAt", () => {
    const { config } = makeCfg(() => json(200, {}));
    const body = JSON.stringify({ id: "evt_9", type: "payment_intent.succeeded", created: 1_700_000_000, data: { object: { id: "pi_9" } } });
    const res = adapters(config)["stripe"]!.translateWebhook!({ connectorId: "stripe", rawBody: body, source: "webhook" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0]!.type).toBe("commerce.payment.completed");
      expect(res.value[0]!.externalId).toBe("evt_9");
      expect(res.value[0]!.occurredAt).toBe("2023-11-14T22:13:20.000Z");
      expect(JSON.stringify(res.value[0]!.payload)).not.toContain("pi_secret");
    }
  });
  it("Shopify translateWebhook infers the type from the body shape", () => {
    const { config } = makeCfg(() => json(200, {}));
    const cancelled = JSON.stringify({ id: 1, cancelled_at: "2026-08-08T00:00:00Z" });
    const refunded = JSON.stringify({ id: 2, financial_status: "refunded" });
    const shopify = adapters(config)["shopify"]!;
    const a = shopify.translateWebhook!({ connectorId: "shopify", rawBody: cancelled, source: "webhook" });
    const b = shopify.translateWebhook!({ connectorId: "shopify", rawBody: refunded, source: "webhook" });
    expect(a.ok && a.value[0]!.type).toBe("commerce.order.cancelled");
    expect(b.ok && b.value[0]!.type).toBe("commerce.payment.refunded");
  });
  it("Shopify poll yields canonical order events and advances the since_id cursor", async () => {
    const { config, calls } = makeCfg(() => json(200, { orders: [{ id: 501, financial_status: "paid", updated_at: NOW, line_items: [{}] }, { id: 500, financial_status: "pending", line_items: [{}] }] }));
    const res = await adapters(config)["shopify"]!.poll!({ connectorId: "shopify", authMethod: "api_key", config: SHOPIFY_CONF, secret: "t", cursor: "499", limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.events[0]!.type).toBe("commerce.order.paid"); expect(res.value.nextCursor).toBe("501"); }
    expect(calls[0]!.url).toContain("since_id=499");
  });
  it("Stripe poll translates the events feed and advances starting_after", async () => {
    const { config, calls } = makeCfg(() => json(200, { data: [{ id: "evt_b", type: "charge.refunded", created: 1_700_000_050 }, { id: "evt_a", type: "customer.created", created: 1_700_000_000 }] }));
    const res = await adapters(config)["stripe"]!.poll!({ connectorId: "stripe", authMethod: "api_key", config: {}, secret: "sk", cursor: null, limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.events[0]!.type).toBe("commerce.payment.refunded"); expect(res.value.nextCursor).toBe("evt_b"); }
    expect(calls[0]!.url).toContain("/v1/events");
  });
});

describe("secret handling + transport failures", () => {
  it("no token or secret appears in a normalized output", async () => {
    const { config } = makeCfg(() => json(200, { shop: { id: 1, name: "Demo", access_token: "LEAK", authorization: "Bearer LEAK" } }));
    const res = await adapters(config)["shopify"]!.execute!({ connectorId: "shopify", operation: "commerce.store.read", authMethod: "api_key", config: SHOPIFY_CONF, secret: "shpat_secret", input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) expect(JSON.stringify(res.value.data)).not.toContain("LEAK");
  });
  it("transport network/timeout errors map to the normalized taxonomy", async () => {
    const transport: CommerceHttpTransport = { request: async () => { throw new CommerceTransportError("timeout", "x"); } };
    const config: CommerceConfig = { transport, now: () => NOW };
    const res = await adapters(config)["stripe"]!.execute!({ connectorId: "stripe", operation: "commerce.balance.read", authMethod: "api_key", config: {}, secret: "sk", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("timeout");
  });
  it("loadCommerceConfig builds a config with the shared transport + clock", () => {
    const transport: CommerceHttpTransport = { request: async () => json(200, {}) };
    const cfg = loadCommerceConfig({} as NodeJS.ProcessEnv, transport, () => NOW);
    expect(cfg.now()).toBe(NOW);
    expect(cfg.timeoutMs).toBe(15_000);
  });
});
