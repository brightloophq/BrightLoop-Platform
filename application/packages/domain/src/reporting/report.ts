/* =============================================================================
 * Executive-report lifecycle + reporting builders (Phase E · Sprint E6) — PURE.
 *
 *   draft → generating → generated → published ; generating → failed ; * → archived
 * Every reporting record (observation snapshot, metrics, KPIs, trends, forecasts,
 * insights, summary, sections, narrative, schedule, feedback) is built here and
 * is immutable once produced. All pure; the application persists them. Reporting
 * OBSERVES upstream outputs — it never modifies them.
 * ========================================================================== */

import type {
  BusinessInsight, BusinessInsightSeverity, BusinessMetric, BusinessMetricCategory, ExecutiveReport, Forecast,
  ForecastKind, KpiResult, KpiResultStatus, ObservationSnapshot, ObservationSource, ReportExecutiveSummary,
  ReportFeedback, ReportFeedbackKind, ReportFrequency, ReportKind, ReportNarrative, ReportSchedule, ReportSection,
  ReportStatus, TrendAnalysis, TrendDirection,
} from "@brightloop/schema";

export const REPORT_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  draft: ["generating", "archived"],
  generating: ["generated", "failed"],
  generated: ["published", "generating", "archived"],
  published: ["generating", "archived"],
  failed: ["generating", "archived"],
  archived: [],
};
export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS[from].includes(to);
}

export interface BuildExecutiveReportInput {
  id: string; workspaceId: string; clientId: string | null; kind: ReportKind; title: string; period?: string; requestedByUserId: string; now: string;
}
export function buildExecutiveReport(i: BuildExecutiveReportInput): ExecutiveReport {
  return {
    id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, kind: i.kind, title: i.title.slice(0, 300), period: i.period ?? "",
    status: "draft", requestedByUserId: i.requestedByUserId, provider: null, model: null, promptId: null,
    collectionDurationMs: 0, analysisDurationMs: 0, aiDurationMs: 0, generationDurationMs: 0, tokenTotal: 0, cost: 0, currency: "USD",
    reportSize: 0, metricCount: 0, forecastCount: 0, insightCount: 0, confidence: 0, version: 1, createdAt: i.now, updatedAt: i.now,
  };
}

export interface BuildObservationSnapshotInput {
  id: string; reportId: string; workspaceId: string; clientId: string | null; source: ObservationSource; label?: string;
  provenance?: Record<string, unknown>; data?: Record<string, unknown>; observedAt: string; now: string;
}
export function buildObservationSnapshot(o: BuildObservationSnapshotInput): ObservationSnapshot {
  return { id: o.id, reportId: o.reportId, workspaceId: o.workspaceId, clientId: o.clientId, source: o.source, label: o.label ?? "", provenance: o.provenance ?? {}, data: o.data ?? {}, observedAt: o.observedAt, createdAt: o.now };
}

export interface BuildBusinessMetricInput {
  id: string; reportId: string; workspaceId: string; clientId: string | null; key: string; name: string;
  category: BusinessMetricCategory; value: number; unit?: string; sampleSize?: number; source: ObservationSource; now: string;
}
export function buildBusinessMetric(m: BuildBusinessMetricInput): BusinessMetric {
  return { id: m.id, reportId: m.reportId, workspaceId: m.workspaceId, clientId: m.clientId, key: m.key.slice(0, 120), name: m.name.slice(0, 200), category: m.category, value: m.value, unit: m.unit ?? "", sampleSize: m.sampleSize ?? 0, source: m.source, createdAt: m.now };
}

export interface BuildKpiResultInput {
  id: string; reportId: string; workspaceId: string; clientId: string | null; name: string; baseline: number; current: number;
  target: number; variance: number; status: KpiResultStatus; trend: TrendDirection; owner?: string | null; measurementFrequency?: ReportFrequency; now: string;
}
export function buildKpiResult(k: BuildKpiResultInput): KpiResult {
  return { id: k.id, reportId: k.reportId, workspaceId: k.workspaceId, clientId: k.clientId, name: k.name.slice(0, 200), baseline: k.baseline, current: k.current, target: k.target, variance: k.variance, status: k.status, trend: k.trend, owner: k.owner ?? null, measurementFrequency: k.measurementFrequency ?? "monthly", createdAt: k.now };
}

export interface BuildTrendAnalysisInput { id: string; reportId: string; workspaceId: string; clientId: string | null; metricKey: string; direction: TrendDirection; changePercent: number; significant: boolean; summary?: string; periodCount: number; now: string; }
export function buildTrendAnalysis(t: BuildTrendAnalysisInput): TrendAnalysis {
  return { id: t.id, reportId: t.reportId, workspaceId: t.workspaceId, clientId: t.clientId, metricKey: t.metricKey, direction: t.direction, changePercent: t.changePercent, significant: t.significant, summary: t.summary ?? "", periodCount: t.periodCount, createdAt: t.now };
}

