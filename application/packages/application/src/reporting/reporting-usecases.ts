/* =============================================================================
 * AI Reporting use-cases (Phase E · Sprint E6).
 *
 * The intelligence layer. The Observation Collector aggregates the structured
 * outputs of Phase D + E1–E5 through their PUBLIC application read services
 * (never their repositories), preserving provenance and never modifying upstream
 * data. The pipeline then derives metrics → KPIs → trends → forecasts → insights →
 * narrative → executive report. It NEVER executes workflows, regenerates strategy,
 * creates execution plans, schedules external jobs, or sends anything.
 *
 *   Observation → Metric → Trend → KPI → Forecast → Insight → Narrative → Report
 * ========================================================================== */

import {
  buildBusinessInsight, buildBusinessMetric, buildExecutiveReport, buildForecast, buildKpiResult, buildObservationSnapshot,
  buildReportExecutiveSummary, buildReportFeedback, buildReportNarrative, buildReportSchedule, buildReportSection,
  buildTrendAnalysis, canTransitionReport, computeKpis, computeMetrics, analyzeTrends as domainAnalyzeTrends,
  generateForecasts as domainForecasts, generateInsights as domainInsights, reportConfidence,
  type MetricValue, type NormalizedObservations,
} from "@brightloop/domain";
import type { ObservationSnapshot, ObservationSource, ReportFeedbackKind, ReportFrequency, ReportKind } from "@brightloop/schema";
// Upstream PUBLIC application read services (never repositories).
import { getWorkspaceExecution } from "../transformation-execution/execution-read.js";
import { getExecutionDashboard, getExecutionPlanResult, listPlanningSessions } from "../project-manager/planner-read.js";
import { getDeploymentQueue, listExecutionIntents, listWorkspaceWorkflows } from "../automation-builder/builder-read.js";
import { getStrategyResult, listStrategyHistory } from "../strategist/strategy-read.js";
import { getCostDashboard, getUsageDashboard } from "../ai-foundation/ai-read.js";
import { getKnowledgeUsage } from "../knowledge/knowledge-read.js";
import { executePrompt } from "../ai-foundation/execution-engine.js";
import {
  authorize, requireReporting, REPORT_FEEDBACK_CAP, REPORT_GENERATE_CAP, REPORT_PUBLISH_CAP,
  REPORT_SCHEDULE_CAP, REPORT_WRITE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import {
  toExecutiveReportDTO, toObservationSnapshotDTO, toReportFeedbackDTO, toReportScheduleDTO,
  type CollectionResultDTO, type ExecutiveReportDTO, type ReportFeedbackDTO, type ReportScheduleDTO,
} from "./dto.js";

/* ---- helpers --------------------------------------------------------------- */

async function loadReport(ctx: AppContext, reportId: string, cap: string) {
  const rep = requireReporting(ctx);
  const report = unwrap(await rep.reports.getById(reportId));
  if (report === null) throw new NotFoundError("executive report");
  authorize(ctx.actor, cap, report.clientId);
  return { rep, report };
}

/** Best-effort upstream read: a source that fails/absent contributes nothing. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

interface Collected { normalized: NormalizedObservations; snapshots: ObservationSnapshot[] }

/**
 * The Observation Collector. Reads every upstream context via its public service,
 * builds provenance-tagged snapshots, and normalizes counts for the analytics
 * engines. Never mutates upstream data.
 */
async function collect(ctx: AppContext, report: { id: string; workspaceId: string; clientId: string | null }): Promise<Collected> {
  const wsId = report.workspaceId;
  const now = ctx.clock();
  const snapshots: ObservationSnapshot[] = [];
  const snap = (source: ObservationSource, label: string, provenance: Record<string, unknown>, data: Record<string, unknown>) =>
    snapshots.push(buildObservationSnapshot({ id: ctx.ids("obs"), reportId: report.id, workspaceId: wsId, clientId: report.clientId, source, label, provenance, data, observedAt: now, now }));

  // ---- Execution (Phase D actuals) ------------------------------------------
  const wx = await safe(() => getWorkspaceExecution(ctx, wsId), { workspaceId: wsId, tasks: [], reviews: [], dependencies: [], executionReadyInitiativeIds: [] });
  const tasksTotal = wx.tasks.length;
  const tasksCompleted = wx.tasks.filter((t) => t.status === "completed").length;
  const reviewsTotal = wx.reviews.length;
  const reviewsApproved = wx.reviews.filter((r) => r.status === "approved").length;
  snap("execution", "Phase D execution", { service: "getWorkspaceExecution", workspaceId: wsId }, { tasksTotal, tasksCompleted, reviewsTotal, reviewsApproved, dependencies: wx.dependencies.length });

  // ---- Planning (E4) — latest session's dashboard + planned KPIs -------------
  let initiativesTotal = 0, initiativesCompleted = 0, milestonesTotal = 0, milestonesReached = 0, risksTotal = 0;
  const plannedKpis: { name: string; baseline: number; current: number; target: number; owner?: string | null }[] = [];
  const sessions = await safe(() => listPlanningSessions(ctx, wsId), []);
  const approved = sessions.find((s) => s.status === "approved") ?? sessions[0];
  if (approved !== undefined) {
    const dash = await safe(() => getExecutionDashboard(ctx, approved.id), null);
    if (dash !== null) {
      initiativesTotal = dash.initiativeCount; milestonesTotal = dash.milestoneCount; risksTotal = dash.riskCount;
      snap("execution", "E4 execution plan", { service: "getExecutionDashboard", planningSessionId: approved.id }, { initiativeCount: dash.initiativeCount, taskCount: dash.taskCount, milestoneCount: dash.milestoneCount, kpiCount: dash.kpiCount, riskCount: dash.riskCount });
    }
    const result = await safe(() => getExecutionPlanResult(ctx, approved.id), null);
    if (result !== null) {
      for (const k of result.kpis) plannedKpis.push({ name: k.name, baseline: k.baseline, current: k.target * 0.4, target: k.target, owner: null });
      initiativesCompleted = 0; // Phase D holds actual completion; plan is the target set.
      milestonesReached = 0;
    }
  }

  // ---- Automation (E5) ------------------------------------------------------
  const intents = await safe(() => listExecutionIntents(ctx, wsId), []);
  const workflows = await safe(() => listWorkspaceWorkflows(ctx, wsId), []);
  const deployments = await safe(() => getDeploymentQueue(ctx, wsId), []);
  const workflowsPublished = workflows.filter((w) => w.status === "published").length;
  snap("automation", "E5 automation", { service: "listExecutionIntents+listWorkspaceWorkflows+getDeploymentQueue", workspaceId: wsId }, { intentsTotal: intents.length, workflowsTotal: workflows.length, workflowsPublished, deploymentsTotal: deployments.length });

  // ---- Strategy (E3) --------------------------------------------------------
  let strategiesTotal = 0, recommendationsTotal = 0, avgConfidence = 0;
  const strategyHistory = await safe(() => listStrategyHistory(ctx, wsId), []);
  strategiesTotal = strategyHistory.length;
  const latestStrategy = strategyHistory[0];
  if (latestStrategy !== undefined) {
    const sres = await safe(() => getStrategyResult(ctx, latestStrategy.id), null);
    if (sres !== null) {
      recommendationsTotal = sres.recommendations.length;
      risksTotal = Math.max(risksTotal, sres.risks.length);
      avgConfidence = sres.confidence;
      snap("strategy", "E3 strategy", { service: "getStrategyResult", strategySessionId: latestStrategy.id }, { recommendations: sres.recommendations.length, risks: sres.risks.length, confidence: sres.confidence });
    }
  }

  // ---- Knowledge (E2) -------------------------------------------------------
  const ku = await safe(() => getKnowledgeUsage(ctx, wsId), null);
  const documentsTotal = ku?.documents ?? 0;
  const retrievalsTotal = ku?.retrievals ?? 0;
  if (ku !== null) snap("knowledge", "E2 knowledge", { service: "getKnowledgeUsage", workspaceId: wsId }, { documents: ku.documents, chunks: ku.chunks, retrievals: ku.retrievals });

  // ---- AI usage (E1) --------------------------------------------------------
  const usage = await safe(() => getUsageDashboard(ctx, wsId), null);
  const cost = await safe(() => getCostDashboard(ctx, wsId), null);
  const aiTokens = usage?.totalTokens ?? 0;
  const aiCalls = usage?.totalExecutions ?? 0;
  const aiCost = cost?.totalCost ?? 0;
  snap("ai_usage", "E1 AI usage", { service: "getUsageDashboard+getCostDashboard", workspaceId: wsId }, { totalTokens: aiTokens, totalExecutions: aiCalls, totalCost: aiCost });

  if (avgConfidence === 0) avgConfidence = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  const normalized: NormalizedObservations = {
    initiativesTotal, initiativesCompleted, tasksTotal, tasksCompleted, reviewsTotal, reviewsApproved, milestonesTotal, milestonesReached,
    intentsTotal: intents.length, workflowsTotal: workflows.length, workflowsPublished, deploymentsTotal: deployments.length,
    strategiesTotal, recommendationsTotal, risksTotal, documentsTotal, retrievalsTotal, aiTokens, aiCost, aiCalls, avgConfidence, plannedKpis,
  };
  return { normalized, snapshots };
}

/** Build per-metric-key history from prior reports in the workspace + current. */
async function loadHistory(ctx: AppContext, report: { id: string; workspaceId: string }, current: readonly MetricValue[]): Promise<Record<string, number[]>> {
  const rep = requireReporting(ctx);
  const prior = [...unwrap(await rep.reports.listByWorkspace(report.workspaceId))]
    .filter((r) => r.id !== report.id && (r.status === "generated" || r.status === "published"))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .slice(-5);
  const series: Record<string, number[]> = {};
  for (const r of prior) {
    for (const m of unwrap(await rep.metrics.listByReport(r.id))) (series[m.key] ??= []).push(m.value);
  }
  for (const m of current) (series[m.key] ??= []).push(m.value);
  // Keep only keys with at least two points.
  return Object.fromEntries(Object.entries(series).filter(([, s]) => s.length >= 2));
}

/* ---- report creation ------------------------------------------------------- */

export interface CreateReportInput { kind: ReportKind; title: string; period?: string; }

export async function createReport(ctx: AppContext, rawWorkspaceId: unknown, input: CreateReportInput): Promise<ExecutiveReportDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const title = requireString(input.title, "title").trim();
  if (title === "") throw new ValidationError("A report title is required");
  const rep = requireReporting(ctx);
  authorize(ctx.actor, REPORT_WRITE_CAP, ctx.actor.clientId);
  const report = buildExecutiveReport({ id: ctx.ids("rep"), workspaceId, clientId: ctx.actor.clientId, kind: input.kind, title, period: input.period ?? ctx.clock().slice(0, 7), requestedByUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await rep.reports.create(report));
  return toExecutiveReportDTO(report);
}

/* ---- Observation Collector (public) ---------------------------------------- */

export async function collectObservations(ctx: AppContext, rawReportId: unknown): Promise<CollectionResultDTO> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  if (unwrap(await rep.observations.listByReport(reportId)).length > 0) {
    return { reportId, observations: unwrap(await rep.observations.listByReport(reportId)).map(toObservationSnapshotDTO) };
  }
  const started = ctx.clock();
  const { snapshots } = await collect(ctx, report);
  if (snapshots.length > 0) unwrap(await rep.observations.appendMany(snapshots));
  if (canTransitionReport(report.status, "generating")) unwrap(await rep.reports.save({ ...report, status: "generating", collectionDurationMs: Math.max(0, Date.parse(ctx.clock()) - Date.parse(started)), updatedAt: ctx.clock(), version: report.version + 1 }, report.version));
  return { reportId, observations: snapshots.map(toObservationSnapshotDTO) };
}

