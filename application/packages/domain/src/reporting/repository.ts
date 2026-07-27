/* =============================================================================
 * AI Reporting — REPOSITORY PORTS (Phase E · Sprint E6).
 *
 * Persistence contracts; Supabase adapters live in `@brightloop/data`. The
 * executive report is versioned (optimistic concurrency); the report schedule is
 * mutable (enable/disable); every observation / metric / KPI / trend / forecast /
 * insight / summary / section / narrative / feedback record is append-only. The
 * reporting layer consumes Phase D + E1–E5 ONLY via their application services,
 * so no upstream ports appear here. RLS is the tenant boundary.
 * ========================================================================== */

import type {
  BusinessInsight, BusinessMetric, ExecutiveReport, Forecast, KpiResult, ObservationSnapshot, ReportExecutiveSummary,
  ReportFeedback, ReportNarrative, ReportSchedule, ReportSection, TrendAnalysis,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface ExecutiveReportRepository {
  create(report: ExecutiveReport): Promise<RuntimeResult<ExecutiveReport>>;
  getById(id: string): Promise<RuntimeResult<ExecutiveReport | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<ExecutiveReport[]>>;
  save(next: ExecutiveReport, expectedVersion: number): Promise<RuntimeResult<ExecutiveReport>>;
}

export interface ObservationSnapshotRepository {
  appendMany(rows: readonly ObservationSnapshot[]): Promise<RuntimeResult<ObservationSnapshot[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<ObservationSnapshot[]>>;
}

export interface BusinessMetricRepository {
  appendMany(rows: readonly BusinessMetric[]): Promise<RuntimeResult<BusinessMetric[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<BusinessMetric[]>>;
}

export interface KpiResultRepository {
  appendMany(rows: readonly KpiResult[]): Promise<RuntimeResult<KpiResult[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<KpiResult[]>>;
}

export interface TrendAnalysisRepository {
  appendMany(rows: readonly TrendAnalysis[]): Promise<RuntimeResult<TrendAnalysis[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<TrendAnalysis[]>>;
}

export interface ForecastRepository {
  appendMany(rows: readonly Forecast[]): Promise<RuntimeResult<Forecast[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<Forecast[]>>;
}

export interface BusinessInsightRepository {
  appendMany(rows: readonly BusinessInsight[]): Promise<RuntimeResult<BusinessInsight[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<BusinessInsight[]>>;
}

export interface ReportExecutiveSummaryRepository {
  append(row: ReportExecutiveSummary): Promise<RuntimeResult<ReportExecutiveSummary>>;
  getByReport(reportId: string): Promise<RuntimeResult<ReportExecutiveSummary | null>>;
}

export interface ReportSectionRepository {
  appendMany(rows: readonly ReportSection[]): Promise<RuntimeResult<ReportSection[]>>;
  listByReport(reportId: string): Promise<RuntimeResult<ReportSection[]>>;
}

export interface ReportNarrativeRepository {
  append(row: ReportNarrative): Promise<RuntimeResult<ReportNarrative>>;
  getByReport(reportId: string): Promise<RuntimeResult<ReportNarrative | null>>;
}

export interface ReportScheduleRepository {
  create(row: ReportSchedule): Promise<RuntimeResult<ReportSchedule>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<ReportSchedule[]>>;
  save(next: ReportSchedule): Promise<RuntimeResult<ReportSchedule>>;
}

export interface ReportFeedbackRepository {
  append(row: ReportFeedback): Promise<RuntimeResult<ReportFeedback>>;
  listByReport(reportId: string): Promise<RuntimeResult<ReportFeedback[]>>;
}

/** The ports the Reporting application use-cases are wired with. */
export interface ReportingRepositories {
  reports: ExecutiveReportRepository;
  observations: ObservationSnapshotRepository;
  metrics: BusinessMetricRepository;
  kpis: KpiResultRepository;
  trends: TrendAnalysisRepository;
  forecasts: ForecastRepository;
  insights: BusinessInsightRepository;
  summaries: ReportExecutiveSummaryRepository;
  sections: ReportSectionRepository;
  narratives: ReportNarrativeRepository;
  schedules: ReportScheduleRepository;
  feedback: ReportFeedbackRepository;
}
