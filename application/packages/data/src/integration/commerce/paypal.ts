/* =============================================================================
 * PayPal provider binding (F4.4). OAuth2 CLIENT-CREDENTIALS: the resolved secret is
 * the client secret and `config.clientId` the (non-secret) client id; `authorize`
 * exchanges them for a short-lived bearer token via `/v1/oauth2/token` (Basic auth),
 * then attaches `Authorization: Bearer …`. The base host is environment-driven
 * (sandbox|live). Maps the NORMALIZED commerce.* operations onto the PayPal v1/v2
 * REST APIs. Webhook events are self-describing (`event_type`); signature
 * verification is STRUCTURAL (PayPal's cryptographic verification is an online API
 * call the synchronous port cannot make — see the F4.4 known limitations).
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type VerifiedWebhook,
} from "@brightloop/domain";
import { callRaw, type AuthContext, type CommerceCall, type CommerceConfig, type CommerceProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, obj, optStr, output, reqStr, scalarStr, type OpInput } from "./helpers.js";
import { COMMERCE_EVENTS, commerceEvent, type CommerceEventType } from "./normalize.js";

const PROVENANCE = "paypal:webhook";

function hostFor(config: OpInput): string {
  return optStr(config, "environment", "sandbox") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** PayPal client-credentials: exchange (clientId, clientSecret) for a bearer token. */
async function authorize(cfg: CommerceConfig, secret: string | null, config: OpInput): Promise<ConnectorResult<AuthContext>> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no client secret", "no_token");
  const clientId = optStr(config, "clientId");
  if (clientId.length === 0) return connectorErr("config_invalid", "clientId is not configured", "no_client_id");
  const baseUrl = hostFor(config);
  const basic = Buffer.from(`${clientId}:${secret}`, "utf8").toString("base64");
  const res = await callRaw(cfg, PAYPAL_BINDING, `${baseUrl}/v1/oauth2/token`, {
    method: "POST", headers: { authorization: `Basic ${basic}` }, formBody: { grant_type: "client_credentials" },
  });
  if (!res.ok) return res;
  const accessToken = optStr(res.value, "access_token");
  if (accessToken.length === 0) return connectorErr("authentication", "token endpoint returned no access token", "no_access_token");
  return connectorOk({ baseUrl, headers: { authorization: `Bearer ${accessToken}` } });
}

function orderView(o: Record<string, unknown>): Record<string, unknown> {
  return { id: optStr(o, "id"), status: optStr(o, "status"), intent: optStr(o, "intent") };
}

const OPS: Record<string, (call: CommerceCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "commerce.store.read": async (call) => {
    const r = await call({ method: "GET", path: "/v1/identity/oauth2/userinfo", query: { schema: "paypalv1.1" } });
    if (!r.ok) return r;
    return output({ payerId: optStr(r.value, "payer_id"), name: optStr(r.value, "name"), verifiedAccount: optStr(r.value, "verified_account") });
  },
  "commerce.orders.read": async (call, input) => {
    const id = reqStr(input, "orderId"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/v2/checkout/orders/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ order: orderView(r.value) });
  },
  "commerce.orders.write": async (call, input) => {
    const purchaseUnits = Array.isArray(input["purchaseUnits"]) ? (input["purchaseUnits"] as unknown[]) : [];
    if (purchaseUnits.length === 0) return connectorErr("validation", "'purchaseUnits' is required", "missing_field");
    const r = await call({ method: "POST", path: "/v2/checkout/orders", jsonBody: { intent: optStr(input, "intent", "CAPTURE"), purchase_units: purchaseUnits } });
    if (!r.ok) return r;
    return output({ order: orderView(r.value) });
  },
  "commerce.payments.authorize": async (call, input) => {
    const id = reqStr(input, "orderId"); if (!id.ok) return id;
    const r = await call({ method: "POST", path: `/v2/checkout/orders/${encodeURIComponent(id.value)}/authorize`, jsonBody: {} });
    if (!r.ok) return r;
    return output({ order: orderView(r.value) });
  },
  "commerce.payments.capture": async (call, input) => {
    const id = reqStr(input, "orderId"); if (!id.ok) return id;
    const r = await call({ method: "POST", path: `/v2/checkout/orders/${encodeURIComponent(id.value)}/capture`, jsonBody: {} });
    if (!r.ok) return r;
    return output({ order: orderView(r.value) });
  },
  "commerce.payments.read": async (call, input) => {
    const captureId = reqStr(input, "captureId"); if (!captureId.ok) return captureId;
    const r = await call({ method: "GET", path: `/v2/payments/captures/${encodeURIComponent(captureId.value)}` });
    if (!r.ok) return r;
    const amt = obj(r.value["amount"]);
    return output({ captureId: optStr(r.value, "id"), status: optStr(r.value, "status"), value: optStr(amt, "value"), currency: optStr(amt, "currency_code") });
  },
  "commerce.payments.refund": async (call, input) => {
    const captureId = reqStr(input, "captureId"); if (!captureId.ok) return captureId;
    const amount = obj(input["amount"]);
    const body = Object.keys(amount).length > 0 ? { amount: { value: optStr(amount, "value"), currency_code: optStr(amount, "currency") } } : {};
    const r = await call({ method: "POST", path: `/v2/payments/captures/${encodeURIComponent(captureId.value)}/refund`, jsonBody: body });
    if (!r.ok) return r;
    return output({ refundId: optStr(r.value, "id"), status: optStr(r.value, "status") });
  },
  "commerce.transactions.read": async (call, input) => {
    const startDate = reqStr(input, "startDate"); if (!startDate.ok) return startDate;
    const endDate = reqStr(input, "endDate"); if (!endDate.ok) return endDate;
    const r = await call({ method: "GET", path: "/v1/reporting/transactions", query: { start_date: startDate.value, end_date: endDate.value } });
    if (!r.ok) return r;
    return output({ transactions: arr(r.value["transaction_details"]).map((t) => {
      const info = obj(t["transaction_info"]);
      const amt = obj(info["transaction_amount"]);
      return { transactionId: optStr(info, "transaction_id"), status: optStr(info, "transaction_status"), value: optStr(amt, "value"), currency: optStr(amt, "currency_code") };
    }) });
  },
  "commerce.health": async () => {
    // Reaching this handler means `authorize` (the token exchange) already succeeded.
    return output({ healthy: true, provider: "paypal" });
  },
};

