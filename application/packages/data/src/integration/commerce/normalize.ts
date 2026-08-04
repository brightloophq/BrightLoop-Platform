/* =============================================================================
 * Commerce connectors — canonical Auxion commerce event vocabulary (F4.4). PURE.
 *
 * Provider event/webhook shapes (Shopify topics, Stripe `event.type`, PayPal
 * `event_type`) are translated into THESE normalized types inside the adapters and
 * NEVER leak outward. Every commerce connector emits the same vocabulary, so the
 * Execution Runtime / Copilot / Audit see one provider-neutral event model.
 * ========================================================================== */

import type { CanonicalConnectorEvent } from "@brightloop/domain";

/** The canonical, provider-neutral commerce event types. */
export const COMMERCE_EVENTS = {
  orderCreated: "commerce.order.created",
  orderUpdated: "commerce.order.updated",
  orderPaid: "commerce.order.paid",
  orderFulfilled: "commerce.order.fulfilled",
  orderCancelled: "commerce.order.cancelled",
  paymentAuthorized: "commerce.payment.authorized",
  paymentCaptured: "commerce.payment.captured",
  paymentCompleted: "commerce.payment.completed",
  paymentFailed: "commerce.payment.failed",
  paymentRefunded: "commerce.payment.refunded",
  customerCreated: "commerce.customer.created",
  customerUpdated: "commerce.customer.updated",
  productUpdated: "commerce.product.updated",
  subscriptionUpdated: "commerce.subscription.updated",
  subscriptionCancelled: "commerce.subscription.cancelled",
  invoicePaid: "commerce.invoice.paid",
  checkoutCompleted: "commerce.checkout.completed",
  disputeCreated: "commerce.dispute.created",
  /** A recognized provider event with no more specific canonical mapping. */
  eventReceived: "commerce.event.received",
} as const;

export type CommerceEventType = (typeof COMMERCE_EVENTS)[keyof typeof COMMERCE_EVENTS];

export interface NormalizedCommerceEvent {
  type: CommerceEventType;
  externalId: string;
  occurredAt: string;
  /** Bounded, provider-neutral payload — never raw provider body or secrets. */
  payload: Record<string, unknown>;
}

/** Build a canonical connector event from a normalized commerce event. */
export function commerceEvent(e: NormalizedCommerceEvent, provenance: string): CanonicalConnectorEvent {
  return { type: e.type, externalId: e.externalId, occurredAt: e.occurredAt, payload: e.payload, provenance };
}
