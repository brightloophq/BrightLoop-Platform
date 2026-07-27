/* =============================================================================
 * AI Reporting & Business Intelligence (Phase E · Sprint E6) — schema contracts.
 *
 * The intelligence layer: it OBSERVES the structured outputs of every previous
 * bounded context (Phase D + E1–E5) through their application services and
 * produces decision-ready reporting. It NEVER executes workflows, regenerates
 * strategy, creates execution plans, schedules external jobs, sends anything, or
 * modifies upstream data. Additive; a new `reporting` bounded context.
 *
 *   Observation → Metric → Trend → KPI → Forecast → Insight → Narrative → Report
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

export const reportStatusSchema = z.enum(["draft", "generating", "generated", "published", "failed", "archived"]);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

/** The report types this platform produces. */
export const reportKindSchema = z.enum([
  "executive_summary", "operational", "automation", "strategy_progress", "execution_progress",
  "kpi_dashboard", "risk", "workspace_health", "weekly_summary", "monthly_summary",
]);
export type ReportKind = z.infer<typeof reportKindSchema>;

/** Where an observation was collected from (provenance). */
export const observationSourceSchema = z.enum(["strategy", "execution", "automation", "knowledge", "ai_usage", "workspace_activity", "operational"]);
export type ObservationSource = z.infer<typeof observationSourceSchema>;

export const businessMetricCategorySchema = z.enum(["delivery", "automation", "quality", "cost", "usage", "health"]);
export type BusinessMetricCategory = z.infer<typeof businessMetricCategorySchema>;

/** Trend classification. */
export const trendDirectionSchema = z.enum(["growth", "decline", "stability", "seasonality", "volatility"]);
export type TrendDirection = z.infer<typeof trendDirectionSchema>;

export const kpiResultStatusSchema = z.enum(["on_track", "at_risk", "off_track", "achieved"]);
export type KpiResultStatus = z.infer<typeof kpiResultStatusSchema>;

export const forecastKindSchema = z.enum(["expected_completion", "automation_adoption", "capacity", "delivery_confidence", "risk_trajectory"]);
export type ForecastKind = z.infer<typeof forecastKindSchema>;

export const businessInsightSeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type BusinessInsightSeverity = z.infer<typeof businessInsightSeveritySchema>;

export const reportFrequencySchema = z.enum(["daily", "weekly", "monthly", "quarterly"]);
export type ReportFrequency = z.infer<typeof reportFrequencySchema>;

export const reportFeedbackKindSchema = z.enum(["approval", "comment", "rejection"]);
export type ReportFeedbackKind = z.infer<typeof reportFeedbackKindSchema>;

/* ---- executive report (versioned root) ------------------------------------- */

export const executiveReportSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: reportKindSchema,
  title: z.string().min(1).max(300),
  /** The reporting period label, e.g. "2026-W30" or "2026-07". */
  period: z.string().default(""),
  status: reportStatusSchema.default("draft"),
  requestedByUserId: z.string(),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  promptId: z.string().nullable().default(null),
  collectionDurationMs: z.number().int().min(0).default(0),
  analysisDurationMs: z.number().int().min(0).default(0),
  aiDurationMs: z.number().int().min(0).default(0),
  generationDurationMs: z.number().int().min(0).default(0),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  reportSize: z.number().int().min(0).default(0),
  metricCount: z.number().int().min(0).default(0),
  forecastCount: z.number().int().min(0).default(0),
  insightCount: z.number().int().min(0).default(0),
  confidence: z.number().int().min(0).max(100).default(0),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExecutiveReport = z.infer<typeof executiveReportSchema>;

/* ---- observation snapshot (append-only; preserves provenance) -------------- */

export const observationSnapshotSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  source: observationSourceSchema,
  label: z.string().default(""),
  /** Where this observation came from (upstream service + reference ids). */
  provenance: z.record(z.unknown()).default({}),
  /** The structured observed payload (counts, statuses, totals). Read-only copy. */
  data: z.record(z.unknown()).default({}),
  observedAt: z.string(),
  createdAt: z.string(),
});
export type ObservationSnapshot = z.infer<typeof observationSnapshotSchema>;

