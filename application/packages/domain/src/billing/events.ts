/* =============================================================================
 * Billing event taxonomy (F5). Emitted (as DomainEvents via EventSink) on every
 * material commercial lifecycle change, so audit/analytics reflect real state.
 *
 * Naming: billing.object.action. No PII, no money, no provider ids in names/props.
 * ========================================================================== */

import type { DomainEvent, EventSink } from "../events.js";

export const BILLING_EVENTS = [
  "billing.subscription.created",
  "billing.subscription.status_changed",
  "billing.subscription.plan_changed",
  "billing.subscription.canceled",
  "billing.subscription.reactivated",
  "billing.invoice.issued",
  "billing.invoice.status_changed",
  "billing.invoice.paid",
  "billing.invoice.payment_failed",
  "billing.usage.recorded",
  "billing.payment_method.changed",
  "billing.notification.sent",
] as const;

export type BillingEventName = (typeof BILLING_EVENTS)[number];

/** Build a server-side DomainEvent with the standard shape. */
export function billingEvent(
  name: BillingEventName,
  args: {
    actorId: string | null;
    clientId: string | null;
    at: string;
    props?: Record<string, string | number | boolean | null>;
  },
): DomainEvent {
  return {
    name,
    payload: args.props ?? {},
    actorId: args.actorId,
    clientId: args.clientId,
    at: args.at,
    source: "server",
  };
}

/** Emit a billing event through the sink (best-effort; never throws into the caller). */
export async function emitBilling(
  events: EventSink,
  name: BillingEventName,
  args: {
    actorId: string | null;
    clientId: string | null;
    at: string;
    props?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await events.emit(billingEvent(name, args));
}
