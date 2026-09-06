import { describe, it, expect } from "vitest";
import {
  lineAmount,
  isQuoteVisibleToClient,
  clientCanActOnQuote,
  commercialQuoteSummary,
} from "./quote.js";

describe("quote totals", () => {
  it("multiplies quantity by unit amount, flooring negatives at zero", () => {
    expect(lineAmount(3, 1000)).toBe(3000);
    expect(lineAmount(-2, 1000)).toBe(0);
    expect(lineAmount(2, -5)).toBe(0);
    expect(lineAmount(1.9, 1000)).toBe(1000); // truncates
  });

});

describe("canonical commercial quote pricing", () => {
  it("keeps unpriced, deliberately free, committed and optional money distinct", () => {
    expect(commercialQuoteSummary([
      { quantity: 2, unitAmount: 1000, pricingType: "one_time", recurrenceCadence: null, optional: false },
      { quantity: 1, unitAmount: 0, pricingType: "one_time", recurrenceCadence: null, optional: false },
      { quantity: 3, unitAmount: 500, pricingType: "recurring", recurrenceCadence: "monthly", optional: false },
      { quantity: 1, unitAmount: 250, pricingType: "one_time", recurrenceCadence: null, optional: true },
      { quantity: 2, unitAmount: 300, pricingType: "recurring", recurrenceCadence: "monthly", optional: true },
      { quantity: 1, unitAmount: null, pricingType: "one_time", recurrenceCadence: null, optional: true },
    ], 3000)).toEqual({
      subtotal: 2000,
      discount: 2000,
      total: 0,
      recurringTotal: 1500,
      recurringCadence: "monthly",
      optionalOneTimeTotal: 250,
      optionalRecurringTotal: 600,
      complete: true,
    });
  });

  it("treats a required unpriced item or an empty quote as incomplete", () => {
    expect(commercialQuoteSummary([]).complete).toBe(false);
    expect(commercialQuoteSummary([
      { quantity: 1, unitAmount: null, pricingType: "one_time", recurrenceCadence: null, optional: false },
    ]).complete).toBe(false);
  });

  it("distinguishes a deliberately free required item from an unpriced one", () => {
    expect(commercialQuoteSummary([
      { quantity: 1, unitAmount: 0, pricingType: "one_time", recurrenceCadence: null, optional: false },
    ])).toMatchObject({ subtotal: 0, total: 0, complete: true });
    expect(commercialQuoteSummary([
      { quantity: 1, unitAmount: null, pricingType: "one_time", recurrenceCadence: null, optional: false },
    ])).toMatchObject({ subtotal: 0, total: 0, complete: false });
  });

  it("rejects mixed or missing recurring cadences", () => {
    expect(() => commercialQuoteSummary([
      { quantity: 1, unitAmount: 1, pricingType: "recurring", recurrenceCadence: "monthly", optional: false },
      { quantity: 1, unitAmount: 1, pricingType: "recurring", recurrenceCadence: "annual", optional: false },
    ])).toThrow("share one cadence");
    expect(() => commercialQuoteSummary([
      { quantity: 1, unitAmount: 1, pricingType: "recurring", recurrenceCadence: null, optional: false },
    ])).toThrow("share one cadence");
  });
});

describe("draft-quote gate (domain mirror of RLS)", () => {
  it("hides draft and internal_review from the client", () => {
    expect(isQuoteVisibleToClient("draft")).toBe(false);
    expect(isQuoteVisibleToClient("internal_review")).toBe(false);
  });

  it("shows every sent-or-later state to the client", () => {
    for (const s of ["sent", "viewed", "revision_requested", "revised", "accepted", "rejected", "expired", "converted"]) {
      expect(isQuoteVisibleToClient(s)).toBe(true);
    }
  });

  it("never exposes proposal-only commercial working state", () => {
    expect(isQuoteVisibleToClient("sent", "proposal_only")).toBe(false);
    expect(isQuoteVisibleToClient("accepted", "proposal_only")).toBe(false);
    expect(clientCanActOnQuote("sent", "proposal_only")).toBe(false);
  });

  it("lets the client act only while sent or viewed", () => {
    expect(clientCanActOnQuote("sent")).toBe(true);
    expect(clientCanActOnQuote("viewed")).toBe(true);
    expect(clientCanActOnQuote("accepted")).toBe(false);
    expect(clientCanActOnQuote("draft")).toBe(false);
  });
});
