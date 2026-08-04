/* =============================================================================
 * Finance connectors — canonical Auxion finance event vocabulary (F4.6). PURE.
 *
 * Provider event/webhook shapes (QuickBooks `eventNotifications[].dataChangeEvent`,
 * Xero `events[]` with eventCategory + eventType) are translated into THESE normalized
 * types inside the adapters and NEVER leak outward. Every finance connector emits the
 * same vocabulary, so the Execution Runtime / Copilot / Audit see one provider-neutral
 * finance event model.
 * ========================================================================== */

import type { CanonicalConnectorEvent } from "@brightloop/domain";

/** The canonical, provider-neutral finance event types. */
export const FINANCE_EVENTS = {
  invoiceCreated: "finance.invoice.created",
  invoiceUpdated: "finance.invoice.updated",
  invoicePaid: "finance.invoice.paid",
  invoiceVoided: "finance.invoice.voided",
  paymentCreated: "finance.payment.created",
  paymentUpdated: "finance.payment.updated",
  customerCreated: "finance.customer.created",
  customerUpdated: "finance.customer.updated",
  expenseCreated: "finance.expense.created",
  itemUpdated: "finance.item.updated",
  /** A recognized provider event with no more specific canonical mapping. */
  eventReceived: "finance.event.received",
} as const;

export type FinanceEventType = (typeof FINANCE_EVENTS)[keyof typeof FINANCE_EVENTS];

export interface NormalizedFinanceEvent {
  type: FinanceEventType;
  externalId: string;
  occurredAt: string;
  /** Bounded, provider-neutral payload — never raw provider body or secrets. */
  payload: Record<string, unknown>;
}

/** Build a canonical connector event from a normalized finance event. */
export function financeEvent(e: NormalizedFinanceEvent, provenance: string): CanonicalConnectorEvent {
  return { type: e.type, externalId: e.externalId, occurredAt: e.occurredAt, payload: e.payload, provenance };
}

/** Map a normalized entity kind + action onto a canonical finance event type. */
export function eventTypeFor(
  entity: "invoice" | "payment" | "customer" | "expense" | "item",
  action: "created" | "updated" | "deleted" | "paid" | "voided",
): FinanceEventType {
  if (entity === "invoice") {
    if (action === "paid") return FINANCE_EVENTS.invoicePaid;
    if (action === "voided" || action === "deleted") return FINANCE_EVENTS.invoiceVoided;
    return action === "created" ? FINANCE_EVENTS.invoiceCreated : FINANCE_EVENTS.invoiceUpdated;
  }
  if (entity === "payment") return action === "created" ? FINANCE_EVENTS.paymentCreated : FINANCE_EVENTS.paymentUpdated;
  if (entity === "customer") return action === "created" ? FINANCE_EVENTS.customerCreated : FINANCE_EVENTS.customerUpdated;
  if (entity === "expense") return FINANCE_EVENTS.expenseCreated;
  if (entity === "item") return FINANCE_EVENTS.itemUpdated;
  return FINANCE_EVENTS.eventReceived;
}
