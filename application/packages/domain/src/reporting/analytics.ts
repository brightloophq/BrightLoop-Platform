/* =============================================================================
 * Reporting analytics engines (Phase E · Sprint E6) — PURE.
 *
 * Metric / KPI / Trend / Forecast / Insight computation over a NORMALIZED
 * observation bundle the application assembles from upstream read services. Every
 * function is deterministic — no io, no clock, no randomness. Insights draw
 * evidence only from the observations provided; nothing is fabricated.
 * ========================================================================== */

import type {
  BusinessInsightSeverity, BusinessMetricCategory, ForecastKind, KpiResultStatus, ObservationSource, TrendDirection,
} from "@brightloop/schema";

/** The normalized, provenance-tagged observation bundle (application-assembled). */
export interface NormalizedObservations {
  // execution (Phase D + E4)
  initiativesTotal: number; initiativesCompleted: number;
  tasksTotal: number; tasksCompleted: number;
  reviewsTotal: number; reviewsApproved: number;
  milestonesTotal: number; milestonesReached: number;
  // automation (E5)
  intentsTotal: number; workflowsTotal: number; workflowsPublished: number; deploymentsTotal: number;
  // strategy (E3)
  strategiesTotal: number; recommendationsTotal: number; risksTotal: number;
  // knowledge (E2)
  documentsTotal: number; retrievalsTotal: number;
  // ai usage (E1)
  aiTokens: number; aiCost: number; aiCalls: number;
  // aggregate confidence signal (0-100)
  avgConfidence: number;
  // planned KPIs (from E4 approved plan)
  plannedKpis: readonly { name: string; baseline: number; current: number; target: number; owner?: string | null }[];
  /** Optional historical series per metric key (oldest → newest) for trend/forecast. */
  history?: Record<string, number[]>;
}

export interface MetricValue { key: string; name: string; category: BusinessMetricCategory; value: number; unit: string; sampleSize: number; source: ObservationSource }
export interface KpiComputed { name: string; baseline: number; current: number; target: number; variance: number; status: KpiResultStatus; trend: TrendDirection; owner: string | null }
export interface TrendComputed { metricKey: string; direction: TrendDirection; changePercent: number; significant: boolean; summary: string; periodCount: number }
export interface ForecastComputed { kind: ForecastKind; metricKey: string; projectedValue: number; confidence: number; basis: string }
export interface InsightComputed { title: string; summary: string; severity: BusinessInsightSeverity; confidence: number; affectedMetrics: string[]; supportingEvidence: string[]; recommendedActions: string[] }

const round = (n: number, dp = 2): number => { const f = 10 ** dp; return Math.round(n * f) / f; };
const rate = (num: number, den: number): number => (den <= 0 ? 0 : round(num / den, 4));

/* ---- metric engine --------------------------------------------------------- */

