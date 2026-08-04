import { describe, it, expect } from "vitest";
import { matchesQuery, passesFilters, explorerView, connectionPath, healthTone, riskTone } from "./logic";
import { EMPTY_FILTERS, type ExplorerData, type ExplorerNode } from "./types";

const node = (over: Partial<ExplorerNode> = {}): ExplorerNode => ({
  key: "web",
  code: "WEB",
  label: "Digital",
  status: "operating",
  health: 82,
  completion: 90,
  automation: 70,
  aiConfidence: 0.8,
  risk: "low",
  owner: "Amara Chen",
  activeSignals: 2,
  recommendations: 1,
  lastUpdated: "2026-08-01T00:00:00.000Z",
  connections: ["crm"],
  summary: "s",
  businessImpact: "b",
  signals: [],
  recs: [],
  activity: [],
  metrics: [],
  history: [],
  nextActions: [],
  ai: { summarize: "", explain: "", recommend: "", predict: "", risk: "", nextAction: "" },
  ...over,
});

describe("matchesQuery", () => {
  it("matches label/code/owner/status/risk, case-insensitive; empty matches all", () => {
    const n = node({ owner: "Priya Nair", risk: "high", status: "assembling" });
    expect(matchesQuery(n, "")).toBe(true);
    expect(matchesQuery(n, "digital")).toBe(true);
    expect(matchesQuery(n, "WEB")).toBe(true);
    expect(matchesQuery(n, "priya")).toBe(true);
    expect(matchesQuery(n, "high")).toBe(true);
    expect(matchesQuery(n, "assembling")).toBe(true);
    expect(matchesQuery(n, "nope")).toBe(false);
  });
});

describe("passesFilters", () => {
  it("respects minHealth / risk floor / status / minAutomation", () => {
    const n = node({ health: 60, risk: "medium", status: "assembling", automation: 40 });
    expect(passesFilters(n, EMPTY_FILTERS)).toBe(true);
    expect(passesFilters(n, { ...EMPTY_FILTERS, minHealth: 55 })).toBe(true);
    expect(passesFilters(n, { ...EMPTY_FILTERS, minHealth: 75 })).toBe(false);
    expect(passesFilters(n, { ...EMPTY_FILTERS, risk: "medium" })).toBe(true);
    expect(passesFilters(n, { ...EMPTY_FILTERS, risk: "high" })).toBe(false); // node risk below floor
    expect(passesFilters(n, { ...EMPTY_FILTERS, status: "operating" })).toBe(false);
    expect(passesFilters(n, { ...EMPTY_FILTERS, minAutomation: 50 })).toBe(false);
  });
  it("treats null health as 0 for the health floor", () => {
    expect(passesFilters(node({ health: null }), { ...EMPTY_FILTERS, minHealth: 1 })).toBe(false);
  });
});

describe("explorerView", () => {
  const data: ExplorerData = {
    nodes: [node({ key: "web", health: 82, risk: "low" }), node({ key: "ai", code: "AI", label: "AI Layer", health: 40, risk: "high", owner: "Devon Reyes" })],
    connections: [],
    index: { value: 70, target: 92, pct: 0.76 },
    scopeLabel: "Portfolio",
  };
  it("marks visibility by filters and match by query", () => {
    const v = explorerView(data, { ...EMPTY_FILTERS, minHealth: 60 }, "ai");
    expect(v.searching).toBe(true);
    expect(v.states["web"]!.visible).toBe(true);
    expect(v.states["ai"]!.visible).toBe(false); // health 40 < 60
    expect(v.states["ai"]!.matched).toBe(true); // query "ai" matches
    expect(v.states["web"]!.matched).toBe(false);
    expect(v.visibleCount).toBe(1);
    expect(v.matchedCount).toBe(1);
  });
  it("no query → not searching, all matched", () => {
    const v = explorerView(data, EMPTY_FILTERS, "");
    expect(v.searching).toBe(false);
    expect(v.visibleCount).toBe(2);
  });
});

describe("connectionPath", () => {
  it("is a quadratic path from a to b", () => {
    const d = connectionPath({ x: 10, y: 10 }, { x: 90, y: 90 });
    expect(d.startsWith("M10,10")).toBe(true);
    expect(d).toContain("Q");
    expect(d.trim().endsWith("90,90")).toBe(true);
  });
});

describe("tones", () => {
  it("healthTone bands", () => {
    expect(healthTone(80)).toBe("positive");
    expect(healthTone(60)).toBe("caution");
    expect(healthTone(40)).toBe("critical");
    expect(healthTone(null)).toBe("neutral");
  });
  it("riskTone maps", () => {
    expect(riskTone("low")).toBe("positive");
    expect(riskTone("high")).toBe("caution");
    expect(riskTone("critical")).toBe("critical");
  });
});