/* ---- individual engine use-cases (each recollects; deterministic) ---------- */

export async function calculateMetrics(ctx: AppContext, rawReportId: unknown): Promise<number> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  if (unwrap(await rep.metrics.listByReport(reportId)).length > 0) return 0;
  const { normalized } = await collect(ctx, report);
  const metrics = computeMetrics(normalized).map((m) => buildBusinessMetric({ id: ctx.ids("bmet"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, key: m.key, name: m.name, category: m.category, value: m.value, unit: m.unit, sampleSize: m.sampleSize, source: m.source, now: ctx.clock() }));
  unwrap(await rep.metrics.appendMany(metrics));
  return metrics.length;
}

export async function calculateKPIs(ctx: AppContext, rawReportId: unknown): Promise<number> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  if (unwrap(await rep.kpis.listByReport(reportId)).length > 0) return 0;
  const { normalized } = await collect(ctx, report);
  const kpis = computeKpis(normalized).map((k) => buildKpiResult({ id: ctx.ids("kres"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, name: k.name, baseline: k.baseline, current: k.current, target: k.target, variance: k.variance, status: k.status, trend: k.trend, owner: k.owner, now: ctx.clock() }));
  unwrap(await rep.kpis.appendMany(kpis));
  return kpis.length;
}

export async function analyzeTrends(ctx: AppContext, rawReportId: unknown): Promise<number> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  if (unwrap(await rep.trends.listByReport(reportId)).length > 0) return 0;
  const metrics = unwrap(await rep.metrics.listByReport(reportId)).map((m) => ({ key: m.key, value: m.value } as MetricValue));
  const history = await loadHistory(ctx, report, metrics);
  const trends = domainAnalyzeTrends(history).map((t) => buildTrendAnalysis({ id: ctx.ids("trnd"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, metricKey: t.metricKey, direction: t.direction, changePercent: t.changePercent, significant: t.significant, summary: t.summary, periodCount: t.periodCount, now: ctx.clock() }));
  if (trends.length > 0) unwrap(await rep.trends.appendMany(trends));
  return trends.length;
}

