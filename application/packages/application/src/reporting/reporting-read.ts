/* =============================================================================
 * AI Reporting read models (Phase E · Sprint E6).
 *
 * Read-only projections: executive dashboard, business metrics, KPI/trend/
 * forecast/insight dashboards, executive + operational reports, report history,
 * workspace health, schedules, feedback. Load-then-authorize; DTOs only.
 * ========================================================================== */

import { authorize, requireReporting, REPORT_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toBusinessInsightDTO, toBusinessMetricDTO, toExecutiveReportDTO, toForecastDTO, toKpiResultDTO,
  toObservationSnapshotDTO, toReportExecutiveSummaryDTO, toReportFeedbackDTO, toReportNarrativeDTO,
  toReportScheduleDTO, toReportSectionDTO, toTrendAnalysisDTO,
  type BusinessInsightDTO, type BusinessMetricDTO, type ExecutiveDashboardDTO, type ExecutiveReportDTO,
  type ForecastDTO, type KpiResultDTO, type ReportDetailDTO, type ReportFeedbackDTO, type ReportScheduleDTO,
  type TrendAnalysisDTO,
} from "./dto.js";

async function loadReport(ctx: AppContext, reportId: string) {
  const rep = requireReporting(ctx);
  const report = unwrap(await rep.reports.getById(reportId));
  if (report === null) throw new NotFoundError("executive report");
  authorize(ctx.actor, REPORT_READ_CAP, report.clientId);
  return { rep, report };
}

/** Executive Reports / Report History — every report in a workspace, newest first. */
export async function listExecutiveReports(ctx: AppContext, rawWorkspaceId: unknown): Promise<ExecutiveReportDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const rep = requireReporting(ctx);
  authorize(ctx.actor, REPORT_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await rep.reports.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toExecutiveReportDTO);
}

/** Operational Reports — the operational-kind reports in a workspace. */
export async function listOperationalReports(ctx: AppContext, rawWorkspaceId: unknown): Promise<ExecutiveReportDTO[]> {
  return (await listExecutiveReports(ctx, rawWorkspaceId)).filter((r) => r.kind === "operational");
}

/** Executive Dashboard — a report with its summary + derived counts. */
export async function getExecutiveDashboard(ctx: AppContext, rawReportId: unknown): Promise<ExecutiveDashboardDTO> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId);
  const [summary, metrics, kpis, insights, forecasts] = await Promise.all([
    rep.summaries.getByReport(reportId).then(unwrap), rep.metrics.listByReport(reportId).then(unwrap),
    rep.kpis.listByReport(reportId).then(unwrap), rep.insights.listByReport(reportId).then(unwrap), rep.forecasts.listByReport(reportId).then(unwrap),
  ]);
  return { report: toExecutiveReportDTO(report), summary: summary ? toReportExecutiveSummaryDTO(summary) : null, metricCount: metrics.length, kpiCount: kpis.length, insightCount: insights.length, forecastCount: forecasts.length };
}

/** The complete structured report. */
export async function getReportDetail(ctx: AppContext, rawReportId: unknown): Promise<ReportDetailDTO> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId);
  const [summary, narrative, sections, metrics, kpis, trends, forecasts, insights, observations] = await Promise.all([
    rep.summaries.getByReport(reportId).then(unwrap), rep.narratives.getByReport(reportId).then(unwrap),
    rep.sections.listByReport(reportId).then(unwrap), rep.metrics.listByReport(reportId).then(unwrap),
    rep.kpis.listByReport(reportId).then(unwrap), rep.trends.listByReport(reportId).then(unwrap),
    rep.forecasts.listByReport(reportId).then(unwrap), rep.insights.listByReport(reportId).then(unwrap),
    rep.observations.listByReport(reportId).then(unwrap),
  ]);
  return {
    report: toExecutiveReportDTO(report), summary: summary ? toReportExecutiveSummaryDTO(summary) : null, narrative: narrative ? toReportNarrativeDTO(narrative) : null,
    sections: [...sections].sort((a, b) => a.order - b.order).map(toReportSectionDTO),
    metrics: metrics.map(toBusinessMetricDTO), kpis: kpis.map(toKpiResultDTO), trends: trends.map(toTrendAnalysisDTO),
    forecasts: forecasts.map(toForecastDTO), insights: insights.map(toBusinessInsightDTO), observations: observations.map(toObservationSnapshotDTO),
  };
}

/** Business Metrics dashboard. */
export async function listBusinessMetrics(ctx: AppContext, rawReportId: unknown): Promise<BusinessMetricDTO[]> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep } = await loadReport(ctx, reportId);
  return unwrap(await rep.metrics.listByReport(reportId)).map(toBusinessMetricDTO);
}

/** KPI Dashboard (report KPI results). */
export async function getReportKpiDashboard(ctx: AppContext, rawReportId: unknown): Promise<KpiResultDTO[]> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep } = await loadReport(ctx, reportId);
  return unwrap(await rep.kpis.listByReport(reportId)).map(toKpiResultDTO);
}

/** Trend Dashboard. */
export async function getTrendDashboard(ctx: AppContext, rawReportId: unknown): Promise<TrendAnalysisDTO[]> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep } = await loadReport(ctx, reportId);
  return unwrap(await rep.trends.listByReport(reportId)).map(toTrendAnalysisDTO);
}

/** Forecast Dashboard. */
export async function getForecastDashboard(ctx: AppContext, rawReportId: unknown): Promise<ForecastDTO[]> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep } = await loadReport(ctx, reportId);
  return unwrap(await rep.forecasts.listByReport(reportId)).map(toForecastDTO);
}

/** Insight Dashboard — most severe first. */
export async function getInsightDashboard(ctx: AppContext, rawReportId: unknown): Promise<BusinessInsightDTO[]> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep } = await loadReport(ctx, reportId);
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...unwrap(await rep.insights.listByReport(reportId))].sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5)).map(toBusinessInsightDTO);
}

/** Workspace Health — the latest report's health metric + confidence. */
export async function getWorkspaceHealth(ctx: AppContext, rawWorkspaceId: unknown): Promise<{ health: number | null; confidence: number | null; reportId: string | null; period: string | null }> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const rep = requireReporting(ctx);
  authorize(ctx.actor, REPORT_READ_CAP, ctx.actor.clientId);
  const latest = [...unwrap(await rep.reports.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (latest === undefined) return { health: null, confidence: null, reportId: null, period: null };
  const health = unwrap(await rep.metrics.listByReport(latest.id)).find((m) => m.key === "workspace_health")?.value ?? null;
  return { health, confidence: latest.confidence, reportId: latest.id, period: latest.period };
}

export async function listReportSchedules(ctx: AppContext, rawWorkspaceId: unknown): Promise<ReportScheduleDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const rep = requireReporting(ctx);
  authorize(ctx.actor, REPORT_READ_CAP, ctx.actor.clientId);
  return unwrap(await rep.schedules.listByWorkspace(workspaceId)).map(toReportScheduleDTO);
}

export async function listReportFeedback(ctx: AppContext, rawReportId: unknown): Promise<ReportFeedbackDTO[]> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep } = await loadReport(ctx, reportId);
  return [...unwrap(await rep.feedback.listByReport(reportId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toReportFeedbackDTO);
}
