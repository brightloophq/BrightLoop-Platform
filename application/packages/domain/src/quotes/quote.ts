/* =============================================================================
 * Quote domain — pure logic behind the Sprint 5C quote engine.
 *
 * Money is in integer CENTS everywhere (matching invoices), so totals never drift
 * on floating point. Rendering to dollars is the UI's job.
 * ========================================================================== */

export interface QuoteItemInput {
  quantity: number;
  unitAmount: number; // cents
}

export interface QuoteTotals {
  subtotal: number; // cents
  total: number; // cents
}

export type QuoteCommercialMode = "legacy_client_quote" | "proposal_only";

/** A single line's amount, floored at zero. */
export function lineAmount(quantity: number, unitAmount: number): number {
  const q = Math.max(0, Math.trunc(quantity));
  const u = Math.max(0, Math.trunc(unitAmount));
  return q * u;
}

/**
 * Subtotal = sum of line amounts; total = subtotal − discount, never negative.
 * Discount is clamped to the subtotal so a quote can't total below zero.
 */
export function quoteTotals(items: readonly QuoteItemInput[], discount = 0): QuoteTotals {
  const subtotal = items.reduce((sum, it) => sum + lineAmount(it.quantity, it.unitAmount), 0);
  const clampedDiscount = Math.min(Math.max(0, Math.trunc(discount)), subtotal);
  return { subtotal, total: subtotal - clampedDiscount };
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
