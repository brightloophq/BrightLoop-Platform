import { describe, it, expect } from "vitest";
import type { ProposalItemPricing } from "@brightloop/schema";
import { computeProposalPricingTotals, computePricingCompleteness } from "./pricing.js";

const line = (over: Partial<ProposalItemPricing> & Pick<ProposalItemPricing, "sourceId">): ProposalItemPricing => ({
  pricingType: "one_time",
  amountMinor: 0,
  cadence: null,
  quantity: 1,
  optional: false,
  adminNotes: "",
  ...over,
});

const pricing = (items: ProposalItemPricing[], discountMinor = 0): NonNullable<Parameters<typeof computePricingCompleteness>[1]> => ({
  currency: "USD",
  items,
  discountMinor,
  subtotalOneTimeMinor: 0,
  totalOneTimeMinor: 0,
  totalRecurringMonthlyMinor: 0,
  validUntil: null,
  commercialNotes: "",
  pricedBy: "usr_admin",
  pricedAt: "2026-08-11T00:00:00.000Z",
});

describe("computeProposalPricingTotals — integer minor units, no floating point", () => {
  it("sums one-time and monthly separately, applies quantity, floors discount at zero", () => {
    const t = computeProposalPricingTotals(
      [
        line({ sourceId: "a", pricingType: "one_time", amountMinor: 120000 }), // $1,200.00
        line({ sourceId: "b", pricingType: "one_time", amountMinor: 35000 }), // $350.00
        line({ sourceId: "c", pricingType: "recurring", cadence: "monthly", amountMinor: 30000 }), // $300/mo
        line({ sourceId: "d", pricingType: "recurring", cadence: "monthly", amountMinor: 15000, quantity: 2 }), // $150×2/mo
      ],
      20000, // $200 discount
    );
    expect(t.subtotalOneTimeMinor).toBe(155000);
    expect(t.discountMinor).toBe(20000);
    expect(t.totalOneTimeMinor).toBe(135000);
    expect(t.totalRecurringMonthlyMinor).toBe(60000);
    // Every total is an exact integer — no 0.1+0.2 drift.
    for (const v of Object.values(t)) expect(Number.isInteger(v)).toBe(true);
  });

  it("a discount larger than the subtotal floors the one-time total at zero (never negative)", () => {
    const t = computeProposalPricingTotals([line({ sourceId: "a", amountMinor: 5000 })], 999999);
    expect(t.totalOneTimeMinor).toBe(0);
  });

  it("uses cents so amounts that are lossy as floats stay exact", () => {
    // $0.10 + $0.20 = $0.30 exactly in minor units (10 + 20 = 30), unlike 0.1+0.2 in float.
    const t = computeProposalPricingTotals([line({ sourceId: "a", amountMinor: 10 }), line({ sourceId: "b", amountMinor: 20 })]);
    expect(t.subtotalOneTimeMinor).toBe(30);
  });
});

describe("computePricingCompleteness — required items gate 'priced'", () => {
  const work = [{ sourceId: "a" }, { sourceId: "b" }];

  it("no pricing at all → needs_pricing, both required unpriced", () => {
    const c = computePricingCompleteness(work, null);
    expect(c.state).toBe("needs_pricing");
    expect(c.complete).toBe(false);
    expect(c.unpricedRequired).toEqual(["a", "b"]);
  });

  it("partial pricing (one required item) → still needs_pricing", () => {
    const c = computePricingCompleteness(work, pricing([line({ sourceId: "a", amountMinor: 1000 })]));
    expect(c.state).toBe("needs_pricing");
    expect(c.unpricedRequired).toEqual(["b"]);
    expect(c.pricedRequired).toBe(1);
    expect(c.requiredCount).toBe(2);
  });

  it("all required items priced → priced", () => {
    const c = computePricingCompleteness(
      work,
      pricing([line({ sourceId: "a", amountMinor: 1000 }), line({ sourceId: "b", amountMinor: 2000 })]),
    );
    expect(c.state).toBe("priced");
    expect(c.complete).toBe(true);
    expect(c.unpricedRequired).toEqual([]);
  });

  it("an optional item does NOT block completeness", () => {
    const c = computePricingCompleteness(
      work,
      pricing([line({ sourceId: "a", amountMinor: 1000 }), line({ sourceId: "b", optional: true })]),
    );
    expect(c.state).toBe("priced");
    expect(c.requiredCount).toBe(1); // b is optional, excluded
  });

  it("a recurring line with no cadence is incomplete → still needs_pricing", () => {
    const c = computePricingCompleteness(
      [{ sourceId: "a" }],
      pricing([line({ sourceId: "a", pricingType: "recurring", cadence: null, amountMinor: 5000 })]),
    );
    expect(c.complete).toBe(false);
    expect(c.unpricedRequired).toEqual(["a"]);
  });

  it("no work items at all → needs_pricing (there is no authoritative offer yet)", () => {
    expect(computePricingCompleteness([], pricing([])).state).toBe("needs_pricing");
  });
});
