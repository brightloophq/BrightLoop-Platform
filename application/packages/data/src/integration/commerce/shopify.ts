/* =============================================================================
 * Shopify provider binding (F4.4). API-key (Admin API access token) auth via the
 * `X-Shopify-Access-Token` header. Maps the NORMALIZED commerce.* operations onto
 * the Shopify Admin REST API. Webhooks are verified by base64 HMAC-SHA256 of the raw
 * body; topics are inferred from the body shape (the `X-Shopify-Topic` header is not
 * available through the synchronous webhook port — see the F4.4 known limitations).
 * Provider-neutral in/out; no Shopify shape or secret leaks past this boundary.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult, type VerifiedWebhook,
} from "@brightloop/domain";
import type { AuthContext, CommerceCall, CommerceConfig, CommerceProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, scalarStr, type OpInput } from "./helpers.js";
import { COMMERCE_EVENTS, commerceEvent, type CommerceEventType, type NormalizedCommerceEvent } from "./normalize.js";
import { verifyShopifyHmac } from "./webhook.js";

const PROVENANCE = "shopify:webhook";
const POLL_PROVENANCE = "shopify:poll";

function normalizeShopDomain(raw: string): string {
  const trimmed = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return trimmed;
}
function baseFor(config: OpInput): string {
  const domain = normalizeShopDomain(optStr(config, "shopDomain"));
  const apiVersion = optStr(config, "apiVersion", "2024-01");
  return `https://${domain}/admin/api/${apiVersion}`;
}

/** Shopify authorizes with a static Admin API access token — no token exchange. */
async function authorize(_cfg: CommerceConfig, secret: string | null, config: OpInput): Promise<ConnectorResult<AuthContext>> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  const domain = normalizeShopDomain(optStr(config, "shopDomain"));
  if (domain.length === 0) return connectorErr("config_invalid", "shopDomain is not configured", "no_shop_domain");
  return connectorOk({ baseUrl: baseFor(config), headers: { "x-shopify-access-token": secret } });
}

/** Normalize a Shopify order object into a bounded, provider-neutral shape. */
function order(o: Record<string, unknown>): Record<string, unknown> {
  return {
    id: scalarStr(o["id"]), name: optStr(o, "name"), email: optStr(o, "email"),
    financialStatus: optStr(o, "financial_status"), fulfillmentStatus: optStr(o, "fulfillment_status"),
    totalPrice: optStr(o, "total_price"), currency: optStr(o, "currency"),
    createdAt: optStr(o, "created_at"), updatedAt: optStr(o, "updated_at"), cancelledAt: optStr(o, "cancelled_at"),
  };
}
function customer(c: Record<string, unknown>): Record<string, unknown> {
  return { id: scalarStr(c["id"]), email: optStr(c, "email"), firstName: optStr(c, "first_name"), lastName: optStr(c, "last_name"), ordersCount: optNum(c, "orders_count", 0) };
}
function product(p: Record<string, unknown>): Record<string, unknown> {
  return { id: scalarStr(p["id"]), title: optStr(p, "title"), status: optStr(p, "status"), vendor: optStr(p, "vendor"), productType: optStr(p, "product_type") };
}

