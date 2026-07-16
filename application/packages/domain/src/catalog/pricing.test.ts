import { describe, it, expect } from "vitest";
import type { ModuleContent, ServiceModule } from "@brightloop/schema";
import {
  rangeFor,
  sumRanges,
  orderModules,
  formatMoney,
  formatRange,
  formatFrom,
  weeksMaxFor,
  ESTIMATE_DISCLAIMER,
} from "./pricing.js";

function mod(over: Partial<ServiceModule> = {}): ServiceModule {
  return {
    id: "m",
    stage: "Brand",
    name: "M",
    from: 1000,
    weeks: [1, 2],
    assets: [],
    includes: [],
    why: "",
    deps: [],
    growth: "",
    ...over,
  };
}

function content(range: readonly [number, number]): ModuleContent {
  return {
    outcome: "",
    promise: "",
    range: range as [number, number],
    deliverables: [],
    impact: { value: "", results: "", complexity: "", future: "", next: "" },
    resp: { bl: [], you: [] },
    upgrades: [],
  };
}

describe("rangeFor()", () => {
  it("prefers the editorial range when supplied", () => {
    expect(rangeFor(mod({ from: 1800 }), content([1800, 3600]))).toEqual([1800, 3600]);
  });

  it("derives a range from the 'from' price when no content exists", () => {
    expect(rangeFor(mod({ from: 1000 }), null)).toEqual([1000, 1900]);
  });

  it("never produces a single collapsed figure", () => {
    const [lo, hi] = rangeFor(mod({ from: 500 }), null);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("sumRanges()", () => {
  it("sums lows and highs independently", () => {
    expect(
      sumRanges([
        [100, 200],
        [50, 75],
      ]),
    ).toEqual([150, 275]);
  });

  it("returns a zero range for no modules", () => {
    expect(sumRanges([])).toEqual([0, 0]);
  });
});

describe("orderModules()", () => {
  it("orders Brand → Build → Automate → Grow, then by price", () => {
    const list = [
      mod({ id: "grow", stage: "Grow", from: 500 }),
      mod({ id: "build-expensive", stage: "Build", from: 3500 }),
      mod({ id: "brand", stage: "Brand", from: 1800 }),
      mod({ id: "build-cheap", stage: "Build", from: 1200 }),
      mod({ id: "automate", stage: "Automate", from: 1500 }),
    ];
    expect(orderModules(list).map((m) => m.id)).toEqual([
      "brand",
      "build-cheap",
      "build-expensive",
      "automate",
      "grow",
    ]);
  });

  it("does not mutate the input", () => {
    const list = [mod({ id: "b", stage: "Grow" }), mod({ id: "a", stage: "Brand" })];
    orderModules(list);
    expect(list[0]?.id).toBe("b");
  });
});

describe("money + range formatting", () => {
  it("formats whole USD with thousands separators", () => {
    expect(formatMoney(1800)).toBe("$1,800");
    expect(formatMoney(25000)).toBe("$25,000");
  });

  it("always renders a range, never a single quote-like figure", () => {
    expect(formatRange([1800, 3600])).toBe("$1,800–$3,600");
    // Even when low === high it stays a range.
    expect(formatRange([1000, 1000])).toBe("$1,000–$1,000");
  });

  it("prefixes 'From' for entry-point pricing", () => {
    expect(formatFrom(1800)).toBe("From $1,800");
  });

  it("ships a non-binding disclaimer that names it an estimate, not a quote", () => {
    expect(ESTIMATE_DISCLAIMER).toMatch(/estimate/i);
    expect(ESTIMATE_DISCLAIMER).toMatch(/not a final quote/i);
  });
});

describe("weeksMaxFor()", () => {
  it("sums each module's upper week bound", () => {
    expect(weeksMaxFor([mod({ weeks: [2, 3] }), mod({ weeks: [3, 5] })])).toBe(8);
  });

  it("is zero for no modules", () => {
    expect(weeksMaxFor([])).toBe(0);
  });
});
