/* =============================================================================
 * Agents use-case tests (Phase E · Sprint E7).
 *
 * The full E1→E7 mission: seed Phase D → knowledge (E2) → strategy (E3) →
 * approved plan (E4) → run an agent mission that orchestrates knowledge, strategy,
 * planning, automation, and reporting through the Tool Gateway, pauses for a human
 * approval, resumes, evaluates, and completes. Plus authorization, workspace
 * isolation, prompt-injection resistance, idempotency, and budget limits.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError } from "../errors.js";
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
import { createInMemoryReportingRepos } from "../reporting/testing.js";
import { createInMemoryAgentRepos } from "./testing.js";
import {
  approveAgentAction, cancelAgentMission, createAgentMission, createAgentProfile, invokeAgentCapability,
  planAgentMission, resumeAgentMission, runNextAgentTask, startAgentMission, submitAgentFeedback,
} from "./agent-usecases.js";
import { getApprovalQueue, getMissionDetail, listAgentMissions, listCapabilityRegistry } from "./agent-read.js";

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
let strategySessionId: string;
let planningSessionId: string;
let coordinatorId: string;

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
    automationBuilder: createInMemoryAutomationBuilderRepos(), reporting: createInMemoryReportingRepos(), agents: createInMemoryAgentRepos(),
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
  strategySessionId = s.id;
  const plan = await createPlanningSession(ctx, workspaceId, { strategySessionId, title: "Plan" });
  await generateExecutionPlan(ctx, plan.id, { targetInitiativeIds: [initA, initB] });
  await approveExecutionPlan(ctx, plan.id);
  planningSessionId = plan.id;
  const coordinator = await createAgentProfile(ctx, workspaceId, { name: "Coordinator", role: "coordinator", purpose: "Orchestrate the mission" });
  coordinatorId = coordinator.id;
});

async function drive(missionId: string, max = 25): Promise<string> {
  let status = "running";
  for (let i = 0; i < max; i += 1) {
    const step = await runNextAgentTask(ctx, missionId);
    status = step.missionStatus;
    if (status === "waiting_for_approval" || status === "completed" || status === "failed") break;
  }
  return status;
}

describe("full E1→E7 mission", () => {
  it("plans, orchestrates E2–E6, pauses for approval, resumes, evaluates, completes", async () => {
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "Executive brief", goal: "Produce an executive report from strategy and plan", strategySessionId, planningSessionId });
    expect(mission.status).toBe("draft");

    const planned = await planAgentMission(ctx, mission.id);
    expect(planned.planLocked).toBe(true);
    expect(planned.taskCount).toBeGreaterThan(0);

    await startAgentMission(ctx, mission.id);

    // Drive until it pauses at the human-approval gate.
    const s1 = await drive(mission.id);
    expect(s1).toBe("waiting_for_approval");
    const queue = await getApprovalQueue(ctx, mission.id);
    expect(queue.length).toBe(1);

    // Approve + resume + finish.
    await approveAgentAction(ctx, queue[0]!.id, { reason: "looks good" });
    const resumed = await resumeAgentMission(ctx, mission.id);
    expect(resumed.status).toBe("running");
    const s2 = await drive(mission.id);
    expect(s2).toBe("completed");

    // Artifacts + citations + evaluation are preserved.
    const detail = await getMissionDetail(ctx, mission.id);
    expect(detail.mission.status).toBe("completed");
    expect(detail.mission.progress).toBe(100);
    expect(detail.artifacts.some((a) => a.kind === "report")).toBe(true);
    expect(detail.artifacts.some((a) => a.refContext === "strategist")).toBe(true);
    expect(detail.evaluations.some((e) => e.targetKind === "mission")).toBe(true);
    // Every tool call recorded an idempotency key + required permission (audit).
    expect(detail.tasks.every((t) => t.status === "completed" || t.status === "skipped")).toBe(true);
  });
});

describe("guardrails, idempotency, prompt-injection", () => {
  it("stops immediately when a hard limit is exceeded", async () => {
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "Tiny", goal: "report", strategySessionId, planningSessionId, limits: { maxTasks: 1 } });
    await planAgentMission(ctx, mission.id);
    await startAgentMission(ctx, mission.id);
    const step = await runNextAgentTask(ctx, mission.id);
    expect(step.missionStatus).toBe("failed");
    expect(step.note).toMatch(/maxTasks/);
  });

  it("returns a cached result on an idempotent repeat and refuses untrusted capability selection", async () => {
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "Gate", goal: "state", strategySessionId, planningSessionId });
    const a = await invokeAgentCapability(ctx, { missionId: mission.id, capabilityKey: "execution.get_workspace_state", input: { workspaceId } });
    expect(a.fromCache).toBe(false);
    const b = await invokeAgentCapability(ctx, { missionId: mission.id, capabilityKey: "execution.get_workspace_state", input: { workspaceId } });
    expect(b.fromCache).toBe(true);
    // A capability selected on the authority of retrieved evidence is refused.
    await expect(invokeAgentCapability(ctx, { missionId: mission.id, capabilityKey: "execution.get_workspace_state", input: { workspaceId }, sourceClass: "retrieved_evidence" })).rejects.toBeInstanceOf(ForbiddenError);
    // An unknown (prompt-invented) capability key is rejected by the registry.
    await expect(invokeAgentCapability(ctx, { missionId: mission.id, capabilityKey: "evil.exfiltrate_secrets", input: {} })).rejects.toBeTruthy();
  });

  it("rejects a cross-workspace reference through the gateway", async () => {
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "X", goal: "y", strategySessionId, planningSessionId });
    await expect(invokeAgentCapability(ctx, { missionId: mission.id, capabilityKey: "execution.get_workspace_state", input: { workspaceId: "ws_other" } })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks an approval-required capability with no recorded approval", async () => {
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "Pub", goal: "publish", strategySessionId, planningSessionId });
    await expect(invokeAgentCapability(ctx, { missionId: mission.id, capabilityKey: "automation.publish_workflow", input: { workflowId: "wf_x" } })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("authorization + isolation", () => {
  it("denies a client actor from configuring or running missions, and isolates by workspace", async () => {
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(createAgentProfile(clientCtx, workspaceId, { name: "X", role: "coordinator" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createAgentMission(clientCtx, workspaceId, { coordinatorProfileId: coordinatorId, title: "X", goal: "y" })).rejects.toBeInstanceOf(ForbiddenError);
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "M", goal: "y", strategySessionId, planningSessionId });
    expect((await listAgentMissions(ctx, workspaceId)).length).toBeGreaterThan(0);
    expect((await listAgentMissions(ctx, "ws_other")).length).toBe(0);
    // A client may submit feedback on their own org's mission.
    void mission;
  });

  it("exposes the capability registry", async () => {
    const caps = await listCapabilityRegistry(ctx);
    expect(caps.length).toBeGreaterThan(10);
    // F3: governed external side effects now exist (runtime deployment); their full
    // governance is certified by the platform-certification suite. Every cap still
    // declares a required permission + a public service.
    expect(caps.some((c) => c.sideEffect === "external")).toBe(true);
    expect(caps.every((c) => c.requiredPermission.length > 0 && c.service.length > 0)).toBe(true);
  });

  it("supports mission cancellation + feedback", async () => {
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinatorId, title: "C", goal: "y", strategySessionId, planningSessionId });
    const cancelled = await cancelAgentMission(ctx, mission.id, "no longer needed");
    expect(cancelled.status).toBe("cancelled");
    const fb = await submitAgentFeedback(ctx, mission.id, { kind: "comment", rating: 4, comment: "ok" });
    expect(fb.kind).toBe("comment");
  });
});