/* ---- business metric (append-only) ----------------------------------------- */

export const businessMetricSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  category: businessMetricCategorySchema,
  value: z.number(),
  unit: z.string().default(""),
  sampleSize: z.number().int().min(0).default(0),
  source: observationSourceSchema,
  createdAt: z.string(),
});
export type BusinessMetric = z.infer<typeof businessMetricSchema>;

/* ---- kpi result (append-only) ---------------------------------------------- */

export const kpiResultSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(200),
  baseline: z.number().default(0),
  current: z.number().default(0),
  target: z.number().default(0),
  variance: z.number().default(0),
  status: kpiResultStatusSchema,
  trend: trendDirectionSchema,
  owner: z.string().nullable().default(null),
  measurementFrequency: reportFrequencySchema.default("monthly"),
  createdAt: z.string(),
});
export type KpiResult = z.infer<typeof kpiResultSchema>;

/* ---- trend analysis (append-only) ------------------------------------------ */

export const trendAnalysisSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  metricKey: z.string(),
  direction: trendDirectionSchema,
  changePercent: z.number().default(0),
  significant: z.boolean().default(false),
  summary: z.string().default(""),
  periodCount: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type TrendAnalysis = z.infer<typeof trendAnalysisSchema>;

/* ---- forecast (append-only; always carries confidence) --------------------- */

export const forecastSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: forecastKindSchema,
  metricKey: z.string(),
  horizonDays: z.number().int().min(0).default(30),
  projectedValue: z.number(),
  confidence: z.number().int().min(0).max(100),
  basis: z.string().default(""),
  createdAt: z.string(),
});
export type Forecast = z.infer<typeof forecastSchema>;

/* ---- business insight (append-only; never fabricates evidence) ------------- */

export const businessInsightSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  summary: z.string().default(""),
  severity: businessInsightSeveritySchema,
  confidence: z.number().int().min(0).max(100),
  affectedMetrics: z.array(z.string()).default([]),
  /** Provenance references drawn from observations — never fabricated. */
  supportingEvidence: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type BusinessInsight = z.infer<typeof businessInsightSchema>;

/* ---- executive summary block (append-only, one per report) ----------------- */
/* Named `ReportExecutiveSummary` — `ExecutiveSummary` is taken by prospect-intel. */

export const reportExecutiveSummarySchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  headline: z.string().default(""),
  highlights: z.array(z.string()).default([]),
  keyMetrics: z.array(z.string()).default([]),
  overallConfidence: z.number().int().min(0).max(100).default(0),
  createdAt: z.string(),
});
export type ReportExecutiveSummary = z.infer<typeof reportExecutiveSummarySchema>;

/* ---- report section (append-only) ------------------------------------------ */

export const reportSectionSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  key: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  body: z.string().default(""),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type ReportSection = z.infer<typeof reportSectionSchema>;

/* ---- report narrative (append-only, one per report) ------------------------ */

export const reportNarrativeSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  content: z.string().default(""),
  /** True when produced via the E1 Prompt Engine (vs the deterministic fallback). */
  generatedByAi: z.boolean().default(false),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  createdAt: z.string(),
});
export type ReportNarrative = z.infer<typeof reportNarrativeSchema>;

/* ---- reporting schedule (config only; nothing runs it) --------------------- */

export const reportScheduleSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: reportKindSchema,
  frequency: reportFrequencySchema,
  enabled: z.boolean().default(true),
  /** Descriptive only — this layer never sends or dispatches anything. */
  recipientsNote: z.string().default(""),
  nextRunAt: z.string().nullable().default(null),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReportSchedule = z.infer<typeof reportScheduleSchema>;

/* ---- report feedback (append-only) ----------------------------------------- */

export const reportFeedbackSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: reportFeedbackKindSchema,
  rating: z.number().int().min(1).max(5).nullable().default(null),
  comment: z.string().nullable().default(null),
  subjectUserId: z.string(),
  createdAt: z.string(),
});
export type ReportFeedback = z.infer<typeof reportFeedbackSchema>;
