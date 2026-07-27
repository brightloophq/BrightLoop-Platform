/* =============================================================================
 * Reporting domain tests (Phase E · Sprint E6) — pure units.
 *
 * Lifecycle transitions, the metric engine, KPI status, trend classification,
 * forecasts (with confidence), and evidence-grounded insight generation.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  analyzeTrends, canTransitionReport, computeKpis, computeMetrics, generateForecasts, generateInsights,
  reportConfidence, workspaceHealth, type NormalizedObservations,
} from "./index.js";

const base: NormalizedObservations = {
  initiativesTotal: 4, initiativesCompleted: 1,
  tasksTotal: 20, tasksCompleted: 12,
  reviewsTotal: 8, reviewsApproved: 6,
  milestonesTotal: 6, milestonesReached: 3,
  intentsTotal: 2, workflowsTotal: 3, workflowsPublished: 2, deploymentsTotal: 2,
  strategiesTotal: 1, recommendationsTotal: 5, risksTotal: 3,
  documentsTotal: 10, retrievalsTotal: 25,
  aiTokens: 42000, aiCost: 1.23, aiCalls: 30,
  avgConfidence: 72,
  plannedKpis: [{ name: "Adoption", baseline: 0, current: 40, target: 100 }],
  history: {},
};

describe("report lifecycle", () => {
  it("allows draft→generating→generated→published and blocks illegal jumps", () => {
    expect(canTransitionReport("draft", "generating")).toBe(true);
    expect(canTransitionReport("generating", "generated")).toBe(true);
    expect(canTransitionReport("generated", "published")).toBe(true);
    expect(canTransitionReport("draft", "published")).toBe(false);
    expect(canTransitionReport("archived", "generating")).toBe(false);
  });
});

describe("metric engine", () => {
  it("computes the full metric family with provenance sources", () => {
    const m = computeMetrics(base);
    const byKey = Object.fromEntries(m.map((x) => [x.key, x]));
    expect(byKey["completion_rate"]!.value).toBe(0.6);
    expect(byKey["automation_coverage"]!.value).toBe(0.5);
    expect(byKey["knowledge_utilization"]!.value).toBe(2.5);
    expect(byKey["ai_cost"]!.category).toBe("cost");
    expect(byKey["ai_cost"]!.source).toBe("ai_usage");
    expect(m.some((x) => x.key === "workspace_health")).toBe(true);
  });
  it("blends a 0–100 workspace health score", () => {
    const h = workspaceHealth(base);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThanOrEqual(100);
  });
});

describe("kpi engine", () => {
  it("derives variance + status from baseline/current/target", () => {
    const kpis = computeKpis(base);
    const adoption = kpis.find((k) => k.name === "Adoption")!;
    expect(adoption.variance).toBe(-60);
    expect(adoption.status).toBe("off_track");
    expect(kpis.some((k) => k.name === "Delivery completion")).toBe(true);
  });
});

describe("trend analysis + forecast", () => {
  it("classifies growth and declines and flags significance", () => {
    const trends = analyzeTrends({ completion_rate: [0.2, 0.3, 0.45, 0.6], success_rate: [0.9, 0.7, 0.5] });
    const comp = trends.find((t) => t.metricKey === "completion_rate")!;
    expect(comp.direction).toBe("growth");
    expect(comp.significant).toBe(true);
    const succ = trends.find((t) => t.metricKey === "success_rate")!;
    expect(succ.direction).toBe("decline");
  });
  it("classifies volatility", () => {
    const trends = analyzeTrends({ ai_cost: [1, 9, 1, 9, 1] });
    expect(["volatility", "seasonality"]).toContain(trends[0]!.direction);
  });
  it("forecasts every series with a bounded confidence", () => {
    const f = generateForecasts({ completion_rate: [0.2, 0.3, 0.45, 0.6] });
    expect(f).toHaveLength(1);
    expect(f[0]!.kind).toBe("expected_completion");
    expect(f[0]!.confidence).toBeGreaterThanOrEqual(20);
    expect(f[0]!.confidence).toBeLessThanOrEqual(95);
    expect(f[0]!.projectedValue).toBeGreaterThan(0.6);
  });
});

describe("insight engine", () => {
  it("raises grounded insights with evidence and no fabrication", () => {
    const weak: NormalizedObservations = { ...base, tasksCompleted: 3, tasksTotal: 20, workflowsPublished: 0, avgConfidence: 20 };
    const metrics = computeMetrics(weak);
    const kpis = computeKpis(weak);
    const insights = generateInsights({ metrics, kpis, trends: [], forecasts: [] });
    expect(insights.length).toBeGreaterThan(0);
    const low = insights.find((i) => i.title.includes("completion"));
    expect(low).toBeTruthy();
    expect(low!.supportingEvidence.length).toBeGreaterThan(0);
    // every affected metric an insight cites must exist among the computed metrics
    const keys = new Set(metrics.map((m) => m.key));
    for (const i of insights) for (const k of i.affectedMetrics) expect(keys.has(k)).toBe(true);
  });
  it("produces a bounded report confidence", () => {
    const metrics = computeMetrics(base);
    const c = reportConfidence(metrics, []);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(100);
  });
});