export async function generateForecasts(ctx: AppContext, rawReportId: unknown): Promise<number> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  if (unwrap(await rep.forecasts.listByReport(reportId)).length > 0) return 0;
  const metrics = unwrap(await rep.metrics.listByReport(reportId)).map((m) => ({ key: m.key, value: m.value } as MetricValue));
  const history = await loadHistory(ctx, report, metrics);
  const forecasts = domainForecasts(history).map((f) => buildForecast({ id: ctx.ids("fcst"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, kind: f.kind, metricKey: f.metricKey, projectedValue: f.projectedValue, confidence: f.confidence, basis: f.basis, now: ctx.clock() }));
  if (forecasts.length > 0) unwrap(await rep.forecasts.appendMany(forecasts));
  return forecasts.length;
}

export async function generateInsights(ctx: AppContext, rawReportId: unknown): Promise<number> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  if (unwrap(await rep.insights.listByReport(reportId)).length > 0) return 0;
  const metrics = unwrap(await rep.metrics.listByReport(reportId));
  const kpis = unwrap(await rep.kpis.listByReport(reportId));
  const trends = unwrap(await rep.trends.listByReport(reportId));
  const forecasts = unwrap(await rep.forecasts.listByReport(reportId));
  const computed = domainInsights({
    metrics: metrics.map((m) => ({ key: m.key, name: m.name, category: m.category, value: m.value, unit: m.unit, sampleSize: m.sampleSize, source: m.source })),
    kpis: kpis.map((k) => ({ name: k.name, baseline: k.baseline, current: k.current, target: k.target, variance: k.variance, status: k.status, trend: k.trend, owner: k.owner })),
    trends: trends.map((t) => ({ metricKey: t.metricKey, direction: t.direction, changePercent: t.changePercent, significant: t.significant, summary: t.summary, periodCount: t.periodCount })),
    forecasts: forecasts.map((f) => ({ kind: f.kind, metricKey: f.metricKey, projectedValue: f.projectedValue, confidence: f.confidence, basis: f.basis })),
  });
  const insights = computed.map((i) => buildBusinessInsight({ id: ctx.ids("bins"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence, affectedMetrics: i.affectedMetrics, supportingEvidence: i.supportingEvidence, recommendedActions: i.recommendedActions, now: ctx.clock() }));
  if (insights.length > 0) unwrap(await rep.insights.appendMany(insights));
  return insights.length;
}

