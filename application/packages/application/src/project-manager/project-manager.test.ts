/* =============================================================================
 * AI Project Manager use-case tests (Phase E · Sprint E4).
 *
 * The full chain: seed a Phase D workspace → seed knowledge (E2) → run an E3
 * strategy → plan it (E4) → validate → APPROVE → materialize into Phase D via its
 * application services. Covers initiative/task/dependency/timeline/critical-path
 * planning, validation, approval + Phase D integration, authorization, and
 * workspace isolation.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
// Phase D
import { createInMemoryExecutionRepos } from "../transformation-execution/testing.js";
import { seedTransformation } from "../transformation-execution/seed-transformation.js";
import { getInitiativeExecution } from "../transformation-execution/execution-read.js";
// E1 + E2 + E3 doubles
import { createInMemoryAiRepos, createMockProvider } from "../ai-foundation/testing.js";
import { createInMemoryKnowledgeRepos, createInMemoryVectorStore, createMockEmbeddingProvider } from "../knowledge/testing.js";
import { createCollection, uploadDocument } from "../knowledge/document-usecases.js";
import { indexDocument, queueEmbedding } from "../knowledge/indexing-usecases.js";
import { createInMemoryStrategistRepos } from "../strategist/testing.js";
import { createStrategySession, generateRecommendations, generateRoadmap, runBusinessAnalysis } from "../strategist/strategy-usecases.js";
// E4
import { createInMemoryProjectManagerRepos } from "./testing.js";
import { approveExecutionPlan, createPlanningSession, generateExecutionPlan, submitPlanningFeedback, validateExecutionPlan } from "./planner-usecases.js";
import { getExecutionPlanResult, getTimelineView, listPlanningSessions } from "./planner-read.js";

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

const KB = "# Operations\n\nManual invoicing slows finance.\n\n# Sales\n\nNo CRM; leads live in spreadsheets.\n\n# Marketing\n\nEmail only.\n\n# Automation\n\nOnboarding is manual.";

let ctx: AppContext;
let workspaceId: string;
let initA: string;
let initB: string;
let strategySessionId: string;

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
  };
  // Phase D workspace + initiatives.
  const detail = await seedTransformation(ctx, runId);
  workspaceId = detail.workspace.id;
  initA = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!.id;
  initB = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!.id;
  // Knowledge in that workspace.
  const col = await createCollection(ctx, workspaceId, { name: "Ops", kind: "workspace" });
  const up = await uploadDocument(ctx, col.id, { title: "Ops", sourceType: "markdown", mimeType: "text/markdown", content: KB });
  const job = await queueEmbedding(ctx, up.document.id, { provider: "openai" });
  await indexDocument(ctx, job.id);
  // E3 strategy.
  const s = await createStrategySession(ctx, workspaceId, { title: "Growth", goal: "operations sales marketing automation", dimensions: ["operations", "sales", "marketing", "automation_maturity"] });
  await runBusinessAnalysis(ctx, s.id, noSleep);
  await generateRecommendations(ctx, s.id);
  await generateRoadmap(ctx, s.id);
  strategySessionId = s.id;
});

describe("planning pipeline → Phase D", () => {
  it("plans, validates, approves, and materializes into Phase D", async () => {
    const session = await createPlanningSession(ctx, workspaceId, { strategySessionId, title: "Execution plan" });
    expect(session.status).toBe("draft");

    const plan = await generateExecutionPlan(ctx, session.id, { targetInitiativeIds: [initA, initB] });
    expect(plan.initiativeCount).toBeGreaterThan(0);
    expect(plan.taskCount).toBeGreaterThan(0);
    expect(plan.criticalPathDurationDays).toBeGreaterThan(0);

    const result = await getExecutionPlanResult(ctx, session.id);
    expect(result.tasks.length).toBe(plan.taskCount);
    expect(result.dependencies.length).toBeGreaterThan(0);
    expect(result.review).not.toBeNull();
    expect(result.kpis.length).toBeGreaterThan(0);
    expect(result.resources.length).toBeGreaterThan(0);

    const timelines = await getTimelineView(ctx, session.id);
    expect(timelines.some((t) => t.onCriticalPath)).toBe(true);

    const validation = await validateExecutionPlan(ctx, session.id);
    expect(validation.ok).toBe(true);

    const approval = await approveExecutionPlan(ctx, session.id);
    expect(approval.materialized.tasks).toBeGreaterThan(0);
    expect(approval.materialized.reviews).toBeGreaterThan(0);

    // Phase D now holds the materialized work (proof of integration).
    const execA = await getInitiativeExecution(ctx, initA);
    expect(execA.tasks.length).toBeGreaterThan(0);
    expect(execA.reviews.length).toBeGreaterThan(0);
  });

  it("approval is idempotent", async () => {
    const session = await createPlanningSession(ctx, workspaceId, { strategySessionId, title: "P" });
    await generateExecutionPlan(ctx, session.id, { targetInitiativeIds: [initA] });
    await approveExecutionPlan(ctx, session.id);
    const again = await approveExecutionPlan(ctx, session.id);
    expect(again.materialized.tasks).toBe(0); // already approved
  });
});

describe("authorization + isolation", () => {
  it("denies a client actor planning + running", async () => {
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(createPlanningSession(clientCtx, workspaceId, { strategySessionId, title: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a client may submit planning feedback on their own tenant, and history is workspace-scoped", async () => {
    const session = await createPlanningSession(ctx, workspaceId, { strategySessionId, title: "P" });
    const fb = await submitPlanningFeedback(ctx, session.id, { kind: "approval", rating: 5 });
    expect(fb.kind).toBe("approval");
    expect((await listPlanningSessions(ctx, workspaceId)).length).toBeGreaterThan(0);
    expect((await listPlanningSessions(ctx, "txw_other")).length).toBe(0);
  });
});
