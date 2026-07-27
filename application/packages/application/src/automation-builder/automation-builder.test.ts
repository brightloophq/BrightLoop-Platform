/* =============================================================================
 * Automation Builder use-case tests (Phase E · Sprint E5).
 *
 * The full chain: seed Phase D → knowledge (E2) → strategy (E3) → plan + APPROVE
 * (E4) → create an ExecutionIntent → build the workflow → validate → simulate →
 * publish (immutable version) → prepare a deployment package. Covers intent
 * gating (approved-plan-only), the workflow graph, validation, simulation,
 * versioning + rollback, deployment packages, authorization, workspace isolation.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError } from "../errors.js";
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
// E5
import { createInMemoryAutomationBuilderRepos } from "./testing.js";
import {
  buildWorkflow, createExecutionIntent, generateAutomationPlan, generateDeploymentPackage, publishWorkflow,
  rollbackWorkflow, simulateWorkflow, submitAutomationFeedback, validateWorkflow,
} from "./builder-usecases.js";
import { getAutomationDashboard, getDeploymentQueue, getVersionHistory, listExecutionIntents, listWorkflows } from "./builder-read.js";

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

/** Seed E1–E3 + a Phase D workspace, returning an APPROVED E4 planning session. */
async function approvedPlanningSession(): Promise<string> {
  const session = await createPlanningSession(ctx, workspaceId, { strategySessionId, title: "Execution plan" });
  await generateExecutionPlan(ctx, session.id, { targetInitiativeIds: [initA, initB] });
  await approveExecutionPlan(ctx, session.id);
  return session.id;
}

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
    automationBuilder: createInMemoryAutomationBuilderRepos(),
  };
  const detail = await seedTransformation(ctx, runId);
  workspaceId = detail.workspace.id;
  initA = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!.id;
  initB = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!.id;
  const col = await createCollection(ctx, workspaceId, { name: "Ops", kind: "workspace" });
  const up = await uploadDocument(ctx, col.id, { title: "Ops", sourceType: "markdown", mimeType: "text/markdown", content: KB });
  const job = await queueEmbedding(ctx, up.document.id, { provider: "openai" });
  await indexDocument(ctx, job.id);
  const s = await createStrategySession(ctx, workspaceId, { title: "Growth", goal: "operations sales marketing automation", dimensions: ["operations", "sales", "marketing", "automation_maturity"] });
  await runBusinessAnalysis(ctx, s.id, noSleep);
  await generateRecommendations(ctx, s.id);
  await generateRoadmap(ctx, s.id);
  strategySessionId = s.id;
});

describe("approved plan → automation workflow", () => {
  it("creates an intent, builds a valid DAG, simulates, publishes, and packages", async () => {
    const planningSessionId = await approvedPlanningSession();
    const intent = await createExecutionIntent(ctx, workspaceId, { planningSessionId, title: "Onboarding automation" });
    expect(intent.status).toBe("draft");
    expect(intent.executionPlanId).not.toBeNull();

    await generateAutomationPlan(ctx, intent.id);
    const detail = await buildWorkflow(ctx, intent.id);
    expect(detail.steps.length).toBeGreaterThan(0);
    expect(detail.steps.some((s) => s.kind === "trigger")).toBe(true);
    expect(detail.steps.some((s) => s.kind === "action")).toBe(true);
    expect(detail.triggers.length).toBe(1);
    expect(detail.integrations.every((b) => b.bound)).toBe(true);

    const validation = await validateWorkflow(ctx, detail.workflow.id);
    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);

    const sim = await simulateWorkflow(ctx, detail.workflow.id);
    expect(sim.ok).toBe(true);
    expect(sim.executionOrder[0]).toBe("trigger");
    expect(sim.estimatedRuntimeMs).toBeGreaterThan(0);

    const version = await publishWorkflow(ctx, detail.workflow.id);
    expect(version.version).toBe(1);
    expect(version.status).toBe("published");

    const pkg = await generateDeploymentPackage(ctx, detail.workflow.id, { target: "n8n" });
    expect(pkg.target).toBe("n8n");
    expect(pkg.status).toBe("ready");
    expect(pkg.checksum.length).toBeGreaterThan(0);

    // Read models reflect the built automation.
    expect((await listExecutionIntents(ctx, workspaceId)).length).toBe(1);
    expect((await listWorkflows(ctx, intent.id)).length).toBe(1);
    expect((await getDeploymentQueue(ctx, workspaceId)).length).toBe(1);
    const dash = await getAutomationDashboard(ctx, intent.id);
    expect(dash.workflowCount).toBe(1);
    expect(dash.deploymentCount).toBe(1);
  });

  it("rolls back to an earlier immutable version", async () => {
    const planningSessionId = await approvedPlanningSession();
    const intent = await createExecutionIntent(ctx, workspaceId, { planningSessionId, title: "A" });
    const detail = await buildWorkflow(ctx, intent.id);
    await publishWorkflow(ctx, detail.workflow.id); // v1
    await publishWorkflow(ctx, detail.workflow.id); // v2
    const rolled = await rollbackWorkflow(ctx, detail.workflow.id, { toVersion: 1 });
    expect(rolled.version).toBe(3);
    const history = await getVersionHistory(ctx, detail.workflow.id);
    expect(history.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("build is idempotent (returns the existing workflow)", async () => {
    const planningSessionId = await approvedPlanningSession();
    const intent = await createExecutionIntent(ctx, workspaceId, { planningSessionId, title: "A" });
    const a = await buildWorkflow(ctx, intent.id);
    const b = await buildWorkflow(ctx, intent.id);
    expect(b.workflow.id).toBe(a.workflow.id);
    expect((await listWorkflows(ctx, intent.id)).length).toBe(1);
  });
});

describe("intent gating", () => {
  it("refuses to create an intent from a plan that is not approved", async () => {
    const session = await createPlanningSession(ctx, workspaceId, { strategySessionId, title: "P" });
    await generateExecutionPlan(ctx, session.id, { targetInitiativeIds: [initA] }); // planned, NOT approved
    await expect(createExecutionIntent(ctx, workspaceId, { planningSessionId: session.id, title: "X" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("authorization + isolation", () => {
  it("denies a client actor from creating an intent", async () => {
    const planningSessionId = await approvedPlanningSession();
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(createExecutionIntent(clientCtx, workspaceId, { planningSessionId, title: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a client may submit automation feedback, and intents are workspace-scoped", async () => {
    const planningSessionId = await approvedPlanningSession();
    const intent = await createExecutionIntent(ctx, workspaceId, { planningSessionId, title: "A" });
    const fb = await submitAutomationFeedback(ctx, intent.id, { kind: "approval", rating: 5 });
    expect(fb.kind).toBe("approval");
    expect((await listExecutionIntents(ctx, workspaceId)).length).toBe(1);
    expect((await listExecutionIntents(ctx, "txw_other")).length).toBe(0);
  });
});
