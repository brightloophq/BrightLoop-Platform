/* =============================================================================
 * Stripe provider binding (F4.4). API-key (secret key) auth via `Authorization:
 * Bearer sk_…`. Stripe expects FORM-encoded request bodies and returns typed JSON.
 * Maps the NORMALIZED commerce.* operations onto the Stripe REST API. Webhooks are
 * verified by the `t=…,v1=…` HMAC-SHA256 scheme and translated from the self-
 * describing `event.type` envelope. Provider-neutral in/out; no Stripe shape or
 * secret leaks past this boundary.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult, type VerifiedWebhook,
} from "@brightloop/domain";
import type { AuthContext, CommerceCall, CommerceConfig, CommerceProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, scalarStr, type OpInput } from "./helpers.js";
import { COMMERCE_EVENTS, commerceEvent, type CommerceEventType } from "./normalize.js";
import { verifyStripeSignature } from "./webhook.js";

const BASE = "https://api.stripe.com";
const PROVENANCE = "stripe:webhook";
const POLL_PROVENANCE = "stripe:poll";

/** Stripe authorizes with a static secret key — no token exchange. */
async function authorize(_cfg: CommerceConfig, secret: string | null, _config: OpInput): Promise<ConnectorResult<AuthContext>> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no api key", "no_token");
  return connectorOk({ baseUrl: BASE, headers: { authorization: `Bearer ${secret}` } });
}

function money(o: Record<string, unknown>): Record<string, unknown> {
  return { id: optStr(o, "id"), amount: optNum(o, "amount", 0), currency: optStr(o, "currency"), status: optStr(o, "status") };
}

