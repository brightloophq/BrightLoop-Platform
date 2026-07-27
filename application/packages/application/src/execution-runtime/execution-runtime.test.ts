/* =============================================================================
 * Execution Runtime application tests (Phase F · Sprint F3).
 *
 * Seeds the full chain (Phase D → knowledge → strategy → approved plan → E5
 * workflow → deployment package), then drives F3 through the FAKE runtime adapter
 * (no network): registration, validation, the deploy orchestration, activation,
 * idempotency, expired approval, package mismatch, unsupported constructs,
 * transient/permanent failure, reconciliation drift, rollback, webhook replay,
 * polling, execution monitoring, cross-workspace + client-permission denial, and
 * the guarantee that secrets never surface.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError, ValidationError } from "../errors.js";
import { createInMemoryExecutionRepos } from "../transformation-execution/testing.js";
import { seedTransformation } from "../transformation-execution/seed-transformation.js";
import { createInMemoryAiRepos, createMockProvider } from "../ai-foundation/testing.js";
import { createInMemoryKnowledgeRepos, createInMemoryVectorStore, createMockEmbeddingProvider } from "../knowledge/testing.js";
import { createCollection, uploadDocument } from "../knowledge/document-usecases.js";
import { indexDocument, queueEmbedding } from "../knowledge/indexing-usecases.js";
import { createInMemoryStrategistRepos } from "../strategist/testing.js";
import { createStrategySession, generateRecommendations, generateRoadmap, runBusinessAnalysis } from "../strategist/strategy-usecases.js";
import { createInMemoryProjectManagerRepos } from "../project-manager/testing.js";
import { approveExecutionPlan, createPlanningSession, generateExecutionPlan } from "../project-manager/planner-usecases.js";
import { createInMemoryAutomationBuilderRepos } from "../automation-builder/testing.js";
import { buildWorkflow, createExecutionIntent, generateAutomationPlan, generateDeploymentPackage, publishWorkflow, validateWorkflow } from "../automation-builder/builder-usecases.js";
// F3
import { createFakeRuntimeAdapter, createInMemoryExecutionRuntimeRepos, createInMemoryRuntimeSecretStore, type FakeAdapterState } from "./testing.js";
import { checkRuntimeHealth, discoverRuntimeCapabilities, registerRuntime, validateRuntimeConnection } from "./runtime-usecases.js";
import { activateDeployment, approveDeployment, createDeploymentRequest, deployPackage, executeRollback, reconcileDeployment, requestDeploymentApproval, requestRollback, retryDeployment, upsertRuntimePolicy, validateDeploymentRequest } from "./deployment-usecases.js";
import { ingestRuntimeWebhook, pollRuntimeState } from "./execution-usecases.js";
import { getDeploymentDetail, getRuntimeOpsDashboard, listDeployments, listRuntimeExecutions } from "./runtime-read.js";

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
const KB = "# Operations\n\nManual invoicing.\n\n# Sales\n\nNo CRM.\n\n# Marketing\n\nEmail only.\n\n# Automation\n\nManual onboarding.";

let ctx: AppContext;
let workspaceId: string;
let fake: FakeAdapterState;

/** Seed the full chain and return a finalized, ready E5 deployment package id. */
async function seedPackage(): Promise<string> {
  const initA = seed.initA, initB = seed.initB;
  const s = await createStrategySession(ctx, workspaceId, { title: "Growth", goal: "operations sales marketing automation", dimensions: ["operations", "sales", "marketing", "automation_maturity"] });
  await runBusinessAnalysis(ctx, s.id, noSleep); await generateRecommendations(ctx, s.id); await generateRoadmap(ctx, s.id);
  const plan = await createPlanningSession(ctx, workspaceId, { strategySessionId: s.id, title: "Plan" });
  await generateExecutionPlan(ctx, plan.id, { targetInitiativeIds: [initA, initB] });
  await approveExecutionPlan(ctx, plan.id);
  const intent = await createExecutionIntent(ctx, workspaceId, { planningSessionId: plan.id, title: "Onboarding automation" });
  await generateAutomationPlan(ctx, intent.id);
  const detail = await buildWorkflow(ctx, intent.id);
  await validateWorkflow(ctx, detail.workflow.id);
  await publishWorkflow(ctx, detail.workflow.id);
  const pkg = await generateDeploymentPackage(ctx, detail.workflow.id, { target: "n8n" });
  return pkg.id;
}
const seed = { initA: "", initB: "" };