/* ---- Narrative Generator (E1 Prompt Engine; no hardcoded prompts) ---------- */

export interface GenerateNarrativeInput { promptId?: string; provider?: string; model?: string; sleep?: (ms: number) => Promise<void>; }

export async function generateNarrative(ctx: AppContext, rawReportId: unknown, opts: GenerateNarrativeInput = {}): Promise<{ generatedByAi: boolean; content: string }> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  const existing = unwrap(await rep.narratives.getByReport(reportId));
  if (existing !== null) return { generatedByAi: existing.generatedByAi, content: existing.content };
  const metrics = unwrap(await rep.metrics.listByReport(reportId));
  const kpis = unwrap(await rep.kpis.listByReport(reportId));
  const insights = unwrap(await rep.insights.listByReport(reportId));

  // Deterministic factual digest (this is DATA, never a hardcoded AI prompt).
  const digest = [
    `Report: ${report.title} (${report.kind}, ${report.period}).`,
    `Metrics: ${metrics.map((m) => `${m.name} ${m.value}${m.unit && m.unit !== "count" ? " " + m.unit : ""}`).slice(0, 8).join("; ")}.`,
    `KPIs: ${kpis.map((k) => `${k.name} ${k.current}/${k.target} (${k.status})`).slice(0, 6).join("; ")}.`,
    `Insights: ${insights.map((i) => `${i.title} [${i.severity}]`).slice(0, 6).join("; ")}.`,
  ].join("\n");

  let content = `Executive narrative — ${report.title}\n\n${digest}`;
  let generatedByAi = false, provider: string | null = null, model: string | null = null, tokenTotal = 0, cost = 0;
  const startedAt = ctx.clock();
  // Use the E1 Prompt Engine when a stored prompt is provided and AI is wired.
  if (opts.promptId !== undefined && ctx.ai !== undefined && ctx.aiProviders !== undefined) {
    const exec = await executePrompt(ctx, { promptId: opts.promptId, values: { title: report.title, digest }, provider: opts.provider as never, model: opts.model }, { sleep: opts.sleep });
    content = exec.content.slice(0, 8000);
    generatedByAi = true; provider = exec.provider; model = exec.model; tokenTotal = exec.usage.totalTokens; cost = exec.cost.totalCost;
    const aiMs = Math.max(0, Date.parse(ctx.clock()) - Date.parse(startedAt));
    const cur = unwrap(await rep.reports.getById(reportId));
    if (cur !== null) unwrap(await rep.reports.save({ ...cur, provider, model, promptId: opts.promptId, aiDurationMs: aiMs, tokenTotal: cur.tokenTotal + tokenTotal, cost: cur.cost + cost, updatedAt: ctx.clock(), version: cur.version + 1 }, cur.version));
  }
  const narrative = buildReportNarrative({ id: ctx.ids("narr"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, content, generatedByAi, provider, model, tokenTotal, cost, now: ctx.clock() });
  unwrap(await rep.narratives.append(narrative));
  return { generatedByAi, content };
}

