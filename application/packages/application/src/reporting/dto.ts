/* =============================================================================
 * AI Reporting DTOs (Phase E · Sprint E6) — the outward boundary.
 * ========================================================================== */

import type {
  BusinessInsight, BusinessMetric, ExecutiveReport, Forecast, KpiResult, ObservationSnapshot, ReportExecutiveSummary,
  ReportFeedback, ReportNarrative, ReportSchedule, ReportSection, TrendAnalysis,
} from "@brightloop/schema";

export interface ExecutiveReportDTO {
  id: string; kind: ExecutiveReport["kind"]; title: string; period: string; status: ExecutiveReport["status"];
  confidence: number; reportSize: number; metricCount: number; forecastCount: number; insightCount: number;
  provider: string | null; model: string | null; collectionDurationMs: number; analysisDurationMs: number;
  aiDurationMs: number; generationDurationMs: number; tokenTotal: number; cost: number; currency: string;
  version: number; createdAt: string; updatedAt: string;
}
export const toExecutiveReportDTO = (r: ExecutiveReport): ExecutiveReportDTO => ({ id: r.id, kind: r.kind, title: r.title, period: r.period, status: r.status, confidence: r.confidence, reportSize: r.reportSize, metricCount: r.metricCount, forecastCount: r.forecastCount, insightCount: r.insightCount, provider: r.provider, model: r.model, collectionDurationMs: r.collectionDurationMs, analysisDurationMs: r.analysisDurationMs, aiDurationMs: r.aiDurationMs, generationDurationMs: r.generationDurationMs, tokenTotal: r.tokenTotal, cost: r.cost, currency: r.currency, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt });

export interface ObservationSnapshotDTO { id: string; source: ObservationSnapshot["source"]; label: string; provenance: Record<string, unknown>; data: Record<string, unknown>; observedAt: string; }
export const toObservationSnapshotDTO = (o: ObservationSnapshot): ObservationSnapshotDTO => ({ id: o.id, source: o.source, label: o.label, provenance: o.provenance, data: o.data, observedAt: o.observedAt });

export interface BusinessMetricDTO { id: string; key: string; name: string; category: BusinessMetric["category"]; value: number; unit: string; sampleSize: number; source: BusinessMetric["source"]; }
export const toBusinessMetricDTO = (m: BusinessMetric): BusinessMetricDTO => ({ id: m.id, key: m.key, name: m.name, category: m.category, value: m.value, unit: m.unit, sampleSize: m.sampleSize, source: m.source });

export interface KpiResultDTO { id: string; name: string; baseline: number; current: number; target: number; variance: number; status: KpiResult["status"]; trend: KpiResult["trend"]; owner: string | null; measurementFrequency: KpiResult["measurementFrequency"]; }
export const toKpiResultDTO = (k: KpiResult): KpiResultDTO => ({ id: k.id, name: k.name, baseline: k.baseline, current: k.current, target: k.target, variance: k.variance, status: k.status, trend: k.trend, owner: k.owner, measurementFrequency: k.measurementFrequency });

export interface TrendAnalysisDTO { id: string; metricKey: string; direction: TrendAnalysis["direction"]; changePercent: number; significant: boolean; summary: string; periodCount: number; }
export const toTrendAnalysisDTO = (t: TrendAnalysis): TrendAnalysisDTO => ({ id: t.id, metricKey: t.metricKey, direction: t.direction, changePercent: t.changePercent, significant: t.significant, summary: t.summary, periodCount: t.periodCount });

export interface ForecastDTO { id: string; kind: Forecast["kind"]; metricKey: string; horizonDays: number; projectedValue: number; confidence: number; basis: string; }
export const toForecastDTO = (f: Forecast): ForecastDTO => ({ id: f.id, kind: f.kind, metricKey: f.metricKey, horizonDays: f.horizonDays, projectedValue: f.projectedValue, confidence: f.confidence, basis: f.basis });

export interface BusinessInsightDTO { id: string; title: string; summary: string; severity: BusinessInsight["severity"]; confidence: number; affectedMetrics: string[]; supportingEvidence: string[]; recommendedActions: string[]; }
export const toBusinessInsightDTO = (i: BusinessInsight): BusinessInsightDTO => ({ id: i.id, title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence, affectedMetrics: i.affectedMetrics, supportingEvidence: i.supportingEvidence, recommendedActions: i.recommendedActions });

export interface ReportExecutiveSummaryDTO { id: string; headline: string; highlights: string[]; keyMetrics: string[]; overallConfidence: number; }
export const toReportExecutiveSummaryDTO = (s: ReportExecutiveSummary): ReportExecutiveSummaryDTO => ({ id: s.id, headline: s.headline, highlights: s.highlights, keyMetrics: s.keyMetrics, overallConfidence: s.overallConfidence });

export interface ReportSectionDTO { id: string; key: string; title: string; body: string; order: number; }
export const toReportSectionDTO = (s: ReportSection): ReportSectionDTO => ({ id: s.id, key: s.key, title: s.title, body: s.body, order: s.order });

export interface ReportNarrativeDTO { id: string; content: string; generatedByAi: boolean; provider: string | null; model: string | null; tokenTotal: number; cost: number; }
export const toReportNarrativeDTO = (n: ReportNarrative): ReportNarrativeDTO => ({ id: n.id, content: n.content, generatedByAi: n.generatedByAi, provider: n.provider, model: n.model, tokenTotal: n.tokenTotal, cost: n.cost });

export interface ReportScheduleDTO { id: string; kind: ReportSchedule["kind"]; frequency: ReportSchedule["frequency"]; enabled: boolean; recipientsNote: string; nextRunAt: string | null; createdAt: string; }
export const toReportScheduleDTO = (s: ReportSchedule): ReportScheduleDTO => ({ id: s.id, kind: s.kind, frequency: s.frequency, enabled: s.enabled, recipientsNote: s.recipientsNote, nextRunAt: s.nextRunAt, createdAt: s.createdAt });

export interface ReportFeedbackDTO { id: string; kind: ReportFeedback["kind"]; rating: number | null; comment: string | null; subjectUserId: string; createdAt: string; }
export const toReportFeedbackDTO = (f: ReportFeedback): ReportFeedbackDTO => ({ id: f.id, kind: f.kind, rating: f.rating, comment: f.comment, subjectUserId: f.subjectUserId, createdAt: f.createdAt });

/** The complete structured report. */
export interface ReportDetailDTO {
  report: ExecutiveReportDTO;
  summary: ReportExecutiveSummaryDTO | null;
  narrative: ReportNarrativeDTO | null;
  sections: ReportSectionDTO[];
  metrics: BusinessMetricDTO[];
  kpis: KpiResultDTO[];
  trends: TrendAnalysisDTO[];
  forecasts: ForecastDTO[];
  insights: BusinessInsightDTO[];
  observations: ObservationSnapshotDTO[];
}

export interface ExecutiveDashboardDTO { report: ExecutiveReportDTO; summary: ReportExecutiveSummaryDTO | null; metricCount: number; kpiCount: number; insightCount: number; forecastCount: number; }
export interface CollectionResultDTO { reportId: string; observations: ObservationSnapshotDTO[]; }