const OPS: Record<string, (call: CommerceCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "commerce.store.read": async (call) => {
    const r = await call({ method: "GET", path: "/v1/account" });
    if (!r.ok) return r;
    return output({ id: optStr(r.value, "id"), country: optStr(r.value, "country"), defaultCurrency: optStr(r.value, "default_currency"), chargesEnabled: r.value["charges_enabled"] === true });
  },
  "commerce.customers.read": async (call, input) => {
    const id = optStr(input, "customerId");
    if (id.length > 0) {
      const r = await call({ method: "GET", path: `/v1/customers/${encodeURIComponent(id)}` });
      if (!r.ok) return r;
      return output({ customer: { id: optStr(r.value, "id"), email: optStr(r.value, "email"), name: optStr(r.value, "name") } });
    }
    const r = await call({ method: "GET", path: "/v1/customers", query: { limit: optNum(input, "limit", 25) } });
    if (!r.ok) return r;
    return output({ customers: arr(r.value["data"]).map((c) => ({ id: optStr(c, "id"), email: optStr(c, "email"), name: optStr(c, "name") })) });
  },
  "commerce.products.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/v1/products", query: { limit: optNum(input, "limit", 25) } });
    if (!r.ok) return r;
    return output({ products: arr(r.value["data"]).map((p) => ({ id: optStr(p, "id"), name: optStr(p, "name"), active: p["active"] === true })) });
  },
  "commerce.products.write": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const r = await call({ method: "POST", path: "/v1/products", formBody: { name: name.value, description: optStr(input, "description") || undefined } });
    if (!r.ok) return r;
    return output({ product: { id: optStr(r.value, "id"), name: optStr(r.value, "name"), active: r.value["active"] === true } });
  },
  "commerce.prices.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/v1/prices", query: { limit: optNum(input, "limit", 25), product: optStr(input, "productId") || undefined } });
    if (!r.ok) return r;
    return output({ prices: arr(r.value["data"]).map((p) => ({ id: optStr(p, "id"), currency: optStr(p, "currency"), unitAmount: optNum(p, "unit_amount", 0), product: scalarStr(p["product"]) })) });
  },
  "commerce.payments.read": async (call, input) => {
    const id = optStr(input, "paymentIntentId");
    if (id.length > 0) {
      const r = await call({ method: "GET", path: `/v1/payment_intents/${encodeURIComponent(id)}` });
      if (!r.ok) return r;
      return output({ paymentIntent: money(r.value) });
    }
    const r = await call({ method: "GET", path: "/v1/payment_intents", query: { limit: optNum(input, "limit", 25) } });
    if (!r.ok) return r;
    return output({ paymentIntents: arr(r.value["data"]).map(money) });
  },
  "commerce.payments.capture": async (call, input) => {
    const id = reqStr(input, "paymentIntentId"); if (!id.ok) return id;
    const amount = optNum(input, "amountToCapture", 0);
    const r = await call({ method: "POST", path: `/v1/payment_intents/${encodeURIComponent(id.value)}/capture`, formBody: amount > 0 ? { amount_to_capture: amount } : {} });
    if (!r.ok) return r;
    return output({ paymentIntent: money(r.value) });
  },
  "commerce.payments.refund": async (call, input) => {
    const paymentIntent = optStr(input, "paymentIntentId");
    const charge = optStr(input, "chargeId");
    if (paymentIntent.length === 0 && charge.length === 0) return missing("paymentIntentId");
    const form: Record<string, string | number> = {};
    if (paymentIntent.length > 0) form["payment_intent"] = paymentIntent;
    if (charge.length > 0) form["charge"] = charge;
    const amount = optNum(input, "amount", 0);
    if (amount > 0) form["amount"] = amount;
    const r = await call({ method: "POST", path: "/v1/refunds", formBody: form });
    if (!r.ok) return r;
    return output({ refund: money(r.value) });
  },
  "commerce.invoices.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/v1/invoices", query: { limit: optNum(input, "limit", 25), customer: optStr(input, "customerId") || undefined } });
    if (!r.ok) return r;
    return output({ invoices: arr(r.value["data"]).map((i) => ({ id: optStr(i, "id"), status: optStr(i, "status"), amountDue: optNum(i, "amount_due", 0), currency: optStr(i, "currency") })) });
  },
  "commerce.subscriptions.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/v1/subscriptions", query: { limit: optNum(input, "limit", 25), customer: optStr(input, "customerId") || undefined } });
    if (!r.ok) return r;
    return output({ subscriptions: arr(r.value["data"]).map((s) => ({ id: optStr(s, "id"), status: optStr(s, "status"), currentPeriodEnd: optNum(s, "current_period_end", 0) })) });
  },
  "commerce.checkout.create": async (call, input) => {
    const successUrl = reqStr(input, "successUrl"); if (!successUrl.ok) return successUrl;
    const cancelUrl = reqStr(input, "cancelUrl"); if (!cancelUrl.ok) return cancelUrl;
    const priceId = reqStr(input, "priceId"); if (!priceId.ok) return priceId;
    const form: Record<string, string | number> = {
      mode: optStr(input, "mode", "payment"), success_url: successUrl.value, cancel_url: cancelUrl.value,
      "line_items[0][price]": priceId.value, "line_items[0][quantity]": optNum(input, "quantity", 1),
    };
    const r = await call({ method: "POST", path: "/v1/checkout/sessions", formBody: form });
    if (!r.ok) return r;
    return output({ checkoutSessionId: optStr(r.value, "id"), url: optStr(r.value, "url"), status: optStr(r.value, "status") });
  },
  "commerce.disputes.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/v1/disputes", query: { limit: optNum(input, "limit", 25) } });
    if (!r.ok) return r;
    return output({ disputes: arr(r.value["data"]).map((d) => ({ id: optStr(d, "id"), status: optStr(d, "status"), reason: optStr(d, "reason"), amount: optNum(d, "amount", 0), currency: optStr(d, "currency") })) });
  },
  "commerce.balance.read": async (call) => {
    const r = await call({ method: "GET", path: "/v1/balance" });
    if (!r.ok) return r;
    return output({ available: arr(r.value["available"]).map((a) => ({ amount: optNum(a, "amount", 0), currency: optStr(a, "currency") })), pending: arr(r.value["pending"]).map((a) => ({ amount: optNum(a, "amount", 0), currency: optStr(a, "currency") })) });
  },
  "commerce.events.read": async (call, input) => {
    const r = await call({ method: "GET", path: "/v1/events", query: { limit: optNum(input, "limit", 25), type: optStr(input, "type") || undefined } });
    if (!r.ok) return r;
    return output({ events: arr(r.value["data"]).map((e) => ({ id: optStr(e, "id"), type: optStr(e, "type"), created: optNum(e, "created", 0) })) });
  },
  "commerce.health": async (call) => {
    const r = await call({ method: "GET", path: "/v1/balance" });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "stripe" });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyStripeSignature(rawBody, signature, signingSecret);
  let externalId = "";
  try { externalId = optStr(obj(JSON.parse(rawBody)), "id"); } catch { externalId = ""; }
  return connectorOk({ valid, externalEventId: externalId.length > 0 ? externalId : "unknown" });
}

