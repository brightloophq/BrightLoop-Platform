import { describe, expect, it } from "vitest";
import { quoteCommercialSaveSchema } from "./quote-commercial.js";

const base = {
  expectedUpdatedAt: "2026-09-06T00:00:00.000Z", title: "Scope", clientNote: "",
  currency: "USD", discount: 0, validUntil: null,
};

describe("quote commercial save schema", () => {
  it("accepts unpriced, free and recurring commercial items", () => {
    expect(quoteCommercialSaveSchema.safeParse({ ...base, items: [
      { label: "Unpriced", description: "", quantity: 1, unitAmount: null, pricingType: "one_time", recurrenceCadence: null, optional: false },
      { label: "Free", description: "", quantity: 1, unitAmount: 0, pricingType: "one_time", recurrenceCadence: null, optional: false },
      { label: "Retainer", description: "", quantity: 1, unitAmount: 100, pricingType: "recurring", recurrenceCadence: "monthly", optional: false },
    ] }).success).toBe(true);
  });

  it("rejects invalid quantity, money, currency and recurrence shapes", () => {
    const item = { label: "Item", description: "", quantity: 1, unitAmount: 1, pricingType: "one_time", recurrenceCadence: null, optional: false };
    expect(quoteCommercialSaveSchema.safeParse({ ...base, currency: "usd", items: [item] }).success).toBe(false);
    expect(quoteCommercialSaveSchema.safeParse({ ...base, items: [{ ...item, quantity: 0 }] }).success).toBe(false);
    expect(quoteCommercialSaveSchema.safeParse({ ...base, items: [{ ...item, unitAmount: -1 }] }).success).toBe(false);
    expect(quoteCommercialSaveSchema.safeParse({ ...base, items: [{ ...item, pricingType: "recurring" }] }).success).toBe(false);
  });
});