/* ---- orchestrator ---------------------------------------------------------- */

export interface GenerateExecutiveReportInput { promptId?: string; provider?: string; model?: string; sleep?: (ms: number) => Promise<void>; }

export async function generateExecutiveReport(ctx: AppContext, rawReportId: unknown, opts: GenerateExecutiveReportInput = {}): Promise<ExecutiveReportDTO> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_GENERATE_CAP);
  const startedAt = ctx.clock();

  await collectObservations(ctx, reportId);
  await calculateMetrics(ctx, reportId);
  await calculateKPIs(ctx, reportId);
  await analyzeTrends(ctx, reportId);
  await generateForecasts(ctx, reportId);
  await generateInsights(ctx, reportId);
  await generateNarrative(ctx, reportId, opts);

  const [metrics, kpis, insights, forecasts, narrative] = await Promise.all([
    rep.metrics.listByReport(reportId).then(unwrap), rep.kpis.listByReport(reportId).then(unwrap),
    rep.insights.listByReport(reportId).then(unwrap), rep.forecasts.listByReport(reportId).then(unwrap),
    rep.narratives.getByReport(reportId).then(unwrap),
  ]);

  // Executive summary + sections (assembled from the derived analytics).
  if (unwrap(await rep.summaries.getByReport(reportId)) === null) {
    const highlights = insights.slice(0, 4).map((i) => `${i.title} (${i.severity})`);
    const keyMetrics = metrics.slice(0, 5).map((m) => `${m.name}: ${m.value}${m.unit && m.unit !== "count" ? " " + m.unit : ""}`);
    const conf = reportConfidence(metrics.map((m) => ({ key: m.key, name: m.name, category: m.category, value: m.value, unit: m.unit, sampleSize: m.sampleSize, source: m.source })), insights.map((i) => ({ title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence, affectedMetrics: i.affectedMetrics, supportingEvidence: i.supportingEvidence, recommendedActions: i.recommendedActions })));
    unwrap(await rep.summaries.append(buildReportExecutiveSummary({ id: ctx.ids("esum"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, headline: `${report.title}: ${insights.length} insight(s), ${kpis.length} KPI(s)`, highlights, keyMetrics, overallConfidence: conf, now: ctx.clock() })));
  }
  if (unwrap(await rep.sections.listByReport(reportId)).length === 0) {
    const sections = [
      buildReportSection({ id: ctx.ids("sect"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, key: "metrics", title: "Business Metrics", body: metrics.map((m) => `- ${m.name}: ${m.value} ${m.unit}`).join("\n"), order: 0, now: ctx.clock() }),
      buildReportSection({ id: ctx.ids("sect"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, key: "kpis", title: "KPIs", body: kpis.map((k) => `- ${k.name}: ${k.current}/${k.target} (${k.status})`).join("\n"), order: 1, now: ctx.clock() }),
      buildReportSection({ id: ctx.ids("sect"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, key: "insights", title: "Insights", body: insights.map((i) => `- [${i.severity}] ${i.title}`).join("\n"), order: 2, now: ctx.clock() }),
      buildReportSection({ id: ctx.ids("sect"), reportId, workspaceId: report.workspaceId, clientId: report.clientId, key: "narrative", title: "Executive Narrative", body: narrative?.content ?? "", order: 3, now: ctx.clock() }),
    ];
    unwrap(await rep.sections.appendMany(sections));
  }

  const sectionCount = unwrap(await rep.sections.listByReport(reportId)).length;
  const confidence = reportConfidence(metrics.map((m) => ({ key: m.key, name: m.name, category: m.category, value: m.value, unit: m.unit, sampleSize: m.sampleSize, source: m.source })), insights.map((i) => ({ title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence, affectedMetrics: i.affectedMetrics, supportingEvidence: i.supportingEvidence, recommendedActions: i.recommendedActions })));
  const endedAt = ctx.clock();
  const current = unwrap(await rep.reports.getById(reportId));
  if (current !== null && canTransitionReport(current.status, "generated")) {
    unwrap(await rep.reports.save({ ...current, status: "generated", metricCount: metrics.length, forecastCount: forecasts.length, insightCount: insights.length, reportSize: sectionCount, confidence, analysisDurationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)), generationDurationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)), updatedAt: endedAt, version: current.version + 1 }, current.version));
  }
  return toExecutiveReportDTO(unwrap(await rep.reports.getById(reportId))!);
}

