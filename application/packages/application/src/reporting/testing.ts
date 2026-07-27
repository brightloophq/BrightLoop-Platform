/* =============================================================================
 * In-memory Reporting repositories (Phase E · Sprint E6) — TEST SUPPORT.
 *
 * The executive report is versioned (optimistic concurrency); the schedule is
 * mutable; every observation / metric / KPI / trend / forecast / insight /
 * summary / section / narrative / feedback record is append-only. Upstream
 * (Phase D + E1–E5) doubles come from their own testing modules — reporting
 * reaches them only via application services.
 * ========================================================================== */

import { ok, type ReportingRepositories, type RuntimeResult } from "@brightloop/domain";
import type {
  BusinessInsight, BusinessMetric, ExecutiveReport, Forecast, KpiResult, ObservationSnapshot, ReportExecutiveSummary,
  ReportFeedback, ReportNarrative, ReportSchedule, ReportSection, TrendAnalysis,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryReportingRepos(): ReportingRepositories {
  const reports = new Map<string, ExecutiveReport>();
  const observations: ObservationSnapshot[] = [];
  const metrics: BusinessMetric[] = [];
  const kpis: KpiResult[] = [];
  const trends: TrendAnalysis[] = [];
  const forecasts: Forecast[] = [];
  const insights: BusinessInsight[] = [];
  const summaries = new Map<string, ReportExecutiveSummary>();
  const sections: ReportSection[] = [];
  const narratives = new Map<string, ReportNarrative>();
  const schedules: ReportSchedule[] = [];
  const feedback: ReportFeedback[] = [];

  return {
    reports: {
      create: async (r) => { reports.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", reports.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...reports.values()].filter((r) => r.workspaceId === wid)),
      save: async (next, expected) => { const cur = reports.get(next.id); if (!cur || cur.version !== expected) return conflict(); reports.set(next.id, next); return ok("updated", next); },
    },
    observations: { appendMany: async (r) => { observations.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", observations.filter((x) => x.reportId === id)) },
    metrics: { appendMany: async (r) => { metrics.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", metrics.filter((x) => x.reportId === id)) },
    kpis: { appendMany: async (r) => { kpis.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", kpis.filter((x) => x.reportId === id)) },
    trends: { appendMany: async (r) => { trends.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", trends.filter((x) => x.reportId === id)) },
    forecasts: { appendMany: async (r) => { forecasts.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", forecasts.filter((x) => x.reportId === id)) },
    insights: { appendMany: async (r) => { insights.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", insights.filter((x) => x.reportId === id)) },
    summaries: { append: async (s) => { summaries.set(s.reportId, s); return ok("created", s); }, getByReport: async (id) => ok("found", summaries.get(id) ?? null) },
    sections: { appendMany: async (r) => { sections.push(...r); return ok("created", [...r]); }, listByReport: async (id) => ok("found", sections.filter((x) => x.reportId === id)) },
    narratives: { append: async (n) => { narratives.set(n.reportId, n); return ok("created", n); }, getByReport: async (id) => ok("found", narratives.get(id) ?? null) },
    schedules: { create: async (s) => { schedules.push(s); return ok("created", s); }, listByWorkspace: async (wid) => ok("found", schedules.filter((x) => x.workspaceId === wid)), save: async (next) => { const i = schedules.findIndex((x) => x.id === next.id); if (i >= 0) schedules[i] = next; return ok("updated", next); } },
    feedback: { append: async (f) => { feedback.push(f); return ok("created", f); }, listByReport: async (id) => ok("found", feedback.filter((x) => x.reportId === id)) },
  };
}