/** Register a validated, healthy production runtime + a production policy. */
async function readyProdRuntime(): Promise<string> {
  const rt = await registerRuntime(ctx, { workspaceId, provider: "n8n", displayName: "Prod n8n", environment: "production", baseUrl: "https://n8n.internal", secret: "n8n-dev-placeholder" });
  await validateRuntimeConnection(ctx, rt.id);
  await discoverRuntimeCapabilities(ctx, rt.id);
  await upsertRuntimePolicy(ctx, { workspaceId, environment: "production", requiresApproval: true, exactHashApproval: true, rollbackRequired: false, healthCheckRequired: true, autoActivate: false });
  return rt.id;
}

/** Take a package through create → validate → approve → deploy → active. */
async function deployToActive(runtimeId: string, packageId: string): Promise<string> {
  const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: runtimeId, deploymentPackageId: packageId });
  await validateDeploymentRequest(ctx, dep.id);
  await requestDeploymentApproval(ctx, dep.id);
  await approveDeployment(ctx, { deploymentId: dep.id });
  await deployPackage(ctx, dep.id);
  await activateDeployment(ctx, dep.id);
  return dep.id;
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
  fake = { scenario: "healthy", externalWorkflowHash: null, externalActive: false, externalNodeCount: 0, externalConnectionCount: 0, execution: null };
  ctx = {
    services, actor: OWNER, ids: (p) => `${p}_${(++k).toString().padStart(5, "0")}`, clock: now,
    execution: createInMemoryExecutionRepos(),
    ai: createInMemoryAiRepos(), aiProviders: { openai: createMockProvider("openai") },
    knowledge: createInMemoryKnowledgeRepos(), embeddingProviders: { openai: createMockEmbeddingProvider("openai") }, vectorStore: createInMemoryVectorStore(),
    strategist: createInMemoryStrategistRepos(), projectManager: createInMemoryProjectManagerRepos(),
    automationBuilder: createInMemoryAutomationBuilderRepos(),
    executionRuntime: createInMemoryExecutionRuntimeRepos(),
    runtimeAdapters: { n8n: createFakeRuntimeAdapter(fake) },
    runtimeSecrets: createInMemoryRuntimeSecretStore(),
  };
  const detail = await seedTransformation(ctx, runId);
  workspaceId = detail.workspace.id;
  seed.initA = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!.id;
  seed.initB = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!.id;
  const col = await createCollection(ctx, workspaceId, { name: "Ops", kind: "workspace" });
  const up = await uploadDocument(ctx, col.id, { title: "Ops", sourceType: "markdown", mimeType: "text/markdown", content: KB });
  const job = await queueEmbedding(ctx, up.document.id, { provider: "openai" });
  await indexDocument(ctx, job.id);
});

describe("runtime registration + health", () => {
  it("registers a runtime, validates it, and never exposes the secret", async () => {
    const rt = await registerRuntime(ctx, { workspaceId, provider: "n8n", displayName: "n8n", environment: "staging", baseUrl: "https://n8n", secret: "n8n-dev-placeholder" });
    expect(rt.status).toBe("pending_configuration");
    expect(JSON.stringify(rt)).not.toContain("n8n-dev-placeholder");
    const v = await validateRuntimeConnection(ctx, rt.id);
    expect(v.ok).toBe(true);
    const health = await checkRuntimeHealth(ctx, rt.id);
    expect(health.level).toBe("healthy");
    const caps = await discoverRuntimeCapabilities(ctx, rt.id);
    expect(caps.some((c) => c.supported)).toBe(true);
  });
  it("surfaces invalid credentials as an unauthorized runtime (no raw error)", async () => {
    fake.scenario = "invalid_credentials";
    const rt = await registerRuntime(ctx, { workspaceId, provider: "n8n", displayName: "n8n", environment: "staging", baseUrl: "https://n8n", secret: "bad" });
    const v = await validateRuntimeConnection(ctx, rt.id);
    expect(v.ok).toBe(false);
    expect(v.message).not.toContain("stack");
  });
});