const OPS: Record<string, (call: CommerceCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "commerce.store.read": async (call) => {
    const r = await call({ method: "GET", path: "/shop.json" });
    if (!r.ok) return r;
    const s = obj(r.value["shop"]);
    return output({ id: scalarStr(s["id"]), name: optStr(s, "name"), domain: optStr(s, "domain"), currency: optStr(s, "currency"), planName: optStr(s, "plan_name") });
  },
  "commerce.products.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/products.json", query: { limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ products: arr(r.value["products"]).map(product) });
  },
  "commerce.products.write": async (call, input) => {
    const title = reqStr(input, "title"); if (!title.ok) return title;
    const body = { product: { title: title.value, body_html: optStr(input, "description"), vendor: optStr(input, "vendor"), product_type: optStr(input, "productType"), status: optStr(input, "status", "draft") } };
    const id = optStr(input, "productId");
    const r = id.length > 0
      ? await call({ method: "PUT", path: `/products/${encodeURIComponent(id)}.json`, jsonBody: body })
      : await call({ method: "POST", path: "/products.json", jsonBody: body });
    if (!r.ok) return r;
    return output({ product: product(obj(r.value["product"])) });
  },
  "commerce.collections.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/custom_collections.json", query: { limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ collections: arr(r.value["custom_collections"]).map((c) => ({ id: scalarStr(c["id"]), title: optStr(c, "title"), handle: optStr(c, "handle") })) });
  },
  "commerce.inventory.read": async (call, input) => {
    const ids = optStr(input, "locationIds");
    const r = await call({ method: "GET", path: "/inventory_levels.json", query: { location_ids: ids.length > 0 ? ids : undefined, limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ inventoryLevels: arr(r.value["inventory_levels"]).map((l) => ({ inventoryItemId: scalarStr(l["inventory_item_id"]), locationId: scalarStr(l["location_id"]), available: optNum(l, "available", 0) })) });
  },
  "commerce.locations.read": async (call) => {
    const r = await call({ method: "GET", path: "/locations.json" });
    if (!r.ok) return r;
    return output({ locations: arr(r.value["locations"]).map((l) => ({ id: scalarStr(l["id"]), name: optStr(l, "name"), city: optStr(l, "city"), country: optStr(l, "country_code"), active: l["active"] === true })) });
  },
  "commerce.customers.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/customers.json", query: { limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ customers: arr(r.value["customers"]).map(customer) });
  },
  "commerce.orders.read": async (call, input) => {
    const id = optStr(input, "orderId");
    if (id.length > 0) {
      const r = await call({ method: "GET", path: `/orders/${encodeURIComponent(id)}.json` });
      if (!r.ok) return r;
      return output({ order: order(obj(r.value["order"])) });
    }
    const r = await call({ method: "GET", path: "/orders.json", query: { status: optStr(input, "status", "any"), limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ orders: arr(r.value["orders"]).map(order) });
  },
  "commerce.orders.write": async (call, input) => {
    const lineItems = Array.isArray(input["lineItems"]) ? (input["lineItems"] as unknown[]) : [];
    if (lineItems.length === 0) return missing("lineItems");
    const r = await call({ method: "POST", path: "/orders.json", jsonBody: { order: { line_items: lineItems, email: optStr(input, "email"), financial_status: optStr(input, "financialStatus", "pending") } } });
    if (!r.ok) return r;
    return output({ order: order(obj(r.value["order"])) });
  },
  "commerce.draft_orders.write": async (call, input) => {
    const lineItems = Array.isArray(input["lineItems"]) ? (input["lineItems"] as unknown[]) : [];
    if (lineItems.length === 0) return missing("lineItems");
    const r = await call({ method: "POST", path: "/draft_orders.json", jsonBody: { draft_order: { line_items: lineItems, email: optStr(input, "email") } } });
    if (!r.ok) return r;
    const d = obj(r.value["draft_order"]);
    return output({ draftOrderId: scalarStr(d["id"]), name: optStr(d, "name"), status: optStr(d, "status"), invoiceUrl: optStr(d, "invoice_url") });
  },
  "commerce.fulfillments.write": async (call, input) => {
    const orderId = reqStr(input, "orderId"); if (!orderId.ok) return orderId;
    const r = await call({ method: "POST", path: `/orders/${encodeURIComponent(orderId.value)}/fulfillments.json`, jsonBody: { fulfillment: { location_id: optStr(input, "locationId"), tracking_number: optStr(input, "trackingNumber"), notify_customer: input["notifyCustomer"] === true } } });
    if (!r.ok) return r;
    const f = obj(r.value["fulfillment"]);
    return output({ fulfillmentId: scalarStr(f["id"]), status: optStr(f, "status"), orderId: orderId.value });
  },
  "commerce.price_rules.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/price_rules.json", query: { limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ priceRules: arr(r.value["price_rules"]).map((p) => ({ id: scalarStr(p["id"]), title: optStr(p, "title"), valueType: optStr(p, "value_type"), value: optStr(p, "value"), targetType: optStr(p, "target_type") })) });
  },
  "commerce.discounts.read": async (call, input) => {
    const priceRuleId = reqStr(input, "priceRuleId"); if (!priceRuleId.ok) return priceRuleId;
    const r = await call({ method: "GET", path: `/price_rules/${encodeURIComponent(priceRuleId.value)}/discount_codes.json` });
    if (!r.ok) return r;
    return output({ discountCodes: arr(r.value["discount_codes"]).map((d) => ({ id: scalarStr(d["id"]), code: optStr(d, "code"), usageCount: optNum(d, "usage_count", 0) })) });
  },
  "commerce.checkout.create": async (call, input) => {
    const lineItems = Array.isArray(input["lineItems"]) ? (input["lineItems"] as unknown[]) : [];
    if (lineItems.length === 0) return missing("lineItems");
    const r = await call({ method: "POST", path: "/checkouts.json", jsonBody: { checkout: { line_items: lineItems, email: optStr(input, "email") } } });
    if (!r.ok) return r;
    const c = obj(r.value["checkout"]);
    return output({ checkoutId: scalarStr(c["id"]), webUrl: optStr(c, "web_url"), totalPrice: optStr(c, "total_price") });
  },
  "commerce.payments.refund": async (call, input) => {
    const orderId = reqStr(input, "orderId"); if (!orderId.ok) return orderId;
    const r = await call({ method: "POST", path: `/orders/${encodeURIComponent(orderId.value)}/refunds.json`, jsonBody: { refund: { note: optStr(input, "note"), notify: input["notify"] === true } } });
    if (!r.ok) return r;
    const f = obj(r.value["refund"]);
    return output({ refundId: scalarStr(f["id"]), orderId: orderId.value, createdAt: optStr(f, "created_at") });
  },
  "commerce.health": async (call) => {
    const r = await call({ method: "GET", path: "/shop.json" });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "shopify" });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyShopifyHmac(rawBody, signature, signingSecret);
  // The external id anchors idempotency; Shopify bodies carry a top-level `id`.
  let externalId = "";
  try { externalId = scalarStr((JSON.parse(rawBody) as Record<string, unknown>)["id"]); } catch { externalId = ""; }
  return connectorOk({ valid, externalEventId: externalId.length > 0 ? externalId : "unknown" });
}