export function computeMetrics(o: NormalizedObservations): MetricValue[] {
  const m: MetricValue[] = [];
  const add = (key: string, name: string, category: BusinessMetricCategory, value: number, unit: string, sampleSize: number, source: ObservationSource) => m.push({ key, name, category, value, unit, sampleSize, source });

  add("completion_rate", "Completion rate", "delivery", rate(o.tasksCompleted, o.tasksTotal), "ratio", o.tasksTotal, "execution");
  add("initiative_completion", "Initiative completion", "delivery", rate(o.initiativesCompleted, o.initiativesTotal), "ratio", o.initiativesTotal, "execution");
  add("task_throughput", "Task throughput", "delivery", o.tasksCompleted, "count", o.tasksTotal, "execution");
  add("execution_velocity", "Execution velocity", "delivery", round(rate(o.tasksCompleted, o.tasksTotal) * 100, 1), "%", o.tasksTotal, "execution");
  add("milestone_reach_rate", "Milestone reach rate", "delivery", rate(o.milestonesReached, o.milestonesTotal), "ratio", o.milestonesTotal, "execution");
  add("approval_latency", "Approval backlog ratio", "quality", rate(o.reviewsTotal - o.reviewsApproved, o.reviewsTotal), "ratio", o.reviewsTotal, "execution");
  add("review_cadence", "Review cadence", "quality", rate(o.reviewsTotal, o.initiativesTotal), "per-initiative", o.initiativesTotal, "execution");
  add("success_rate", "Review success rate", "quality", rate(o.reviewsApproved, o.reviewsTotal), "ratio", o.reviewsTotal, "execution");
  add("automation_coverage", "Automation coverage", "automation", rate(o.workflowsPublished, o.initiativesTotal), "ratio", o.initiativesTotal, "automation");
  add("automation_utilization", "Automation utilization", "automation", rate(o.deploymentsTotal, o.workflowsTotal), "ratio", o.workflowsTotal, "automation");
  add("knowledge_utilization", "Knowledge utilization", "usage", rate(o.retrievalsTotal, o.documentsTotal), "per-document", o.documentsTotal, "knowledge");
  add("ai_cost", "AI cost", "cost", round(o.aiCost, 4), "USD", o.aiCalls, "ai_usage");
  add("ai_usage", "AI usage", "usage", o.aiTokens, "tokens", o.aiCalls, "ai_usage");
  add("confidence", "Aggregate confidence", "health", Math.round(o.avgConfidence), "score", o.strategiesTotal, "strategy");
  add("workspace_health", "Workspace health", "health", workspaceHealth(o), "score", o.initiativesTotal, "workspace_activity");
  return m;
}

/** A blended 0–100 workspace-health score from delivery, quality, and automation. */
export function workspaceHealth(o: NormalizedObservations): number {
  const completion = rate(o.tasksCompleted, o.tasksTotal);
  const success = rate(o.reviewsApproved, o.reviewsTotal);
  const automation = rate(o.workflowsPublished, Math.max(o.initiativesTotal, 1));
  const conf = Math.min(1, Math.max(0, o.avgConfidence / 100));
  return Math.round((completion * 0.35 + success * 0.25 + automation * 0.2 + conf * 0.2) * 100);
}

/* ---- kpi engine ------------------------------------------------------------ */

function kpiStatus(current: number, baseline: number, target: number): KpiResultStatus {
  if (target === baseline) return current >= target ? "achieved" : "at_risk";
  const progress = (current - baseline) / (target - baseline);
  if (progress >= 1) return "achieved";
  if (progress >= 0.9) return "on_track";
  if (progress >= 0.6) return "at_risk";
  return "off_track";
}

export function computeKpis(o: NormalizedObservations): KpiComputed[] {
  const out: KpiComputed[] = [];
  for (const k of o.plannedKpis) {
    const variance = round(k.current - k.target, 4);
    out.push({ name: k.name, baseline: k.baseline, current: k.current, target: k.target, variance, status: kpiStatus(k.current, k.baseline, k.target), trend: trendFromHistory(o.history?.[k.name]) , owner: k.owner ?? null });
  }
  // Always include a delivery KPI derived from observed completion.
  const completion = round(rate(o.tasksCompleted, o.tasksTotal) * 100, 1);
  out.push({ name: "Delivery completion", baseline: 0, current: completion, target: 100, variance: round(completion - 100, 1), status: kpiStatus(completion, 0, 100), trend: trendFromHistory(o.history?.["completion_rate"]), owner: null });
  return out;
}

/* ---- trend analysis -------------------------------------------------------- */

interface Fit { slope: number; intercept: number; r2: number; mean: number; cv: number }
function linearFit(series: readonly number[]): Fit {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: series[0] ?? 0, r2: 0, mean: series[0] ?? 0, cv: 0 };
  const xs = series.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { const dx = xs[i]! - meanX; const dy = series[i]! - meanY; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  const variance = series.reduce((a, b) => a + (b - meanY) ** 2, 0) / n;
  const cv = meanY === 0 ? 0 : Math.sqrt(variance) / Math.abs(meanY);
  return { slope, intercept, r2, mean: meanY, cv };
}