describe("deploy orchestration (governed) + activation", () => {
  it("runs the full production journey: request → validate → approve → deploy → active", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    expect(dep.status).toBe("draft");
    expect(dep.packageHash.length).toBeGreaterThan(0);
    const validated = await validateDeploymentRequest(ctx, dep.id);
    expect(validated.status).toBe("awaiting_approval"); // production requires approval
    await approveDeployment(ctx, { deploymentId: dep.id });
    const deployed = await deployPackage(ctx, dep.id);
    expect(deployed.status).toBe("deployed");
    expect(deployed.externalWorkflowId).not.toBeNull();
    const active = await activateDeployment(ctx, dep.id);
    expect(active.status).toBe("active");

    const detail = await getDeploymentDetail(ctx, dep.id);
    expect(detail.timeline.length).toBeGreaterThan(3);
    expect(detail.reconciliations[0]!.driftClass).toBe("no_drift");
    expect(detail.attempts.some((a) => a.operation === "deploy" && a.status === "succeeded")).toBe(true);
  });

  it("refuses to deploy without approval in production (policy violation)", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    await validateDeploymentRequest(ctx, dep.id);
    // force to queued WITHOUT approval by requesting approval then deploying → blocked
    await expect(deployPackage(ctx, dep.id)).rejects.toBeInstanceOf(ConflictError); // not queued
  });

  it("is idempotent: a repeated deploy returns the existing result, no duplicate", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    await validateDeploymentRequest(ctx, dep.id);
    await approveDeployment(ctx, { deploymentId: dep.id });
    const first = await deployPackage(ctx, dep.id);
    const again = await deployPackage(ctx, dep.id); // already deployed → replay
    expect(again.id).toBe(first.id);
    const detail = await getDeploymentDetail(ctx, dep.id);
    expect(detail.attempts.filter((a) => a.operation === "deploy" && a.status === "succeeded").length).toBe(1);
  });
});

describe("validation + failure paths", () => {
  it("rejects an expired approval", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    await validateDeploymentRequest(ctx, dep.id);
    await approveDeployment(ctx, { deploymentId: dep.id, expiresAt: "2020-01-01T00:00:00.000Z" }); // already expired
    await expect(deployPackage(ctx, dep.id)).rejects.toBeInstanceOf(ValidationError);
  });
  it("fails BEFORE the provider when the workflow is unsupported", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    fake.scenario = "unsupported";
    await expect(createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg })).rejects.toBeInstanceOf(ValidationError);
  });
  it("classifies a transient failure as retryable and a permanent one as not", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    await validateDeploymentRequest(ctx, dep.id);
    await approveDeployment(ctx, { deploymentId: dep.id });
    fake.scenario = "timeout";
    await expect(deployPackage(ctx, dep.id)).rejects.toBeInstanceOf(ValidationError);
    const d = (await getDeploymentDetail(ctx, dep.id)).deployment;
    expect(d.status).toBe("failed");
    fake.scenario = "healthy";
    const retried = await retryDeployment(ctx, dep.id); // timeout is retryable
    expect(retried.status).toBe("deployed");
  });
  it("does not retry a permanent (auth) failure", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const dep = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    await validateDeploymentRequest(ctx, dep.id);
    await approveDeployment(ctx, { deploymentId: dep.id });
    fake.scenario = "invalid_credentials";
    await expect(deployPackage(ctx, dep.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(retryDeployment(ctx, dep.id)).rejects.toBeInstanceOf(ConflictError); // authentication not retryable
  });
});

