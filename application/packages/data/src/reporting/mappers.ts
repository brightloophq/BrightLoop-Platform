/* =============================================================================
 * AI Reporting — row ↔ domain mappers (Phase E · Sprint E6). Jsonb fields
 * (provenance, data, string arrays) collapse defensively. The type-safe boundary.
 * ========================================================================== */

import type {
  BusinessInsight, BusinessMetric, ExecutiveReport, Forecast, KpiResult, ObservationSnapshot, ReportExecutiveSummary,
  ReportFeedback, ReportNarrative, ReportSchedule, ReportSection, TrendAnalysis,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const nint = (v: unknown): number | null => (v === null || v === undefined ? null : int(v));
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function reportRow(r: ExecutiveReport): Record<string, unknown> {
  return { id: r.id, workspace_id: r.workspaceId, client_id: r.clientId, kind: r.kind, title: r.title, period: r.period, status: r.status, requested_by_user_id: r.requestedByUserId, provider: r.provider, model: r.model, prompt_id: r.promptId, collection_duration_ms: r.collectionDurationMs, analysis_duration_ms: r.analysisDurationMs, ai_duration_ms: r.aiDurationMs, generation_duration_ms: r.generationDurationMs, token_total: r.tokenTotal, cost: r.cost, currency: r.currency, report_size: r.reportSize, metric_count: r.metricCount, forecast_count: r.forecastCount, insight_count: r.insightCount, confidence: r.confidence, version: r.version, created_at: r.createdAt, updated_at: r.updatedAt };
}
export function toReport(r: Record<string, unknown>): ExecutiveReport {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as ExecutiveReport["kind"], title: String(r["title"]), period: String(r["period"] ?? ""), status: r["status"] as ExecutiveReport["status"], requestedByUserId: String(r["requested_by_user_id"]), provider: nstr(r["provider"]), model: nstr(r["model"]), promptId: nstr(r["prompt_id"]), collectionDurationMs: int(r["collection_duration_ms"]), analysisDurationMs: int(r["analysis_duration_ms"]), aiDurationMs: int(r["ai_duration_ms"]), generationDurationMs: int(r["generation_duration_ms"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), currency: String(r["currency"] ?? "USD"), reportSize: int(r["report_size"]), metricCount: int(r["metric_count"]), forecastCount: int(r["forecast_count"]), insightCount: int(r["insight_count"]), confidence: int(r["confidence"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function observationRow(o: ObservationSnapshot): Record<string, unknown> {
  return { id: o.id, report_id: o.reportId, workspace_id: o.workspaceId, client_id: o.clientId, source: o.source, label: o.label, provenance: o.provenance, data: o.data, observed_at: o.observedAt, created_at: o.createdAt };
}
export function toObservation(r: Record<string, unknown>): ObservationSnapshot {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), source: r["source"] as ObservationSnapshot["source"], label: String(r["label"] ?? ""), provenance: obj(r["provenance"]), data: obj(r["data"]), observedAt: String(r["observed_at"]), createdAt: String(r["created_at"]) };
}

export function metricRow(m: BusinessMetric): Record<string, unknown> {
  return { id: m.id, report_id: m.reportId, workspace_id: m.workspaceId, client_id: m.clientId, key: m.key, name: m.name, category: m.category, value: m.value, unit: m.unit, sample_size: m.sampleSize, source: m.source, created_at: m.createdAt };
}
export function toMetric(r: Record<string, unknown>): BusinessMetric {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), key: String(r["key"]), name: String(r["name"]), category: r["category"] as BusinessMetric["category"], value: num(r["value"]), unit: String(r["unit"] ?? ""), sampleSize: int(r["sample_size"]), source: r["source"] as BusinessMetric["source"], createdAt: String(r["created_at"]) };
}

export function kpiRow(k: KpiResult): Record<string, unknown> {
  return { id: k.id, report_id: k.reportId, workspace_id: k.workspaceId, client_id: k.clientId, name: k.name, baseline: k.baseline, current: k.current, target: k.target, variance: k.variance, status: k.status, trend: k.trend, owner: k.owner, measurement_frequency: k.measurementFrequency, created_at: k.createdAt };
}
export function toKpi(r: Record<string, unknown>): KpiResult {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), baseline: num(r["baseline"]), current: num(r["current"]), target: num(r["target"]), variance: num(r["variance"]), status: r["status"] as KpiResult["status"], trend: r["trend"] as KpiResult["trend"], owner: nstr(r["owner"]), measurementFrequency: r["measurement_frequency"] as KpiResult["measurementFrequency"], createdAt: String(r["created_at"]) };
}

export function trendRow(t: TrendAnalysis): Record<string, unknown> {
  return { id: t.id, report_id: t.reportId, workspace_id: t.workspaceId, client_id: t.clientId, metric_key: t.metricKey, direction: t.direction, change_percent: t.changePercent, significant: t.significant, summary: t.summary, period_count: t.periodCount, created_at: t.createdAt };
}
export function toTrend(r: Record<string, unknown>): TrendAnalysis {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), metricKey: String(r["metric_key"]), direction: r["direction"] as TrendAnalysis["direction"], changePercent: num(r["change_percent"]), significant: r["significant"] === true, summary: String(r["summary"] ?? ""), periodCount: int(r["period_count"]), createdAt: String(r["created_at"]) };
}

