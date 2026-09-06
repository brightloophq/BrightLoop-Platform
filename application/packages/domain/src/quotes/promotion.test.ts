import { describe, expect, it } from "vitest";
import { scannerPackagePromotionKey } from "./promotion.js";

describe("scanner package promotion", () => {
  it("derives a deterministic coordinate-only promotion key", () => {
    expect(scannerPackagePromotionKey("run_1", "prop_2", "evt_3")).toBe("promo:run_1:prop_2:evt_3");
    expect(scannerPackagePromotionKey("run_1", "prop_2", "evt_3")).toBe(scannerPackagePromotionKey("run_1", "prop_2", "evt_3"));
  });
});
