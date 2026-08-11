/* =============================================================================
 * Commercial proposal PRICING — pure, deterministic, integer-only.
 *
 * Admin-entered pricing is authoritative; nothing here invents a price. These are
 * the money rules the mutation and the views both derive from, kept pure so they
 * are exhaustively testable without a repository:
 *   • totals are computed in INTEGER MINOR UNITS (cents) — never floating point;
 *   • a proposal is "priced" only when every REQUIRED (non-optional) recommended
 *     work item has a valid price line; optional lines never block completeness.
 * ========================================================================== */

import type {
  CommercialPricingState,
  ProposalItemPricing,
  ProposalPricing,
} from "@brightloop/schema";

/** A recommended-work item carries a stable `sourceId`; that is all pricing needs. */
export interface PricableWorkItem {
  sourceId: string;
}

/** Derived money totals — all INTEGER minor units. */
export interface ProposalPricingTotals {
  subtotalOneTimeMinor: number;
  discountMinor: number;
  totalOneTimeMinor: number;
  totalRecurringMonthlyMinor: number;
}

/** A single price line is usable when its amount is set and, if recurring, it
 * declares a cadence. (amount >= 0 is enforced by the schema.) */
export function isPriceLineComplete(line: ProposalItemPricing): boolean {
  if (line.pricingType === "recurring") return line.cadence !== null;
  return true; // one_time
}

/**
 * Compute the one-time subtotal/total and the monthly recurring total from a set
 * of price lines and a flat one-time discount. Pure integer arithmetic:
 *   subtotalOneTime = Σ (one_time amount × quantity)
 *   totalOneTime    = max(0, subtotalOneTime − discount)   // discount never goes negative
 *   totalRecurring  = Σ (recurring monthly amount × quantity)
 */
export function computeProposalPricingTotals(
  lines: readonly ProposalItemPricing[],
  discountMinor = 0,
): ProposalPricingTotals {
  let subtotalOneTimeMinor = 0;
  let totalRecurringMonthlyMinor = 0;
  for (const line of lines) {
    const lineTotal = line.amountMinor * line.quantity; // both integers → integer
    if (line.pricingType === "recurring") {
      if (line.cadence === "monthly") totalRecurringMonthlyMinor += lineTotal;
    } else {
      subtotalOneTimeMinor += lineTotal;
    }
  }
  const discount = Math.max(0, Math.trunc(discountMinor));
  const totalOneTimeMinor = Math.max(0, subtotalOneTimeMinor - discount);
  return { subtotalOneTimeMinor, discountMinor: discount, totalOneTimeMinor, totalRecurringMonthlyMinor };
}

export interface PricingCompleteness {
  /** True once every required work item has a complete price line. */
  complete: boolean;
  /** The commercial state this maps to on the proposal. */
  state: CommercialPricingState;
  /** sourceIds of required work items still missing a usable price line. */
  unpricedRequired: string[];
  /** How many required items are priced, out of how many required. */
  pricedRequired: number;
  requiredCount: number;
}

/**
 * A proposal is `priced` only when EVERY required (non-optional) recommended-work
 * item has a complete price line. Optional lines are ignored for completeness.
 * A work item is "optional" when its matching price line says so; an item with no
 * price line at all is treated as required-and-unpriced.
 */
export function computePricingCompleteness(
  work: readonly PricableWorkItem[],
  pricing: ProposalPricing | null,
): PricingCompleteness {
  const lineBySource = new Map<string, ProposalItemPricing>();
  for (const line of pricing?.items ?? []) lineBySource.set(line.sourceId, line);

  const unpricedRequired: string[] = [];
  let requiredCount = 0;
  for (const item of work) {
    const line = lineBySource.get(item.sourceId);
    const optional = line?.optional === true;
    if (optional) continue; // optional lines never block completeness
    requiredCount += 1;
    if (line === undefined || !isPriceLineComplete(line)) unpricedRequired.push(item.sourceId);
  }
  // With no work items there is nothing to price → not "priced" (there is no
  // authoritative commercial offer yet); needs_pricing is the honest state.
  const complete = pricing !== null && requiredCount > 0 && unpricedRequired.length === 0;
  return {
    complete,
    state: complete ? "priced" : "needs_pricing",
    unpricedRequired,
    pricedRequired: requiredCount - unpricedRequired.length,
    requiredCount,
  };
}