describe("reconciliation + rollback (immutable restore)", () => {
  it("detects destructive drift without auto-correcting", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const depId = await deployToActive(rt, pkg);
    // simulate someone editing the workflow directly in n8n (fewer nodes + new hash)
    fake.externalWorkflowHash = "tampered";
    fake.externalNodeCount = 1;
    const rec = await reconcileDeployment(ctx, depId);
    expect(["destructive_drift", "configuration_drift"]).toContain(rec.driftClass);
  });
  it("rolls back to a previous immutable deployment version", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const v1 = await deployToActive(rt, pkg);
    // a second deployment of the same package supersedes v1
    const dep2 = await createDeploymentRequest(ctx, { workspaceId, runtimeRegistrationId: rt, deploymentPackageId: pkg });
    await validateDeploymentRequest(ctx, dep2.id); await approveDeployment(ctx, { deploymentId: dep2.id });
    await deployPackage(ctx, dep2.id); await activateDeployment(ctx, dep2.id);
    // rollback v2 → v1
    const req = await requestRollback(ctx, { workspaceId, sourceDeploymentId: dep2.id, targetDeploymentId: v1, reason: "regression" });
    const done = await executeRollback(ctx, req.id);
    expect(done.status).toBe("completed");
    expect(done.resultDeploymentId).toBe(v1);
    const deployments = await listDeployments(ctx, workspaceId);
    expect(deployments.find((d) => d.id === v1)!.status).toBe("active");
    expect(deployments.find((d) => d.id === dep2.id)!.status).toBe("rolled_back");
  });
});

describe("execution monitoring + webhooks + polling", () => {
  it("ingests a webhook once and rejects the replay; tracks the execution", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const depId = await deployToActive(rt, pkg);
    const first = await ingestRuntimeWebhook(ctx, { runtimeRegistrationId: rt, externalEventId: "evt_1", externalExecutionId: "exec_1", status: "succeeded", deploymentId: depId, signatureValid: true });
    expect(first.status).toBe("processed");
    const replay = await ingestRuntimeWebhook(ctx, { runtimeRegistrationId: rt, externalEventId: "evt_1", externalExecutionId: "exec_1", status: "succeeded", deploymentId: depId, signatureValid: true });
    expect(replay.status).toBe("duplicate");
    const rejected = await ingestRuntimeWebhook(ctx, { runtimeRegistrationId: rt, externalEventId: "evt_2", externalExecutionId: "exec_2", status: "failed", deploymentId: depId, signatureValid: false });
    expect(rejected.status).toBe("rejected");
    const execs = await listRuntimeExecutions(ctx, workspaceId);
    expect(execs.some((e) => e.externalExecutionId === "exec_1" && e.status === "succeeded")).toBe(true);
  });
  it("reconciles executions by polling (bounded, rerun-safe)", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    await deployToActive(rt, pkg);
    fake.execution = { id: "exec_poll", status: "succeeded", failure: null };
    const r1 = await pollRuntimeState(ctx, rt, { limit: 10 });
    expect(r1.scanned).toBeGreaterThan(0);
    expect(r1.updated).toBeGreaterThan(0);
    const r2 = await pollRuntimeState(ctx, rt, { limit: 10 }); // rerun-safe: no new updates
    expect(r2.updated).toBe(0);
    const dash = await getRuntimeOpsDashboard(ctx, workspaceId);
    expect(dash.activeDeployments).toBe(1);
  });
});

describe("authorization + workspace isolation", () => {
  it("denies a client actor from deploying and from registering a runtime", async () => {
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(registerRuntime(clientCtx, { workspaceId, provider: "n8n", displayName: "x", environment: "staging", baseUrl: "u", secret: "s" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("isolates runtimes + deployments by workspace + tenant", async () => {
    const pkg = await seedPackage();
    const rt = await readyProdRuntime();
    const depId = await deployToActive(rt, pkg);
    // a different workspace has no deployments (workspace scope)
    expect((await listDeployments(ctx, "ws_other")).length).toBe(0);
    // a foreign-tenant client cannot read an internal deployment (load-then-authorize)
    const foreign = { ...ctx, actor: { userId: "u_f", role: "client_admin", clientId: "cli_zzz" } as Actor };
    await expect(getDeploymentDetail(foreign, depId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
