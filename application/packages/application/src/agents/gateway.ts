/* =============================================================================
 * Agent Tool Gateway (Phase E · Sprint E7).
 *
 * The SINGLE seam through which agents invoke capabilities. Flow:
 *   decision → capability registry → authorization → approval check →
 *   rate/budget check → application-service invocation → normalized result →
 *   audit event (tool call) + observation.
 *
 * The gateway validates inputs, enforces authorization + tenant isolation +
 * approval policy + mission limits, records every call and failure, normalizes
 * outputs, and preserves upstream citations/provenance. Capability keys are ONLY
 * accepted from the registry — never from prompt-controlled free text — and never
 * on the authority of untrusted content.
 * ========================================================================== */

import {
  buildAgentArtifact, buildAgentFailure, buildAgentObservation, buildAgentToolCall, capabilityApprovalClass,
  getCapability, guardCapabilitySelection, guardrailViolations, idempotencyKeyFor, isInvocableCapability,
  type MissionUsage,
} from "@brightloop/domain";
import type { AgentArtifactKind, AgentMission, InstructionClass, SideEffectClass } from "@brightloop/schema";
import { may } from "@brightloop/domain";
import { authorize, requireAgents, AGENT_RUN_CAP, type AppContext } from "../context.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
// Upstream PUBLIC application services (never repositories, SDKs, or engines).
import { getKnowledgeUsage } from "../knowledge/knowledge-read.js";
import { getStrategyResult, listStrategyHistory } from "../strategist/strategy-read.js";
import { runBusinessAnalysis } from "../strategist/strategy-usecases.js";
import { getExecutionPlanResult, listPlanningSessions } from "../project-manager/planner-read.js";
import { approveExecutionPlan, generateExecutionPlan, validateExecutionPlan } from "../project-manager/planner-usecases.js";
import { listExecutionIntents } from "../automation-builder/builder-read.js";
import { buildWorkflow, createExecutionIntent, generateDeploymentPackage, publishWorkflow, simulateWorkflow, validateWorkflow } from "../automation-builder/builder-usecases.js";
import { createReport, generateExecutiveReport } from "../reporting/reporting-usecases.js";
import { getReportDetail } from "../reporting/reporting-read.js";
import { getWorkspaceExecution } from "../transformation-execution/execution-read.js";
import { toAgentToolCallDTO, type CapabilityResultDTO } from "./dto.js";

const str = (input: Record<string, unknown>, key: string): string => requireId(input[key], key);
const optStr = (input: Record<string, unknown>, key: string): string | undefined => (typeof input[key] === "string" ? (input[key] as string) : undefined);

interface DispatchResult { outputRef: string | null; refContext: string | null; summary: string; citations: string[]; tokens: number; cost: number; artifactKind: AgentArtifactKind | null; snapshot: Record<string, unknown> }