export function forecastRow(f: Forecast): Record<string, unknown> {
  return { id: f.id, report_id: f.reportId, workspace_id: f.workspaceId, client_id: f.clientId, kind: f.kind, metric_key: f.metricKey, horizon_days: f.horizonDays, projected_value: f.projectedValue, confidence: f.confidence, basis: f.basis, created_at: f.createdAt };
}
export function toForecast(r: Record<string, unknown>): Forecast {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as Forecast["kind"], metricKey: String(r["metric_key"]), horizonDays: int(r["horizon_days"], 30), projectedValue: num(r["projected_value"]), confidence: int(r["confidence"]), basis: String(r["basis"] ?? ""), createdAt: String(r["created_at"]) };
}

export function insightRow(i: BusinessInsight): Record<string, unknown> {
  return { id: i.id, report_id: i.reportId, workspace_id: i.workspaceId, client_id: i.clientId, title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence, affected_metrics: i.affectedMetrics, supporting_evidence: i.supportingEvidence, recommended_actions: i.recommendedActions, created_at: i.createdAt };
}
export function toInsight(r: Record<string, unknown>): BusinessInsight {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), summary: String(r["summary"] ?? ""), severity: r["severity"] as BusinessInsight["severity"], confidence: int(r["confidence"]), affectedMetrics: strArr(r["affected_metrics"]), supportingEvidence: strArr(r["supporting_evidence"]), recommendedActions: strArr(r["recommended_actions"]), createdAt: String(r["created_at"]) };
}

export function summaryRow(s: ReportExecutiveSummary): Record<string, unknown> {
  return { id: s.id, report_id: s.reportId, workspace_id: s.workspaceId, client_id: s.clientId, headline: s.headline, highlights: s.highlights, key_metrics: s.keyMetrics, overall_confidence: s.overallConfidence, created_at: s.createdAt };
}
export function toSummary(r: Record<string, unknown>): ReportExecutiveSummary {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), headline: String(r["headline"] ?? ""), highlights: strArr(r["highlights"]), keyMetrics: strArr(r["key_metrics"]), overallConfidence: int(r["overall_confidence"]), createdAt: String(r["created_at"]) };
}

export function sectionRow(s: ReportSection): Record<string, unknown> {
  return { id: s.id, report_id: s.reportId, workspace_id: s.workspaceId, client_id: s.clientId, key: s.key, title: s.title, body: s.body, order_index: s.order, created_at: s.createdAt };
}
export function toSection(r: Record<string, unknown>): ReportSection {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), key: String(r["key"]), title: String(r["title"]), body: String(r["body"] ?? ""), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function narrativeRow(n: ReportNarrative): Record<string, unknown> {
  return { id: n.id, report_id: n.reportId, workspace_id: n.workspaceId, client_id: n.clientId, content: n.content, generated_by_ai: n.generatedByAi, provider: n.provider, model: n.model, token_total: n.tokenTotal, cost: n.cost, created_at: n.createdAt };
}
export function toNarrative(r: Record<string, unknown>): ReportNarrative {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), content: String(r["content"] ?? ""), generatedByAi: r["generated_by_ai"] === true, provider: nstr(r["provider"]), model: nstr(r["model"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), createdAt: String(r["created_at"]) };
}

export function scheduleRow(s: ReportSchedule): Record<string, unknown> {
  return { id: s.id, workspace_id: s.workspaceId, client_id: s.clientId, kind: s.kind, frequency: s.frequency, enabled: s.enabled, recipients_note: s.recipientsNote, next_run_at: s.nextRunAt, created_by_user_id: s.createdByUserId, created_at: s.createdAt, updated_at: s.updatedAt };
}
export function toSchedule(r: Record<string, unknown>): ReportSchedule {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as ReportSchedule["kind"], frequency: r["frequency"] as ReportSchedule["frequency"], enabled: r["enabled"] === true, recipientsNote: String(r["recipients_note"] ?? ""), nextRunAt: nstr(r["next_run_at"]), createdByUserId: String(r["created_by_user_id"]), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function feedbackRow(f: ReportFeedback): Record<string, unknown> {
  return { id: f.id, report_id: f.reportId, workspace_id: f.workspaceId, client_id: f.clientId, kind: f.kind, rating: f.rating, comment: f.comment, subject_user_id: f.subjectUserId, created_at: f.createdAt };
}
export function toFeedback(r: Record<string, unknown>): ReportFeedback {
  return { id: String(r["id"]), reportId: String(r["report_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as ReportFeedback["kind"], rating: nint(r["rating"]), comment: nstr(r["comment"]), subjectUserId: String(r["subject_user_id"]), createdAt: String(r["created_at"]) };
}