export interface BuildForecastInput { id: string; reportId: string; workspaceId: string; clientId: string | null; kind: ForecastKind; metricKey: string; horizonDays?: number; projectedValue: number; confidence: number; basis?: string; now: string; }
export function buildForecast(f: BuildForecastInput): Forecast {
  return { id: f.id, reportId: f.reportId, workspaceId: f.workspaceId, clientId: f.clientId, kind: f.kind, metricKey: f.metricKey, horizonDays: f.horizonDays ?? 30, projectedValue: f.projectedValue, confidence: f.confidence, basis: f.basis ?? "", createdAt: f.now };
}

export interface BuildBusinessInsightInput {
  id: string; reportId: string; workspaceId: string; clientId: string | null; title: string; summary?: string;
  severity: BusinessInsightSeverity; confidence: number; affectedMetrics?: readonly string[]; supportingEvidence?: readonly string[]; recommendedActions?: readonly string[]; now: string;
}
export function buildBusinessInsight(i: BuildBusinessInsightInput): BusinessInsight {
  return { id: i.id, reportId: i.reportId, workspaceId: i.workspaceId, clientId: i.clientId, title: i.title.slice(0, 300), summary: i.summary ?? "", severity: i.severity, confidence: i.confidence, affectedMetrics: [...(i.affectedMetrics ?? [])], supportingEvidence: [...(i.supportingEvidence ?? [])], recommendedActions: [...(i.recommendedActions ?? [])], createdAt: i.now };
}

export interface BuildReportExecutiveSummaryInput { id: string; reportId: string; workspaceId: string; clientId: string | null; headline?: string; highlights?: readonly string[]; keyMetrics?: readonly string[]; overallConfidence?: number; now: string; }
export function buildReportExecutiveSummary(s: BuildReportExecutiveSummaryInput): ReportExecutiveSummary {
  return { id: s.id, reportId: s.reportId, workspaceId: s.workspaceId, clientId: s.clientId, headline: s.headline ?? "", highlights: [...(s.highlights ?? [])], keyMetrics: [...(s.keyMetrics ?? [])], overallConfidence: s.overallConfidence ?? 0, createdAt: s.now };
}

export interface BuildReportSectionInput { id: string; reportId: string; workspaceId: string; clientId: string | null; key: string; title: string; body?: string; order: number; now: string; }
export function buildReportSection(s: BuildReportSectionInput): ReportSection {
  return { id: s.id, reportId: s.reportId, workspaceId: s.workspaceId, clientId: s.clientId, key: s.key.slice(0, 120), title: s.title.slice(0, 300), body: s.body ?? "", order: s.order, createdAt: s.now };
}

export interface BuildReportNarrativeInput { id: string; reportId: string; workspaceId: string; clientId: string | null; content?: string; generatedByAi?: boolean; provider?: string | null; model?: string | null; tokenTotal?: number; cost?: number; now: string; }
export function buildReportNarrative(n: BuildReportNarrativeInput): ReportNarrative {
  return { id: n.id, reportId: n.reportId, workspaceId: n.workspaceId, clientId: n.clientId, content: n.content ?? "", generatedByAi: n.generatedByAi ?? false, provider: n.provider ?? null, model: n.model ?? null, tokenTotal: n.tokenTotal ?? 0, cost: n.cost ?? 0, createdAt: n.now };
}

export interface BuildReportScheduleInput { id: string; workspaceId: string; clientId: string | null; kind: ReportKind; frequency: ReportFrequency; enabled?: boolean; recipientsNote?: string; nextRunAt?: string | null; createdByUserId: string; now: string; }
export function buildReportSchedule(s: BuildReportScheduleInput): ReportSchedule {
  return { id: s.id, workspaceId: s.workspaceId, clientId: s.clientId, kind: s.kind, frequency: s.frequency, enabled: s.enabled ?? true, recipientsNote: s.recipientsNote ?? "", nextRunAt: s.nextRunAt ?? null, createdByUserId: s.createdByUserId, createdAt: s.now, updatedAt: s.now };
}

export function buildReportFeedback(id: string, reportId: string, workspaceId: string, clientId: string | null, kind: ReportFeedbackKind, rating: number | null, comment: string | null, subjectUserId: string, now: string): ReportFeedback {
  return { id, reportId, workspaceId, clientId, kind, rating, comment, subjectUserId, createdAt: now };
}