/** Map a validated capability key to its owning context's PUBLIC service. */
async function dispatchCapability(ctx: AppContext, key: string, input: Record<string, unknown>): Promise<DispatchResult> {
  const base: DispatchResult = { outputRef: null, refContext: null, summary: "", citations: [], tokens: 0, cost: 0, artifactKind: null, snapshot: {} };
  switch (key) {
    case "knowledge.retrieve_context": {
      const u = await getKnowledgeUsage(ctx, str(input, "workspaceId"));
      return { ...base, refContext: "knowledge", summary: `${u.documents} documents, ${u.retrievals} retrievals`, artifactKind: "knowledge_context", snapshot: { documents: u.documents, retrievals: u.retrievals } };
    }
    case "strategy.list_history": {
      const h = await listStrategyHistory(ctx, str(input, "workspaceId"));
      return { ...base, refContext: "strategist", outputRef: h[0]?.id ?? null, summary: `${h.length} strategy sessions` };
    }
    case "strategy.get_result": {
      const sid = str(input, "sessionId"); const r = await getStrategyResult(ctx, sid);
      return { ...base, refContext: "strategist", outputRef: sid, summary: `${r.recommendations.length} recommendations, ${r.risks.length} risks`, citations: r.recommendations.slice(0, 5).map((x) => `rec:${x.id}`), artifactKind: "strategy_result", snapshot: { confidence: r.confidence } };
    }
    case "strategy.run_analysis": {
      const sid = str(input, "sessionId"); const a = await runBusinessAnalysis(ctx, sid, { sleep: async () => {} }) as unknown as { tokenTotal?: number; cost?: number };
      return { ...base, refContext: "strategist", outputRef: sid, summary: "strategy analysis run", tokens: a.tokenTotal ?? 0, cost: a.cost ?? 0 };
    }
    case "planning.list_sessions": {
      const s = await listPlanningSessions(ctx, str(input, "workspaceId"));
      return { ...base, refContext: "project-manager", outputRef: s[0]?.id ?? null, summary: `${s.length} planning sessions` };
    }
    case "planning.get_execution_plan": {
      const sid = str(input, "sessionId"); const r = await getExecutionPlanResult(ctx, sid);
      return { ...base, refContext: "project-manager", outputRef: r.plan?.id ?? sid, summary: `${r.initiatives.length} initiatives, ${r.tasks.length} tasks`, artifactKind: "execution_plan", snapshot: { status: r.plan?.status ?? null } };
    }
    case "planning.generate_plan": {
      const sid = str(input, "sessionId"); const p = await generateExecutionPlan(ctx, sid, {});
      return { ...base, refContext: "project-manager", outputRef: p.id, summary: `plan ${p.status}`, artifactKind: "execution_plan" };
    }
    case "planning.validate_plan": {
      const sid = str(input, "sessionId"); const v = await validateExecutionPlan(ctx, sid);
      return { ...base, refContext: "project-manager", outputRef: sid, summary: v.ok ? "plan valid" : `${v.issues.length} issues`, artifactKind: "validation_result", snapshot: { ok: v.ok } };
    }
    case "planning.approve_plan": {
      const sid = str(input, "sessionId"); const a = await approveExecutionPlan(ctx, sid);
      return { ...base, refContext: "project-manager", outputRef: sid, summary: `materialized ${a.materialized.tasks} tasks` };
    }
    case "automation.list_intents": {
      const i = await listExecutionIntents(ctx, str(input, "workspaceId"));
      return { ...base, refContext: "automation-builder", outputRef: i[0]?.id ?? null, summary: `${i.length} automation intents` };
    }
    case "automation.create_intent": {
      const i = await createExecutionIntent(ctx, str(input, "workspaceId"), { planningSessionId: str(input, "planningSessionId"), title: optStr(input, "title") ?? "Agent automation" });
      return { ...base, refContext: "automation-builder", outputRef: i.id, summary: `intent ${i.status}` };
    }
    case "automation.build_workflow": {
      const d = await buildWorkflow(ctx, str(input, "intentId"));
      return { ...base, refContext: "automation-builder", outputRef: d.workflow.id, summary: `${d.steps.length} steps`, artifactKind: "automation_workflow" };
    }
    case "automation.validate_workflow": {
      const v = await validateWorkflow(ctx, str(input, "workflowId"));
      return { ...base, refContext: "automation-builder", outputRef: str(input, "workflowId"), summary: v.ok ? "workflow valid" : `${v.issues.length} issues`, artifactKind: "validation_result", snapshot: { ok: v.ok } };
    }
    case "automation.simulate_workflow": {
      const s = await simulateWorkflow(ctx, str(input, "workflowId"));
      return { ...base, refContext: "automation-builder", outputRef: str(input, "workflowId"), summary: `${s.executionOrder.length} steps, ~${s.estimatedRuntimeMs}ms`, artifactKind: "simulation_result" };
    }
    case "automation.publish_workflow": {
      const v = await publishWorkflow(ctx, str(input, "workflowId"));
      return { ...base, refContext: "automation-builder", outputRef: v.id, summary: `published v${v.version}`, artifactKind: "automation_workflow" };
    }
    case "automation.generate_deployment": {
      const p = await generateDeploymentPackage(ctx, str(input, "workflowId"), { target: (optStr(input, "target") as never) ?? undefined });
      return { ...base, refContext: "automation-builder", outputRef: p.id, summary: `package ${p.target} ${p.status}`, artifactKind: "deployment_package" };
    }
    case "reporting.generate_report": {
      const report = await createReport(ctx, str(input, "workspaceId"), { kind: (optStr(input, "kind") as never) ?? "executive_summary", title: optStr(input, "title") ?? "Agent report" });
      const g = await generateExecutiveReport(ctx, report.id);
      return { ...base, refContext: "reporting", outputRef: g.id, summary: `report ${g.status}: ${g.metricCount} metrics, ${g.insightCount} insights`, tokens: g.tokenTotal, cost: g.cost, artifactKind: "report", snapshot: { confidence: g.confidence } };
    }
    case "reporting.get_report": {
      const d = await getReportDetail(ctx, str(input, "reportId"));
      return { ...base, refContext: "reporting", outputRef: d.report.id, summary: `${d.metrics.length} metrics`, artifactKind: "report" };
    }
    case "execution.get_workspace_state": {
      const w = await getWorkspaceExecution(ctx, str(input, "workspaceId"));
      return { ...base, refContext: "transformation-execution", outputRef: str(input, "workspaceId"), summary: `${w.tasks.length} tasks, ${w.reviews.length} reviews` };
    }
    default:
      throw new ValidationError(`Unknown capability "${key}"`);
  }
}

