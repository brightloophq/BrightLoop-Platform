import { describe, it, expect } from "vitest";
import {
  lineAmount,
  quoteTotals,
  isQuoteVisibleToClient,
  clientCanActOnQuote,
} from "./quote.js";

describe("quote totals", () => {
  it("multiplies quantity by unit amount, flooring negatives at zero", () => {
    expect(lineAmount(3, 1000)).toBe(3000);
    expect(lineAmount(-2, 1000)).toBe(0);
    expect(lineAmount(2, -5)).toBe(0);
    expect(lineAmount(1.9, 1000)).toBe(1000); // truncates
  });

  it("sums a subtotal and subtracts a clamped discount", () => {
    const items = [
      { quantity: 2, unitAmount: 150000 }, // 300000
      { quantity: 1, unitAmount: 80000 }, //   80000
    ];
    expect(quoteTotals(items)).toEqual({ subtotal: 380000, total: 380000 });
    expect(quoteTotals(items, 50000)).toEqual({ subtotal: 380000, total: 330000 });
  });

  it("never lets a discount push the total below zero", () => {
    const items = [{ quantity: 1, unitAmount: 10000 }];
    expect(quoteTotals(items, 99999)).toEqual({ subtotal: 10000, total: 0 });
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

  it("lets the client act only while sent or viewed", () => {
    expect(clientCanActOnQuote("sent")).toBe(true);
    expect(clientCanActOnQuote("viewed")).toBe(true);
    expect(clientCanActOnQuote("accepted")).toBe(false);
    expect(clientCanActOnQuote("draft")).toBe(false);
  });
});
