/* =============================================================================
 * Quote domain — pure logic behind the Sprint 5C quote engine.
 *
 * Money is in integer CENTS everywhere (matching invoices), so totals never drift
 * on floating point. Rendering to dollars is the UI's job.
 * ========================================================================== */

export type QuotePricingType = "one_time" | "recurring";
export type QuoteRecurrenceCadence = "weekly" | "monthly" | "quarterly" | "annual";

export interface CommercialQuoteItemInput {
  quantity: number;
  unitAmount: number | null;
  pricingType: QuotePricingType;
  recurrenceCadence: QuoteRecurrenceCadence | null;
  optional: boolean;
}

export interface CommercialQuoteSummary {
  subtotal: number;
  discount: number;
  total: number;
  recurringTotal: number;
  recurringCadence: QuoteRecurrenceCadence | null;
  optionalOneTimeTotal: number;
  optionalRecurringTotal: number;
  complete: boolean;
}

export type QuoteCommercialMode = "legacy_client_quote" | "proposal_only";

/** A single line's amount, floored at zero. */
export function lineAmount(quantity: number, unitAmount: number): number {
  const q = Math.max(0, Math.trunc(quantity));
  const u = Math.max(0, Math.trunc(unitAmount));
  return q * u;
}

/** Canonical quote-owned pricing aggregates. Unpriced items contribute zero. */
export function commercialQuoteSummary(
  items: readonly CommercialQuoteItemInput[],
  discount = 0,
): CommercialQuoteSummary {
  const pricedAmount = (item: CommercialQuoteItemInput) =>
    item.unitAmount === null ? 0 : lineAmount(item.quantity, item.unitAmount);
  const sum = (pricingType: QuotePricingType, optional: boolean) => items
    .filter((item) => item.pricingType === pricingType && item.optional === optional)
    .reduce((total, item) => total + pricedAmount(item), 0);

  const subtotal = sum("one_time", false);
  const clampedDiscount = Math.min(Math.max(0, Math.trunc(discount)), subtotal);
  const cadences = new Set(items
    .filter((item) => item.pricingType === "recurring")
    .map((item) => item.recurrenceCadence));
  if (cadences.size > 1 || cadences.has(null)) {
    throw new Error("Recurring quote items must share one cadence");
  }

  return {
    subtotal,
    discount: clampedDiscount,
    total: subtotal - clampedDiscount,
    recurringTotal: sum("recurring", false),
    recurringCadence: (cadences.values().next().value as QuoteRecurrenceCadence | undefined) ?? null,
    optionalOneTimeTotal: sum("one_time", true),
    optionalRecurringTotal: sum("recurring", true),
    complete: items.length > 0 && items.every((item) => item.optional || item.unitAmount !== null),
  };
}

/**
 * The DRAFT-QUOTE GATE, expressed in the domain so the app and the DB agree.
 * A client may see a quote only once it has been sent; `draft` and
 * `internal_review` are Auxion-only. This mirrors the `quotes_read` RLS
 * policy — the database is the enforcement, this is the shared definition.
 */
export const CLIENT_HIDDEN_QUOTE_STATES = ["draft", "internal_review"] as const;

export function isQuoteVisibleToClient(status: string, mode: QuoteCommercialMode = "legacy_client_quote"): boolean {
  return mode === "legacy_client_quote" && !(CLIENT_HIDDEN_QUOTE_STATES as readonly string[]).includes(status);
}

/** Quote states in which the CLIENT can still act (accept/reject/revise). */
export const CLIENT_ACTIONABLE_QUOTE_STATES = ["sent", "viewed"] as const;

export function clientCanActOnQuote(status: string, mode: QuoteCommercialMode = "legacy_client_quote"): boolean {
  return mode === "legacy_client_quote" && (CLIENT_ACTIONABLE_QUOTE_STATES as readonly string[]).includes(status);
}