/* ---- webhook verification (structural) + translation --------------------- */

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  // Structural verification only: PayPal's cryptographic verification requires its
  // online verify-webhook-signature endpoint, which the synchronous port cannot call.
  // Require a configured webhook id (signingSecret) and a present transmission signature.
  const configured = signingSecret !== null && signingSecret.length > 0;
  const present = signature !== null && signature.length > 0;
  let externalId = "";
  try { externalId = optStr(obj(JSON.parse(rawBody)), "id"); } catch { externalId = ""; }
  return connectorOk({ valid: configured && present, externalEventId: externalId.length > 0 ? externalId : "unknown" });
}

/** Map a self-describing PayPal `event_type` onto the canonical vocabulary. */
export function mapPaypalEventType(t: string): CommerceEventType {
  switch (t) {
    case "PAYMENT.CAPTURE.COMPLETED": return COMMERCE_EVENTS.paymentCompleted;
    case "PAYMENT.CAPTURE.REFUNDED": return COMMERCE_EVENTS.paymentRefunded;
    case "PAYMENT.CAPTURE.DENIED": return COMMERCE_EVENTS.paymentFailed;
    case "PAYMENT.AUTHORIZATION.CREATED": return COMMERCE_EVENTS.paymentAuthorized;
    case "CHECKOUT.ORDER.APPROVED": return COMMERCE_EVENTS.orderUpdated;
    case "CHECKOUT.ORDER.COMPLETED": return COMMERCE_EVENTS.orderPaid;
    case "BILLING.SUBSCRIPTION.CANCELLED": return COMMERCE_EVENTS.subscriptionCancelled;
    case "CUSTOMER.DISPUTE.CREATED": return COMMERCE_EVENTS.disputeCreated;
    default: return COMMERCE_EVENTS.eventReceived;
  }
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = obj(JSON.parse(rawBody)); } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const id = optStr(body, "id");
  const type = optStr(body, "event_type");
  if (id.length === 0 || type.length === 0) return connectorOk([]);
  const resourceId = scalarStr(obj(body["resource"])["id"]);
  return connectorOk([commerceEvent({ type: mapPaypalEventType(type), externalId: id, occurredAt: optStr(body, "create_time") || now(), payload: { providerType: type, resourceId } }, PROVENANCE)]);
}

export const PAYPAL_BINDING: CommerceProviderBinding = {
  connectorId: "paypal",
  bodyStyle: "json",
  classify: (status) => classifyHttpStatus(status),
  authorize,
  probePath: "", // a successful token exchange (authorize) already proves connectivity
  ops: OPS,
  webhook: { verify, translate },
};