/** Infer the canonical event type from a Shopify order/customer/product body shape. */
function inferType(b: Record<string, unknown>): CommerceEventType {
  if (typeof b["cancelled_at"] === "string" && b["cancelled_at"].length > 0) return COMMERCE_EVENTS.orderCancelled;
  const fin = optStr(b, "financial_status");
  const ful = optStr(b, "fulfillment_status");
  if (fin === "refunded" || fin === "partially_refunded") return COMMERCE_EVENTS.paymentRefunded;
  if (ful === "fulfilled") return COMMERCE_EVENTS.orderFulfilled;
  if (fin === "paid") return COMMERCE_EVENTS.orderPaid;
  if (Array.isArray(b["line_items"])) return COMMERCE_EVENTS.orderUpdated;
  if (Array.isArray(b["variants"]) || typeof b["product_type"] === "string") return COMMERCE_EVENTS.productUpdated;
  if (typeof b["email"] === "string" && typeof b["orders_count"] !== "undefined") return COMMERCE_EVENTS.customerCreated;
  return COMMERCE_EVENTS.eventReceived;
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = obj(JSON.parse(rawBody)); } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const id = scalarStr(body["id"]);
  if (id.length === 0) return connectorOk([]);
  const ev: NormalizedCommerceEvent = {
    type: inferType(body), externalId: id,
    occurredAt: optStr(body, "updated_at") || optStr(body, "created_at") || now(),
    payload: { financialStatus: optStr(body, "financial_status"), fulfillmentStatus: optStr(body, "fulfillment_status") },
  };
  return connectorOk([commerceEvent(ev, PROVENANCE)]);
}

/** Poll orders updated since the cursor → canonical order events. Cursor = newest order id. */
async function poll(call: CommerceCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const r = await call({ method: "GET", path: "/orders.json", query: { status: "any", limit, since_id: cursor ?? undefined } });
  if (!r.ok) return r;
  const orders = arr(r.value["orders"]);
  const events: CanonicalConnectorEvent[] = orders.map((o) => commerceEvent({
    type: inferType(o), externalId: scalarStr(o["id"]),
    occurredAt: optStr(o, "updated_at") || optStr(o, "created_at") || now(),
    payload: { financialStatus: optStr(o, "financial_status"), name: optStr(o, "name") },
  }, POLL_PROVENANCE)).filter((e) => e.externalId.length > 0 && e.externalId !== "unknown");
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const SHOPIFY_BINDING: CommerceProviderBinding = {
  connectorId: "shopify",
  bodyStyle: "json",
  classify: (status) => classifyHttpStatus(status),
  authorize,
  probePath: "/shop.json",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};
