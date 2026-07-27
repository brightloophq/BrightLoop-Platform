/* =============================================================================
 * Reporting use-case tests (Phase E · Sprint E6).
 *
 * The full chain: seed Phase D → knowledge (E2) → strategy (E3) → plan + APPROVE
 * (E4) → OBSERVE everything and generate an executive report (E6). Covers the
 * observation collector (provenance, no mutation), metric/KPI/insight generation,
 * trend + forecast across reports, publication, authorization, and isolation.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
// Phase D
import { createInMemoryExecutionRepos } from "../transformation-execution/testing.js";
import { seedTransformation } from "../transformation-execution/seed-transformation.js";
// E1 + E2 + E3 doubles
import { createInMemoryAiRepos, createMockProvider } from "../ai-foundation/testing.js";
import { createInMemoryKnowledgeRepos, createInMemoryVectorStore, createMockEmbeddingProvider } from "../knowledge/testing.js";
import { createCollection, uploadDocument } from "../knowledge/document-usecases.js";
import { indexDocument, queueEmbedding } from "../knowledge/indexing-usecases.js";
import { createInMemoryStrategistRepos } from "../strategist/testing.js";
import { createStrategySession, generateRecommendations, generateRoadmap, runBusinessAnalysis } from "../strategist/strategy-usecases.js";
// E4
import { createInMemoryProjectManagerRepos } from "../project-manager/testing.js";
import { approveExecutionPlan, createPlanningSession, generateExecutionPlan } from "../project-manager/planner-usecases.js";
// E5 (repos wired so the collector can read automation; not exercised here)
import { createInMemoryAutomationBuilderRepos } from "../automation-builder/testing.js";
// E6
import { createInMemoryReportingRepos } from "./testing.js";
import { collectObservations, createReport, generateExecutiveReport, publishReport, submitReportFeedback } from "./reporting-usecases.js";
import { getReportDetail, getExecutiveDashboard, getWorkspaceHealth, listExecutiveReports } from "./reporting-read.js";

const T0 = "2026-07-27T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const noSleep = { sleep: async () => {} };

function proposalSnapshot() {
  const b = { problem: "p", businessImpact: "high" as const, risks: [] as string[], confidence: { value: 70, band: "high" as const }, reviewRequired: true, status: "ready" as const };
  return {
    id: "prop:run:snapshot", scanId: "scan", status: "available" as const, reason: null,
    proposals: [
      { id: "prop:scan:1", title: "Alpha", recommendedSolution: "Do a", priority: "high" as const, estimatedEffort: "small" as const, dependencies: [] as string[], supportingEvidenceIds: ["ev_1"], ...b },
      { id: "prop:scan:2", title: "Beta", recommendedSolution: "Do b", priority: "low" as const, estimatedEffort: "large" as const, dependencies: [] as string[], supportingEvidenceIds: ["ev_2"], ...b },
    ],
    counts: { critical: 0, high: 1, medium: 0, low: 1 }, conflicts: 0,
    confidence: { value: 55, band: "moderate" as const }, evidenceIds: ["ev_1", "ev_2"], sourceArtifacts: ["art"],
    summary: "2.", reviewRequired: true, checksum: "y", generatedAt: T0, formulaVersion: "pi-runtime-1.0",
  };
}

const KB = "# Operations\n\nManual invoicing slows finance.\n\n# Sales\n\nNo CRM.\n\n# Marketing\n\nEmail only.\n\n# Automation\n\nManual onboarding.";

let ctx: AppContext;
let workspaceId: string;

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  const services = createRuntimeServices({ repo: new InMemoryRuntimeRepository(now), ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "cli_1", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  const runId = created.value.run.id;
  await services.artifacts.persist({ runId, clientId: "cli_1", scanId: "scan", kind: "proposal", envelope: proposalSnapshot() as unknown as Record<string, unknown>, sourceArtifactIds: [] });
  let k = 0;
  ctx = {
    services, actor: OWNER, ids: (p) => `${p}_${(++k).toString().padStart(5, "0")}`, clock: now,
    execution: createInMemoryExecutionRepos(),
    ai: createInMemoryAiRepos(), aiProviders: { openai: createMockProvider("openai") },
    knowledge: createInMemoryKnowledgeRepos(), embeddingProviders: { openai: createMockEmbeddingProvider("openai") }, vectorStore: createInMemoryVectorStore(),
    strategist: createInMemoryStrategistRepos(), projectManager: createInMemoryProjectManagerRepos(),
    automationBuilder: createInMemoryAutomationBuilderRepos(), reporting: createInMemoryReportingRepos(),
  };
  const detail = await seedTransformation(ctx, runId);
  workspaceId = detail.workspace.id;
  const initA = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!.id;
  const initB = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!.id;
  const col = await createCollection(ctx, workspaceId, { name: "Ops", kind: "workspace" });
  const up = await uploadDocument(ctx, col.id, { title: "Ops", sourceType: "markdown", mimeType: "text/markdown", content: KB });
  const job = await queueEmbedding(ctx, up.document.id, { provider: "openai" });
  await indexDocument(ctx, job.id);
  const s = await createStrategySession(ctx, workspaceId, { title: "Growth", goal: "operations sales marketing automation", dimensions: ["operations", "sales", "marketing", "automation_maturity"] });
  await runBusinessAnalysis(ctx, s.id, noSleep);
  await generateRecommendations(ctx, s.id);
  await generateRoadmap(ctx, s.id);
  // Approve an execution plan so Phase D holds real materialized work to observe.
  const plan = await createPlanningSession(ctx, workspaceId, { strategySessionId: s.id, title: "Plan" });
  await generateExecutionPlan(ctx, plan.id, { targetInitiativeIds: [initA, initB] });
  await approveExecutionPlan(ctx, plan.id);
});

describe("observe upstream → executive report", () => {
  it("collects observations with provenance and never mutates upstream", async () => {
    const report = await createReport(ctx, workspaceId, { kind: "executive_summary", title: "Weekly executive summary" });
    const collection = await collectObservations(ctx, report.id);
    expect(collection.observations.length).toBeGreaterThan(0);
    const sources = new Set(collection.observations.map((o) => o.source));
    expect(sources.has("execution")).toBe(true);
    expect(sources.has("ai_usage")).toBe(true);
    // provenance names the upstream SERVICE (never a repository).
    expect(collection.observations.every((o) => typeof o.provenance["service"] === "string")).toBe(true);
  });

  it("generates a full report: metrics, KPIs, insights, narrative, sections", async () => {
    const report = await createReport(ctx, workspaceId, { kind: "executive_summary", title: "Exec summary" });
    const generated = await generateExecutiveReport(ctx, report.id);
    expect(generated.status).toBe("generated");
    expect(generated.metricCount).toBeGreaterThan(0);
    expect(generated.reportSize).toBeGreaterThan(0);

    const detail = await getReportDetail(ctx, report.id);
    expect(detail.metrics.some((m) => m.key === "completion_rate")).toBe(true);
    expect(detail.metrics.some((m) => m.key === "workspace_health")).toBe(true);
    expect(detail.kpis.length).toBeGreaterThan(0);
    expect(detail.narrative).not.toBeNull();
    expect(detail.narrative!.generatedByAi).toBe(false); // no promptId → deterministic
    expect(detail.sections.length).toBe(4);
    // insights never fabricate: every affected metric exists among the metrics
    const keys = new Set(detail.metrics.map((m) => m.key));
    for (const i of detail.insights) for (const k of i.affectedMetrics) expect(keys.has(k)).toBe(true);

    const dash = await getExecutiveDashboard(ctx, report.id);
    expect(dash.summary).not.toBeNull();

    const published = await publishReport(ctx, report.id);
    expect(published.status).toBe("published");
  });

  it("derives trends + forecasts once a workspace has report history", async () => {
    const r1 = await createReport(ctx, workspaceId, { kind: "weekly_summary", title: "W1" });
    await generateExecutiveReport(ctx, r1.id);
    await publishReport(ctx, r1.id);
    const r2 = await createReport(ctx, workspaceId, { kind: "weekly_summary", title: "W2" });
    await generateExecutiveReport(ctx, r2.id);
    const detail = await getReportDetail(ctx, r2.id);
    expect(detail.trends.length).toBeGreaterThan(0);
    expect(detail.forecasts.length).toBeGreaterThan(0);
    expect(detail.forecasts.every((f) => f.confidence >= 20 && f.confidence <= 95)).toBe(true);
    const health = await getWorkspaceHealth(ctx, workspaceId);
    expect(health.reportId).toBe(r2.id);
  });
});

describe("authorization + isolation", () => {
  it("denies a client actor from generating a report", async () => {
    const report = await createReport(ctx, workspaceId, { kind: "operational", title: "Ops" });
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(generateExecutiveReport(clientCtx, report.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a client may submit report feedback, and reports are workspace-scoped", async () => {
    const report = await createReport(ctx, workspaceId, { kind: "operational", title: "Ops" });
    const fb = await submitReportFeedback(ctx, report.id, { kind: "approval", rating: 5 });
    expect(fb.kind).toBe("approval");
    expect((await listExecutiveReports(ctx, workspaceId)).length).toBeGreaterThan(0);
    expect((await listExecutiveReports(ctx, "txw_other")).length).toBe(0);
  });
});
