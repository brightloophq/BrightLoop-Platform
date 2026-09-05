import { describe, expect, it } from "vitest";
import { scannerPackagePromotionKey, scannerWorkToQuoteItemSeeds } from "./promotion.js";

describe("scanner package promotion", () => {
  it("derives a deterministic coordinate-only promotion key", () => {
    expect(scannerPackagePromotionKey("run_1", "prop_2", "evt_3")).toBe("promo:run_1:prop_2:evt_3");
    expect(scannerPackagePromotionKey("run_1", "prop_2", "evt_3")).toBe(scannerPackagePromotionKey("run_1", "prop_2", "evt_3"));
  });

  it("maps recommended work into zero-priced editable quote-item seeds", () => {
    expect(scannerWorkToQuoteItemSeeds([
      { sourceId: "work:1", title: "Fix conversion", solution: "Simplify checkout", evidenceIds: ["ev:1", "ev:2"] },
      { sourceId: "work:2", title: "Improve search", solution: "Add structured discovery", evidenceIds: ["ev:3"] },
    ])).toEqual([
      { label: "Fix conversion", description: "Simplify checkout", sort: 0, sourceWorkItemId: "work:1", sourceEvidenceRefs: ["ev:1", "ev:2"], quantity: 1, unitAmount: 0, amount: 0, pricingType: "one_time", recurrenceCadence: null, optional: false, moduleId: null },
      { label: "Improve search", description: "Add structured discovery", sort: 1, sourceWorkItemId: "work:2", sourceEvidenceRefs: ["ev:3"], quantity: 1, unitAmount: 0, amount: 0, pricingType: "one_time", recurrenceCadence: null, optional: false, moduleId: null },
    ]);
  });

  it("copies evidence arrays instead of retaining mutable scanner references", () => {
    const evidenceIds = ["ev:1"];
    const [seed] = scannerWorkToQuoteItemSeeds([{ sourceId: "work:1", title: "Work", solution: "Solution", evidenceIds }]);
    evidenceIds.push("ev:2");
    expect(seed?.sourceEvidenceRefs).toEqual(["ev:1"]);
  });
});