/* ---- publication ----------------------------------------------------------- */

export async function publishReport(ctx: AppContext, rawReportId: unknown): Promise<ExecutiveReportDTO> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_PUBLISH_CAP);
  if (report.status === "published") return toExecutiveReportDTO(report);
  if (!canTransitionReport(report.status, "published")) throw new ConflictError(`Cannot publish a ${report.status} report`);
  const next = { ...report, status: "published" as const, updatedAt: ctx.clock(), version: report.version + 1 };
  unwrap(await rep.reports.save(next, report.version));
  return toExecutiveReportDTO(next);
}

/* ---- schedule (config only — nothing runs it) ------------------------------ */

export interface CreateReportScheduleInput { kind: ReportKind; frequency: ReportFrequency; recipientsNote?: string; }

export async function createReportSchedule(ctx: AppContext, rawWorkspaceId: unknown, input: CreateReportScheduleInput): Promise<ReportScheduleDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const rep = requireReporting(ctx);
  authorize(ctx.actor, REPORT_SCHEDULE_CAP, ctx.actor.clientId);
  const schedule = buildReportSchedule({ id: ctx.ids("rsch"), workspaceId, clientId: ctx.actor.clientId, kind: input.kind, frequency: input.frequency, recipientsNote: input.recipientsNote ?? "", createdByUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await rep.schedules.create(schedule));
  return toReportScheduleDTO(schedule);
}

/* ---- feedback -------------------------------------------------------------- */

export interface SubmitReportFeedbackInput { kind: ReportFeedbackKind; rating?: number | null; comment?: string | null; }

export async function submitReportFeedback(ctx: AppContext, rawReportId: unknown, input: SubmitReportFeedbackInput): Promise<ReportFeedbackDTO> {
  const reportId = requireId(rawReportId, "reportId");
  const { rep, report } = await loadReport(ctx, reportId, REPORT_FEEDBACK_CAP);
  const feedback = buildReportFeedback(ctx.ids("rfb"), reportId, report.workspaceId, report.clientId, input.kind, input.rating ?? null, input.comment ?? null, ctx.actor.userId, ctx.clock());
  unwrap(await rep.feedback.append(feedback));
  return toReportFeedbackDTO(feedback);
}
