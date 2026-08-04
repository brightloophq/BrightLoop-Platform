/* =============================================================================
 * Billing — deterministic idempotency keys (F5).
 *
 * Every engine write derives its key as a PURE function of natural identity, so
 * a crash-and-retry recomputes the same key and the repository replays. No
 * dedupe table, no lock — deduplication is structural (mirrors the runtime).
 * ========================================================================== */

const join = (...parts: readonly (string | number)[]): string => parts.map((p) => String(p)).join(":");

/** One invoice per subscription per billing period. */
export const invoiceKey = (subscriptionId: string, periodStartAt: string): string =>
  join("invoice", subscriptionId, periodStartAt);

/** A usage event's natural identity — meter + subscription + occurrence + source. */
export const usageKey = (
  subscriptionId: string,
  meter: string,
  occurredAt: string,
  source: string,
  ordinal: string | number = 0,
): string => join("usage", subscriptionId, meter, occurredAt, source, ordinal);

/** A billing-history / audit / notification event's key (engine writes only). */
export const billingEventKey = (
  subscriptionId: string,
  type: string,
  discriminator: string | number,
): string => join("billing_event", subscriptionId, type, discriminator);

/** A charge attempt against an invoice. */
export const chargeKey = (invoiceId: string, attempt: number): string =>
  join("charge", invoiceId, attempt);

/** A dunning notification's key — deduped per subscription/kind/period. */
export const notificationKey = (subscriptionId: string, kind: string, discriminator: string | number): string =>
  join("notify", subscriptionId, kind, discriminator);