function classifyTrend(series: readonly number[], fit: Fit): TrendDirection {
  if (series.length < 2) return "stability";
  // Alternating-sign diffs across the series ⇒ oscillation (seasonality).
  const diffs = series.slice(1).map((v, i) => v - series[i]!);
  let sign = 0, flips = 0;
  for (const d of diffs) { const s = d > 0 ? 1 : d < 0 ? -1 : 0; if (s !== 0 && sign !== 0 && s !== sign) flips += 1; if (s !== 0) sign = s; }
  if (flips >= 2 && fit.cv > 0.15) return "seasonality";
  if (fit.cv > 0.5) return "volatility";
  const rel = fit.mean === 0 ? fit.slope : fit.slope / Math.abs(fit.mean);
  if (rel > 0.03) return "growth";
  if (rel < -0.03) return "decline";
  return "stability";
}

function trendFromHistory(series?: readonly number[]): TrendDirection {
  if (series === undefined || series.length < 2) return "stability";
  return classifyTrend(series, linearFit(series));
}

export function analyzeTrends(history: Record<string, readonly number[]>): TrendComputed[] {
  const out: TrendComputed[] = [];
  for (const [metricKey, series] of Object.entries(history)) {
    if (series.length < 2) continue;
    const fit = linearFit(series);
    const direction = classifyTrend(series, fit);
    const first = series[0]!; const last = series[series.length - 1]!;
    const changePercent = first === 0 ? (last === 0 ? 0 : 100) : round(((last - first) / Math.abs(first)) * 100, 1);
    const significant = Math.abs(changePercent) >= 10 || (direction === "volatility");
    out.push({ metricKey, direction, changePercent, significant, summary: `${metricKey} is ${direction} (${changePercent >= 0 ? "+" : ""}${changePercent}% over ${series.length} periods)`, periodCount: series.length });
  }
  return out;
}

/* ---- forecast engine ------------------------------------------------------- */

const FORECAST_KIND: Record<string, ForecastKind> = {
  completion_rate: "expected_completion", initiative_completion: "expected_completion",
  automation_coverage: "automation_adoption", automation_utilization: "automation_adoption",
  task_throughput: "capacity", execution_velocity: "delivery_confidence", success_rate: "delivery_confidence",
};

/** Project each historical series one horizon forward, with fit-based confidence. */
export function generateForecasts(history: Record<string, readonly number[]>, horizonDays = 30): ForecastComputed[] {
  const out: ForecastComputed[] = [];
  for (const [metricKey, series] of Object.entries(history)) {
    if (series.length < 2) continue;
    const fit = linearFit(series);
    const projectedValue = round(fit.intercept + fit.slope * series.length, 4);
    // Confidence blends fit quality (r²) with series length; capped, floored.
    const lengthFactor = Math.min(1, series.length / 6);
    const confidence = Math.max(20, Math.min(95, Math.round((fit.r2 * 0.7 + lengthFactor * 0.3) * 100)));
    out.push({ kind: FORECAST_KIND[metricKey] ?? "delivery_confidence", metricKey, projectedValue, confidence, basis: `Linear projection over ${series.length} periods (r²=${round(fit.r2, 2)}), horizon ${horizonDays}d` });
  }
  return out;
}

/* ---- insight engine (evidence only from observations) ---------------------- */

export interface InsightInput {
  metrics: readonly MetricValue[];
  kpis: readonly KpiComputed[];
  trends: readonly TrendComputed[];
  forecasts: readonly ForecastComputed[];
}

const metricVal = (metrics: readonly MetricValue[], key: string): number | undefined => metrics.find((m) => m.key === key)?.value;