export interface InvokeCapabilityInput {
  missionId: string;
  runId?: string | null;
  taskKey?: string | null;
  capabilityKey: string;
  input?: Record<string, unknown>;
  /** Trust class of whatever suggested this capability (default: policy-authored). */
  sourceClass?: InstructionClass;
}

/**
 * Invoke a capability through the gateway. Enforces every guard before touching an
 * upstream service and records an auditable tool call (and a failure on error).
 */
export async function invokeAgentCapability(ctx: AppContext, raw: InvokeCapabilityInput): Promise<CapabilityResultDTO> {
  const agents = requireAgents(ctx);
  const missionId = requireId(raw.missionId, "missionId");
  const capabilityKey = requireString(raw.capabilityKey, "capabilityKey");
  const input = raw.input ?? {};
  const taskKey = raw.taskKey ?? null;
  const runId = raw.runId ?? null;
  const sourceClass: InstructionClass = raw.sourceClass ?? "mission_instruction";

  const mission = unwrap(await agents.missions.getById(missionId));
  if (mission === null) throw new NotFoundError("agent mission");
  authorize(ctx.actor, AGENT_RUN_CAP, mission.clientId);

  const recordFailure = async (category: Parameters<typeof buildAgentFailure>[5], cause: string) => {
    unwrap(await agents.failures.append(buildAgentFailure(ctx.ids("afail"), missionId, runId, mission.workspaceId, mission.clientId, category, "gateway", cause, false, 0, taskKey, capabilityKey, ctx.clock())));
  };

  // 1) registry validation — reject anything not a known, invocable capability.
  const spec = getCapability(capabilityKey);
  if (spec === undefined || !isInvocableCapability(capabilityKey)) { await recordFailure("capability", `unknown/invalid capability ${capabilityKey}`); throw new ValidationError(`Capability "${capabilityKey}" is not in the registry`); }

  // 2) capability-selection guard (allow-list + never from untrusted source).
  const guard = guardCapabilitySelection({ requestedCapabilityKey: capabilityKey, allowedCapabilities: mission.limits.allowedCapabilities, prohibitedCapabilities: mission.limits.prohibitedCapabilities, sourceClass, isKnown: true });
  if (!guard.allowed) { await recordFailure("authorization", guard.reason); throw new ForbiddenError(); }

  // 3) authorization — the caller must hold the upstream permission.
  if (!may(ctx.actor, spec.requiredPermission)) { await recordFailure("authorization", `missing ${spec.requiredPermission}`); throw new ForbiddenError(); }

  // 4) tenant isolation — any workspace in the input must be the mission's.
  const wsIn = optStr(input, "workspaceId");
  if (wsIn !== undefined && wsIn !== mission.workspaceId) { await recordFailure("authorization", "cross-workspace reference"); throw new ForbiddenError(); }

  // 5) approval — a mandatory-approval capability needs a recorded approval.
  if (spec.approval === "required") {
    const cls = capabilityApprovalClass(capabilityKey);
    const approvals = unwrap(await agents.approvals.listByMission(missionId));
    const ok = approvals.some((a) => a.status === "approved" && a.approvalClass === cls && (taskKey === null || a.taskKey === taskKey));
    if (!ok) { await recordFailure("approval", `approval ${cls} required`); throw new ConflictError(`Capability "${capabilityKey}" requires approval`); }
  }

  // 6) budget/limits — stop before any side effect if a hard limit is exceeded.
  const usage: MissionUsage = { runCount: mission.runCount, taskCount: mission.taskCount, retryCount: mission.retryCount, durationMs: mission.durationMs, tokenTotal: mission.tokenTotal, cost: mission.cost, delegationDepth: 0 };
  if (guardrailViolations(mission.limits, usage).length > 0) { await recordFailure("budget", "mission budget exceeded"); throw new ConflictError("Mission budget exceeded"); }

  // 7) idempotency — a prior successful identical call is returned, not repeated.
  const idem = idempotencyKeyFor(missionId, taskKey ?? "-", capabilityKey, input);
  const prior = unwrap(await agents.toolCalls.findByIdempotencyKey(missionId, idem));
  if (prior !== null && prior.ok) {
    return { capabilityKey, ok: true, outputRef: prior.outputRef, refContext: null, summary: "(idempotent cache hit)", citations: [], fromCache: true };
  }

  // 8) invoke the upstream service + normalize + audit.
  const startedAt = ctx.clock();
  try {
    const d = await dispatchCapability(ctx, capabilityKey, input);
    const durationMs = Math.max(0, Date.parse(ctx.clock()) - Date.parse(startedAt));
    unwrap(await agents.toolCalls.append(buildAgentToolCall({ id: ctx.ids("atc"), missionId, runId, taskKey, workspaceId: mission.workspaceId, clientId: mission.clientId, capabilityKey, requiredPermission: spec.requiredPermission, sideEffect: spec.sideEffect as SideEffectClass, input, outputRef: d.outputRef, ok: true, durationMs, tokenTotal: d.tokens, cost: d.cost, idempotencyKey: idem, correlationId: mission.correlationId, now: ctx.clock() })));
    unwrap(await agents.observations.append(buildAgentObservation(ctx.ids("aobs"), missionId, runId, taskKey, mission.workspaceId, mission.clientId, capabilityKey, d.summary, d.snapshot, { context: d.refContext, ref: d.outputRef }, ctx.clock())));
    return { capabilityKey, ok: true, outputRef: d.outputRef, refContext: d.refContext, summary: d.summary, citations: d.citations, fromCache: false };
  } catch (err) {
    const durationMs = Math.max(0, Date.parse(ctx.clock()) - Date.parse(startedAt));
    const message = err instanceof Error ? err.message : "capability failed";
    unwrap(await agents.toolCalls.append(buildAgentToolCall({ id: ctx.ids("atc"), missionId, runId, taskKey, workspaceId: mission.workspaceId, clientId: mission.clientId, capabilityKey, requiredPermission: spec.requiredPermission, sideEffect: spec.sideEffect as SideEffectClass, input, outputRef: null, ok: false, durationMs, tokenTotal: 0, cost: 0, idempotencyKey: idem, correlationId: mission.correlationId, errorCode: message.slice(0, 120), now: ctx.clock() })));
    await recordFailure("upstream", message);
    throw err;
  }
}

/** Helper for use-cases: register an artifact for a capability result (dedup by ref). */
export async function registerCapabilityArtifact(ctx: AppContext, mission: AgentMission, kind: AgentArtifactKind, refContext: string, refId: string, title: string, citations: readonly string[], role: Parameters<typeof buildAgentArtifact>[10], taskKey: string | null) {
  const agents = requireAgents(ctx);
  const existing = unwrap(await agents.artifacts.listByMission(mission.id));
  const dup = existing.find((a) => a.refContext === refContext && a.refId === refId);
  if (dup !== undefined) return dup;
  return unwrap(await agents.artifacts.append(buildAgentArtifact(ctx.ids("aart"), mission.id, mission.workspaceId, mission.clientId, kind, refContext, refId, title, {}, citations, role, taskKey, ctx.clock())));
}

export { toAgentToolCallDTO };
