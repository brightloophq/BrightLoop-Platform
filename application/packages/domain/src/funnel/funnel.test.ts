import { describe, it, expect } from "vitest";
import type { ModuleContent, ServiceModule } from "@brightloop/schema";
import {
  scoreDimensions,
  healthScore,
  isAssessmentComplete,
  healthBand,
  type AssessmentQuestion,
} from "./assessment.js";
import {
  statusFor,
  assetPresence,
  defaultChoice,
  contribution,
  resolveSelection,
  recommendPlan,
} from "./configurator.js";

const QUESTIONS: AssessmentQuestion[] = [
  { id: "brand", dim: "Brand", q: "", options: [{ label: "", score: 20 }, { label: "", score: 90 }] },
  { id: "web", dim: "Build", q: "", options: [{ label: "", score: 15 }, { label: "", score: 90 }] },
  { id: "leads", dim: "Grow", q: "", options: [{ label: "", score: 20 }, { label: "", score: 90 }] },
  { id: "data", dim: "Grow", q: "", options: [{ label: "", score: 20 }, { label: "", score: 90 }] },
];

describe("assessment scoring", () => {
  it("averages answers into a health score (never a constant)", () => {
    expect(healthScore(QUESTIONS, { brand: 90, web: 90, leads: 90, data: 90 })).toBe(90);
    expect(healthScore(QUESTIONS, { brand: 20, web: 15, leads: 20, data: 20 })).toBeCloseTo(19, 0);
  });

  it("returns null when nothing is answered — not 0", () => {
    expect(healthScore(QUESTIONS, {})).toBeNull();
    expect(healthBand(null)).toBe("Not yet assessed");
  });

  it("averages per dimension, weighting Grow by its two questions", () => {
    const s = scoreDimensions(QUESTIONS, { brand: 90, web: 90, leads: 20, data: 40 });
    expect(s.Brand).toBe(90);
    expect(s.Build).toBe(90);
    expect(s.Grow).toBe(30); // (20+40)/2
    expect(s.Automate).toBe(0); // unanswered dimension → 0, not NaN
  });

  it("gates continue on all questions answered", () => {
    expect(isAssessmentComplete(QUESTIONS, { brand: 20, web: 15, leads: 20 })).toBe(false);
    expect(isAssessmentComplete(QUESTIONS, { brand: 20, web: 15, leads: 20, data: 20 })).toBe(true);
  });

  it("bands the score qualitatively", () => {
    expect(healthBand(80)).toBe("Strong");
    expect(healthBand(60)).toBe("Developing");
    expect(healthBand(35)).toBe("At risk");
    expect(healthBand(10)).toBe("Needs urgent attention");
  });
});

/* ---- configurator ---------------------------------------------------------- */

function mod(over: Partial<ServiceModule> = {}): ServiceModule {
  return { id: "m", stage: "Brand", name: "M", from: 1000, weeks: [1, 2], assets: ["logo"], includes: [], why: "", deps: [], growth: "", ...over };
}
const content = (range: [number, number]): ModuleContent => ({
  outcome: "", promise: "", range, deliverables: [], impact: { value: "", results: "", complexity: "", future: "", next: "" }, resp: { bl: [], you: [] }, upgrades: [],
});

describe("Keep / Improve / Replace / Create", () => {
  it("maps choice + inventory to a resolved status", () => {
    expect(statusFor("have", "have")).toBe("Keep");
    expect(statusFor("need", "none")).toBe("Create");
    expect(statusFor("upgrade", "have")).toBe("Improve");
    expect(statusFor("upgrade", "weak")).toBe("Replace");
    expect(statusFor("upgrade", "none")).toBe("Create"); // nothing to upgrade
  });

  it("reads asset presence from inventory", () => {
    const m = mod({ assets: ["logo", "colors"] });
    expect(assetPresence(m, { logo: "have", colors: "have" })).toBe("have");
    expect(assetPresence(m, { logo: "have", colors: "none" })).toBe("weak");
    expect(assetPresence(m, { logo: "none", colors: "none" })).toBe("none");
  });

  it("defaults the choice from what's owned", () => {
    const m = mod({ assets: ["logo"] });
    expect(defaultChoice(m, { logo: "have" })).toBe("have");
    expect(defaultChoice(m, { logo: "weak" })).toBe("upgrade");
    expect(defaultChoice(m, {})).toBe("need");
  });

  it("contribution: Keep is free, Create is full range", () => {
    const m = mod({ from: 1000 });
    const c = content([1000, 2000]);
    expect(contribution(m, c, "Keep")).toEqual([0, 0]);
    expect(contribution(m, c, "Create")).toEqual([1000, 2000]);
    expect(contribution(m, c, "Improve")).toEqual([450, 1200]);
    expect(contribution(m, c, "Replace")).toEqual([700, 1700]);
  });
});

describe("resolveSelection — indicative estimate, de-duped", () => {
  const modules = [
    mod({ id: "brand", stage: "Brand", from: 1800, assets: ["logo"] }),
    mod({ id: "web", stage: "Build", from: 3500, assets: ["website"] }),
  ];
  const contentFor = (id: string) => (id === "brand" ? content([1800, 3600]) : content([3500, 7500]));

  it("excludes owned modules from the estimate and counts them as saved", () => {
    const r = resolveSelection(modules, contentFor, {
      moduleIds: ["brand", "web"],
      inventory: { logo: "have" }, // brand is owned
    });
    // brand → Keep (0), web → Create (full)
    expect(r.low).toBe(3500);
    expect(r.high).toBe(7500);
    expect(r.savedLow).toBe(1800);
    expect(r.active.map((x) => x.module.id)).toEqual(["web"]);
    expect(r.kept.map((x) => x.module.id)).toEqual(["brand"]);
  });

  it("orders Brand before Build", () => {
    const r = resolveSelection(modules, contentFor, { moduleIds: ["web", "brand"] });
    expect(r.rows.map((x) => x.module.id)).toEqual(["brand", "web"]);
  });

  it("always yields a range, never a single figure", () => {
    const r = resolveSelection(modules, contentFor, { moduleIds: ["brand"] });
    expect(r.high).toBeGreaterThanOrEqual(r.low);
  });
});

describe("recommendPlan — rule-based (no LLM)", () => {
  it("recommends by goal and average score", () => {
    expect(recommendPlan({ a: 20 }, "launch")).toBe("foundation");
    expect(recommendPlan({ a: 20 }, "leads")).toBe("foundation"); // avg<40
    expect(recommendPlan({ a: 80 }, "scale")).toBe("partner");
    expect(recommendPlan({ a: 80 }, "leads")).toBe("partner"); // avg>=72
    expect(recommendPlan({ a: 55 }, "automate")).toBe("launch");
    expect(recommendPlan({ a: 65 }, "leads")).toBe("transform");
  });

  it("handles empty scores without dividing by zero", () => {
    expect(recommendPlan({}, "leads")).toBe("foundation"); // avg 0 < 40
  });
});