/** Map a self-describing Stripe `event.type` onto the canonical vocabulary. */
export function mapStripeEventType(t: string): CommerceEventType {
  switch (t) {
    case "payment_intent.succeeded": return COMMERCE_EVENTS.paymentCompleted;
    case "payment_intent.amount_capturable_updated": return COMMERCE_EVENTS.paymentAuthorized;
    case "payment_intent.payment_failed": return COMMERCE_EVENTS.paymentFailed;
    case "charge.refunded":
    case "refund.created": return COMMERCE_EVENTS.paymentRefunded;
    case "checkout.session.completed": return COMMERCE_EVENTS.checkoutCompleted;
    case "customer.created": return COMMERCE_EVENTS.customerCreated;
    case "customer.updated": return COMMERCE_EVENTS.customerUpdated;
    case "product.updated": return COMMERCE_EVENTS.productUpdated;
    case "invoice.paid": return COMMERCE_EVENTS.invoicePaid;
    case "customer.subscription.updated": return COMMERCE_EVENTS.subscriptionUpdated;
    case "customer.subscription.deleted": return COMMERCE_EVENTS.subscriptionCancelled;
    case "charge.dispute.created": return COMMERCE_EVENTS.disputeCreated;
    default: return COMMERCE_EVENTS.eventReceived;
  }
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = obj(JSON.parse(rawBody)); } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const id = optStr(body, "id");
  const type = optStr(body, "type");
  if (id.length === 0 || type.length === 0) return connectorOk([]);
  const objectId = scalarStr(obj(obj(body["data"])["object"])["id"]);
  const createdSecs = optNum(body, "created", 0);
  const occurredAt = createdSecs > 0 ? new Date(createdSecs * 1000).toISOString() : now();
  return connectorOk([commerceEvent({ type: mapStripeEventType(type), externalId: id, occurredAt, payload: { providerType: type, objectId } }, PROVENANCE)]);
}

/** Poll the Stripe events feed → canonical events. Cursor = newest event id (starting_after). */
async function poll(call: CommerceCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const r = await call({ method: "GET", path: "/v1/events", query: { limit, starting_after: cursor ?? undefined } });
  if (!r.ok) return r;
  const rows = arr(r.value["data"]);
  const events: CanonicalConnectorEvent[] = rows.map((e) => {
    const createdSecs = optNum(e, "created", 0);
    return commerceEvent({
      type: mapStripeEventType(optStr(e, "type")), externalId: optStr(e, "id"),
      occurredAt: createdSecs > 0 ? new Date(createdSecs * 1000).toISOString() : now(),
      payload: { providerType: optStr(e, "type") },
    }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const STRIPE_BINDING: CommerceProviderBinding = {
  connectorId: "stripe",
  bodyStyle: "form",
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/v1/balance",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};