export function generateInsights(input: InsightInput): InsightComputed[] {
  const out: InsightComputed[] = [];
  const push = (i: InsightComputed) => out.push(i);

  const completion = metricVal(input.metrics, "completion_rate");
  if (completion !== undefined && completion < 0.4) {
    push({ title: "Delivery completion is low", summary: `Task completion is ${Math.round(completion * 100)}%, below the 40% health threshold.`, severity: completion < 0.2 ? "high" : "medium", confidence: 80, affectedMetrics: ["completion_rate", "task_throughput"], supportingEvidence: ["metric:completion_rate"], recommendedActions: ["Rebalance workload across initiatives", "Escalate blocked tasks at the next review gate"] });
  }
  const coverage = metricVal(input.metrics, "automation_coverage");
  if (coverage !== undefined && coverage < 0.25) {
    push({ title: "Automation coverage is limited", summary: `Only ${Math.round(coverage * 100)}% of initiatives have a published workflow.`, severity: "medium", confidence: 70, affectedMetrics: ["automation_coverage", "automation_utilization"], supportingEvidence: ["metric:automation_coverage"], recommendedActions: ["Prioritise workflow builds for high-effort initiatives"] });
  }
  const health = metricVal(input.metrics, "workspace_health");
  if (health !== undefined && health < 50) {
    push({ title: "Workspace health needs attention", summary: `Blended workspace health is ${health}/100.`, severity: health < 30 ? "critical" : "high", confidence: 75, affectedMetrics: ["workspace_health"], supportingEvidence: ["metric:workspace_health"], recommendedActions: ["Review delivery, quality, and automation drivers"] });
  }
  const offTrack = input.kpis.filter((k) => k.status === "off_track");
  if (offTrack.length > 0) {
    push({ title: `${offTrack.length} KPI${offTrack.length > 1 ? "s" : ""} off track`, summary: `Off-track KPIs: ${offTrack.map((k) => k.name).join(", ")}.`, severity: "high", confidence: 85, affectedMetrics: [], supportingEvidence: offTrack.map((k) => `kpi:${k.name}`), recommendedActions: ["Assign owners and interim targets for off-track KPIs"] });
  }
  for (const t of input.trends) {
    if (!t.significant) continue;
    if (t.metricKey === "ai_cost" && t.direction === "growth") {
      push({ title: "AI cost is rising", summary: t.summary, severity: "medium", confidence: 70, affectedMetrics: ["ai_cost"], supportingEvidence: [`trend:${t.metricKey}`], recommendedActions: ["Review prompt sizes and provider selection"] });
    } else if (t.direction === "decline" && (t.metricKey === "completion_rate" || t.metricKey === "success_rate")) {
      push({ title: `${t.metricKey.replace(/_/g, " ")} is declining`, summary: t.summary, severity: "high", confidence: 78, affectedMetrics: [t.metricKey], supportingEvidence: [`trend:${t.metricKey}`], recommendedActions: ["Investigate the decline before the next reporting period"] });
    }
  }
  const riskForecast = input.forecasts.find((f) => f.kind === "risk_trajectory");
  if (riskForecast !== undefined && riskForecast.confidence >= 50) {
    push({ title: "Risk trajectory forecast available", summary: `Projected ${riskForecast.metricKey} = ${riskForecast.projectedValue} (${riskForecast.confidence}% confidence).`, severity: "info", confidence: riskForecast.confidence, affectedMetrics: [riskForecast.metricKey], supportingEvidence: [`forecast:${riskForecast.metricKey}`], recommendedActions: [] });
  }
  return out;
}

/** Overall report confidence: mean of metric sample coverage + insight confidence. */
export function reportConfidence(metrics: readonly MetricValue[], insights: readonly InsightComputed[]): number {
  const withSamples = metrics.filter((m) => m.sampleSize > 0).length;
  const coverage = metrics.length === 0 ? 0 : withSamples / metrics.length;
  const insightConf = insights.length === 0 ? 0.6 : insights.reduce((a, b) => a + b.confidence, 0) / insights.length / 100;
  return Math.round((coverage * 0.5 + insightConf * 0.5) * 100);
}
