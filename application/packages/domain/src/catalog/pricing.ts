/* =============================================================================
 * Catalog pricing logic — pure functions ported from onboarding-data.js.
 *
 * ESTIMATE, NOT A QUOTE (approved answer to "how do package estimates avoid
 * being treated as guaranteed final quotations?"):
 *   * every figure is a RANGE (low–high), never a single number;
 *   * `ESTIMATE_DISCLAIMER` travels with the numbers and the UI renders it
 *     wherever a range appears;
 *   * these values live on Configuration.estimateLow/High — deliberately
 *     separate from Proposal.subtotal/total, which are the binding figures.
 * ========================================================================== */

import { DISCIPLINE_ORDER, type ModuleContent, type ServiceModule } from "@brightloop/schema";

/**
 * The non-binding language that MUST accompany any rendered estimate.
 * Copy is placeholder-grade pending the product owner's wording.
 */
export const ESTIMATE_DISCLAIMER =
  "This is an estimate based on your selections, not a final quote. Your proposal will confirm exact pricing.";

/** Short form for tight spaces (cards, summary rails). */
export const ESTIMATE_LABEL = "Estimated range";

/**
 * Resolve a module's estimate range: the editorial range when supplied, else
 * derived from its "from" price. Mirrors `rangeFor` in onboarding-data.js.
 */
export function rangeFor(
  module: ServiceModule,
  content: ModuleContent | null,
): readonly [number, number] {
  if (content?.range) return content.range;
  return [module.from, Math.round(module.from * 1.9)];
}

/** Sum a set of ranges into a single range. */
export function sumRanges(
  ranges: readonly (readonly [number, number])[],
): readonly [number, number] {
  return ranges.reduce<readonly [number, number]>(
    ([lo, hi], [rlo, rhi]) => [lo + rlo, hi + rhi],
    [0, 0],
  );
}

/** Order modules Brand → Build → Automate → Grow, then by ascending price. */
export function orderModules(modules: readonly ServiceModule[]): ServiceModule[] {
  return [...modules].sort(
    (a, b) => DISCIPLINE_ORDER[a.stage] - DISCIPLINE_ORDER[b.stage] || a.from - b.from,
  );
}

/** Format whole USD. Single-currency (USD) for MVP per approved Decision I. */
export function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

/**
 * Format an estimate range. Always renders as a range — never collapses to a
 * single figure, even when low === high, so it cannot read as a fixed quote.
 */
export function formatRange([lo, hi]: readonly [number, number]): string {
  return `${formatMoney(lo)}–${formatMoney(hi)}`;
}

/** "From $X" — the entry point figure for a module card. */
export function formatFrom(value: number): string {
  return `From ${formatMoney(value)}`;
}

/** Longest realistic window across modules, in weeks. */
export function weeksMaxFor(modules: readonly ServiceModule[]): number {
  return modules.reduce((sum, m) => sum + m.weeks[1], 0);
}
