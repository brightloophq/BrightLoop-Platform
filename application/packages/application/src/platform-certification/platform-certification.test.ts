/* =============================================================================
 * Platform certification use-case tests (Phase E · Sprint E8).
 *
 * (1) The full enterprise workflow E1→E7: client onboarded → knowledge ingested →
 *     strategy generated → execution plan approved → automation surveyed →
 *     executive report generated → agent mission executed → approval → resume →
 *     completion — everything auditable, recoverable, workspace-isolated.
 * (2) The platform certification (E8) then audits the live platform and passes.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
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
import { createInMemoryAgentRepos } from "../agents/testing.js";
import { approveAgentAction, createAgentMission, createAgentProfile, planAgentMission, resumeAgentMission, runNextAgentTask, startAgentMission } from "../agents/agent-usecases.js";
import { getApprovalQueue, getMissionDetail } from "../agents/agent-read.js";
import { createInMemoryCertificationRepos } from "./testing.js";
import { publishCertification, runPlatformCertification, submitCertificationException } from "./certification-usecases.js";
import { getProductionReadiness, listCertificationIssues } from "./certification-read.js";

const T0 = "2026-07-27T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
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
    agents: createInMemoryAgentRepos(), certification: createInMemoryCertificationRepos(),
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
  const plan = await createPlanningSession(ctx, workspaceId, { strategySessionId: s.id, title: "Plan" });
  await generateExecutionPlan(ctx, plan.id, { targetInitiativeIds: [initA, initB] });
  await approveExecutionPlan(ctx, plan.id);
  strategySessionId = s.id;
  planningSessionId = plan.id;
});

describe("full enterprise workflow E1→E7 + certification", () => {
  it("runs the whole platform and certifies it production-ready", async () => {
    // Agent mission that orchestrates knowledge → strategy → planning → automation → report.
    const coordinator = await createAgentProfile(ctx, workspaceId, { name: "Coordinator", role: "coordinator" });
    const mission = await createAgentMission(ctx, workspaceId, { coordinatorProfileId: coordinator.id, title: "Enterprise brief", goal: "Produce an executive report", strategySessionId, planningSessionId });
    await planAgentMission(ctx, mission.id);
    await startAgentMission(ctx, mission.id);
    // Drive to the approval gate.
    let status = "running";
    for (let i = 0; i < 25 && status === "running"; i += 1) status = (await runNextAgentTask(ctx, mission.id)).missionStatus;
    expect(status).toBe("waiting_for_approval");
    const queue = await getApprovalQueue(ctx, mission.id);
    await approveAgentAction(ctx, queue[0]!.id);
    await resumeAgentMission(ctx, mission.id);
    for (let i = 0; i < 25 && status !== "completed" && status !== "failed"; i += 1) status = (await runNextAgentTask(ctx, mission.id)).missionStatus;
    expect(status).toBe("completed");
    const missionDetail = await getMissionDetail(ctx, mission.id);
    expect(missionDetail.artifacts.some((a) => a.kind === "report")).toBe(true);

    // Certify the platform.
    const cert = await runPlatformCertification(ctx, workspaceId, { title: "E8 certification" });
    expect(cert.status).toBe("completed");
    expect(cert.outcome).not.toBe("failed");
    expect(cert.categoriesCovered).toBe(16);
    expect(cert.score).toBeGreaterThanOrEqual(90);

    const readiness = await getProductionReadiness(ctx, cert.id);
    expect(readiness.ready).toBe(true);
    expect(readiness.criticalIssues).toBe(0);

    const published = await publishCertification(ctx, cert.id);
    expect(published.published).toBe(true);
  });
});

describe("certification authorization + audit records", () => {
  it("only owners/admins may run certification; team members and clients are denied", async () => {
    await expect(runPlatformCertification({ ...ctx, actor: CLIENT }, workspaceId, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runPlatformCertification({ ...ctx, actor: TEAM }, workspaceId, {})).rejects.toBeInstanceOf(ForbiddenError);
    const cert = await runPlatformCertification(ctx, workspaceId, {});
    expect(cert.outcome).not.toBe("failed");
  });

  it("records issues (if any) and supports documented exceptions", async () => {
    const cert = await runPlatformCertification(ctx, workspaceId, {});
    const issues = await listCertificationIssues(ctx, cert.id);
    // A production-ready platform should have no critical issues.
    expect(issues.filter((i) => i.severity === "critical").length).toBe(0);
    const ex = await submitCertificationException(ctx, cert.id, { issueCode: "performance.linear_complexity", reason: "documented benchmark exception" });
    expect(ex.issueCode).toBe("performance.linear_complexity");
  });
});
