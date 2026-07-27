/* =============================================================================
 * Supabase AI Reporting repositories (Phase E · Sprint E6).
 *
 * Twelve adapters (untyped-cast pattern; mappers are the boundary). The executive
 * report is versioned (optimistic concurrency); the schedule is mutable; every
 * observation / metric / KPI / trend / forecast / insight / summary / section /
 * narrative / feedback record is append-only.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type BusinessInsightRepository, type BusinessMetricRepository, type ExecutiveReportRepository, type ForecastRepository,
  type KpiResultRepository, type ObservationSnapshotRepository, type ReportExecutiveSummaryRepository,
  type ReportFeedbackRepository, type ReportNarrativeRepository, type ReportScheduleRepository,
  type ReportSectionRepository, type RuntimeResult, type TrendAnalysisRepository,
} from "@brightloop/domain";
import type {
  BusinessInsight, BusinessMetric, ExecutiveReport, Forecast, KpiResult, ObservationSnapshot, ReportExecutiveSummary,
  ReportFeedback, ReportNarrative, ReportSchedule, ReportSection, TrendAnalysis,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const REP = "executive_report";
const OBS = "observation_snapshot";
const MET = "business_metric";
const KPI = "kpi_result";
const TRN = "trend_analysis";
const FCT = "forecast";
const INS = "business_insight";
const SUM = "executive_summary";
const SEC = "report_section";
const NAR = "report_narrative";
const SCH = "report_schedule";
const FB = "report_feedback";

function appendMany<T>(db: SupabaseClient, table: string, toRow: (t: T) => Record<string, unknown>, toDomain: (r: Record<string, unknown>) => T, ctx: string) {
  return async (rows: readonly T[]): Promise<RuntimeResult<T[]>> => {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await db.from(table).insert(rows.map(toRow)).select("*");
    if (error) return mapDatabaseError(error, `${ctx}.appendMany`);
    return ok("created", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}
function listByReport<T>(db: SupabaseClient, table: string, toDomain: (r: Record<string, unknown>) => T, ctx: string, orderCol?: string) {
  return async (reportId: string): Promise<RuntimeResult<T[]>> => {
    let q = db.from(table).select("*").eq("report_id", reportId);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) return mapDatabaseError(error, `${ctx}.listByReport`);
    return ok("found", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}

export class SupabaseExecutiveReportRepository implements ExecutiveReportRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(r: ExecutiveReport): Promise<RuntimeResult<ExecutiveReport>> {
    const { data, error } = await this.db.from(REP).insert(m.reportRow(r)).select("*").single();
    if (error) return mapDatabaseError(error, "executiveReport.create");
    return ok("created", m.toReport(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<ExecutiveReport | null>> {
    const { data, error } = await this.db.from(REP).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "executiveReport.getById");
    return ok("found", data ? m.toReport(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<ExecutiveReport[]>> {
    const { data, error } = await this.db.from(REP).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "executiveReport.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toReport(r as Record<string, unknown>)));
  }
  async save(next: ExecutiveReport, expectedVersion: number): Promise<RuntimeResult<ExecutiveReport>> {
    const { data, error } = await this.db.from(REP).update({ status: next.status, provider: next.provider, model: next.model, prompt_id: next.promptId, collection_duration_ms: next.collectionDurationMs, analysis_duration_ms: next.analysisDurationMs, ai_duration_ms: next.aiDurationMs, generation_duration_ms: next.generationDurationMs, token_total: next.tokenTotal, cost: next.cost, report_size: next.reportSize, metric_count: next.metricCount, forecast_count: next.forecastCount, insight_count: next.insightCount, confidence: next.confidence, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "executiveReport.save");
    if (data === null) return err("conflict", "executiveReport.save: version mismatch");
    return ok("updated", m.toReport(data as Record<string, unknown>));
  }
}

export class SupabaseObservationSnapshotRepository implements ObservationSnapshotRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly ObservationSnapshot[]) { return appendMany<ObservationSnapshot>(this.db, OBS, m.observationRow, m.toObservation, "observationSnapshot")(rows); }
  listByReport(id: string) { return listByReport<ObservationSnapshot>(this.db, OBS, m.toObservation, "observationSnapshot")(id); }
}
export class SupabaseBusinessMetricRepository implements BusinessMetricRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly BusinessMetric[]) { return appendMany<BusinessMetric>(this.db, MET, m.metricRow, m.toMetric, "businessMetric")(rows); }
  listByReport(id: string) { return listByReport<BusinessMetric>(this.db, MET, m.toMetric, "businessMetric")(id); }
}
export class SupabaseKpiResultRepository implements KpiResultRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly KpiResult[]) { return appendMany<KpiResult>(this.db, KPI, m.kpiRow, m.toKpi, "kpiResult")(rows); }
  listByReport(id: string) { return listByReport<KpiResult>(this.db, KPI, m.toKpi, "kpiResult")(id); }
}
export class SupabaseTrendAnalysisRepository implements TrendAnalysisRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly TrendAnalysis[]) { return appendMany<TrendAnalysis>(this.db, TRN, m.trendRow, m.toTrend, "trendAnalysis")(rows); }
  listByReport(id: string) { return listByReport<TrendAnalysis>(this.db, TRN, m.toTrend, "trendAnalysis")(id); }
}
export class SupabaseForecastRepository implements ForecastRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly Forecast[]) { return appendMany<Forecast>(this.db, FCT, m.forecastRow, m.toForecast, "forecast")(rows); }
  listByReport(id: string) { return listByReport<Forecast>(this.db, FCT, m.toForecast, "forecast")(id); }
}
export class SupabaseBusinessInsightRepository implements BusinessInsightRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly BusinessInsight[]) { return appendMany<BusinessInsight>(this.db, INS, m.insightRow, m.toInsight, "businessInsight")(rows); }
  listByReport(id: string) { return listByReport<BusinessInsight>(this.db, INS, m.toInsight, "businessInsight")(id); }
}
export class SupabaseReportSectionRepository implements ReportSectionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly ReportSection[]) { return appendMany<ReportSection>(this.db, SEC, m.sectionRow, m.toSection, "reportSection")(rows); }
  listByReport(id: string) { return listByReport<ReportSection>(this.db, SEC, m.toSection, "reportSection", "order_index")(id); }
}

export class SupabaseReportExecutiveSummaryRepository implements ReportExecutiveSummaryRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(s: ReportExecutiveSummary): Promise<RuntimeResult<ReportExecutiveSummary>> {
    const { data, error } = await this.db.from(SUM).insert(m.summaryRow(s)).select("*").single();
    if (error) return mapDatabaseError(error, "reportExecutiveSummary.append");
    return ok("created", m.toSummary(data as Record<string, unknown>));
  }
  async getByReport(reportId: string): Promise<RuntimeResult<ReportExecutiveSummary | null>> {
    const { data, error } = await this.db.from(SUM).select("*").eq("report_id", reportId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "reportExecutiveSummary.getByReport");
    return ok("found", data ? m.toSummary(data as Record<string, unknown>) : null);
  }
}

export class SupabaseReportNarrativeRepository implements ReportNarrativeRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(n: ReportNarrative): Promise<RuntimeResult<ReportNarrative>> {
    const { data, error } = await this.db.from(NAR).insert(m.narrativeRow(n)).select("*").single();
    if (error) return mapDatabaseError(error, "reportNarrative.append");
    return ok("created", m.toNarrative(data as Record<string, unknown>));
  }
  async getByReport(reportId: string): Promise<RuntimeResult<ReportNarrative | null>> {
    const { data, error } = await this.db.from(NAR).select("*").eq("report_id", reportId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "reportNarrative.getByReport");
    return ok("found", data ? m.toNarrative(data as Record<string, unknown>) : null);
  }
}

export class SupabaseReportScheduleRepository implements ReportScheduleRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(s: ReportSchedule): Promise<RuntimeResult<ReportSchedule>> {
    const { data, error } = await this.db.from(SCH).insert(m.scheduleRow(s)).select("*").single();
    if (error) return mapDatabaseError(error, "reportSchedule.create");
    return ok("created", m.toSchedule(data as Record<string, unknown>));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<ReportSchedule[]>> {
    const { data, error } = await this.db.from(SCH).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "reportSchedule.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toSchedule(r as Record<string, unknown>)));
  }
  async save(next: ReportSchedule): Promise<RuntimeResult<ReportSchedule>> {
    const { data, error } = await this.db.from(SCH).update({ enabled: next.enabled, recipients_note: next.recipientsNote, next_run_at: next.nextRunAt, updated_at: next.updatedAt }).eq("id", next.id).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "reportSchedule.save");
    if (data === null) return err("conflict", "reportSchedule.save: not found");
    return ok("updated", m.toSchedule(data as Record<string, unknown>));
  }
}

export class SupabaseReportFeedbackRepository implements ReportFeedbackRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(f: ReportFeedback): Promise<RuntimeResult<ReportFeedback>> {
    const { data, error } = await this.db.from(FB).insert(m.feedbackRow(f)).select("*").single();
    if (error) return mapDatabaseError(error, "reportFeedback.append");
    return ok("created", m.toFeedback(data as Record<string, unknown>));
  }
  async listByReport(reportId: string): Promise<RuntimeResult<ReportFeedback[]>> {
    const { data, error } = await this.db.from(FB).select("*").eq("report_id", reportId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "reportFeedback.listByReport");
    return ok("found", (data ?? []).map((r) => m.toFeedback(r as Record<string, unknown>)));
  }
}
