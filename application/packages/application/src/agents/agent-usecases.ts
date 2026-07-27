/* =============================================================================
 * AI Agents use-cases (Phase E · Sprint E7).
 *
 * The orchestration engine. A Coordinator plans a mission, delegates each task to
 * the appropriate specialist agent, and drives capabilities through the Tool
 * Gateway — never performing specialist work directly and never calling upstream
 * services outside the gateway. Missions are guarded by an explicit state machine,
 * hard budgets, approval gates, checkpoints, and evaluation. Deterministic; no
 * live providers, no external side effects.
 * ========================================================================== */

import {
  buildAgentApproval, buildAgentCheckpoint, buildAgentDecision, buildAgentDelegation, buildAgentEvaluation,
  buildAgentFailure, buildAgentFeedback, buildAgentMemory, buildAgentMessage, buildAgentMission, buildAgentProfile,
  buildAgentRun, buildAgentTaskFromPlan, buildCapabilityDefinition, canDelegate, canTransitionMission,
  canTransitionAgentTask, capabilityApprovalClass, computeEvaluationScore, getCapability, guardrailViolations,
  listCapabilities, planMission, stableHash, terminationReason, topologicalTaskOrder,
  type MissionUsage, type PlannedTask,
} from "@brightloop/domain";
import type {
  AgentApproval, AgentFeedbackKind, AgentMemoryType, AgentMission, AgentRole, AgentTask, ApprovalClass, MissionLimits,
} from "@brightloop/schema";
import {
  authorize, requireAgents, AGENT_APPROVE_CAP, AGENT_CANCEL_CAP, AGENT_CONFIGURE_CAP, AGENT_DELEGATE_CAP,
  AGENT_FEEDBACK_CAP, AGENT_READ_CAP, AGENT_REVIEW_CAP, AGENT_RUN_CAP, AGENT_WRITE_CAP, type AppContext,
} from "../context.js";
import { isClientRole } from "@brightloop/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { invokeAgentCapability, registerCapabilityArtifact } from "./gateway.js";
import {
  toAgentApprovalDTO, toAgentCheckpointDTO, toAgentEvaluationDTO, toAgentFeedbackDTO, toAgentMemoryDTO,
  toAgentMissionDTO, toAgentProfileDTO, type AgentApprovalDTO, type AgentCheckpointDTO, type AgentEvaluationDTO,
  type AgentFeedbackDTO, type AgentMemoryDTO, type AgentMissionDTO, type AgentProfileDTO, type StepResultDTO,
} from "./dto.js";

/* ---- helpers --------------------------------------------------------------- */

async function loadMission(ctx: AppContext, missionId: string, cap: string) {
  const agents = requireAgents(ctx);
  const mission = unwrap(await agents.missions.getById(missionId));
  if (mission === null) throw new NotFoundError("agent mission");
  authorize(ctx.actor, cap, mission.clientId);
  return { agents, mission };
}

async function advanceMission(ctx: AppContext, mission: AgentMission, to: AgentMission["status"], patch: Partial<AgentMission> = {}): Promise<AgentMission> {
  if (!canTransitionMission(mission.status, to)) throw new ConflictError(`Cannot move mission ${mission.status} → ${to}`);
  const agents = requireAgents(ctx);
  const next: AgentMission = { ...mission, ...patch, status: to, updatedAt: ctx.clock(), version: mission.version + 1 };
  unwrap(await agents.missions.save(next, mission.version));
  return next;
}

async function checkpoint(ctx: AppContext, mission: AgentMission, label: string): Promise<AgentMission> {
  const agents = requireAgents(ctx);
  const tasks = unwrap(await agents.tasks.listByMission(mission.id));
  const snapshot = { status: mission.status, tasks: tasks.map((t) => ({ key: t.key, status: t.status })) };
  const cp = buildAgentCheckpoint(ctx.ids("acp"), mission.id, mission.workspaceId, mission.clientId, label, mission.status, stableHash(snapshot), snapshot, mission.checkpointCount, ctx.clock());
  unwrap(await agents.checkpoints.append(cp));
  const next = unwrap(await agents.missions.getById(mission.id))!;
  return advanceMissionSameStatus(ctx, next, { resumableCheckpointId: cp.id, checkpointCount: next.checkpointCount + 1 });
}

async function advanceMissionSameStatus(ctx: AppContext, mission: AgentMission, patch: Partial<AgentMission>): Promise<AgentMission> {
  const agents = requireAgents(ctx);
  const next: AgentMission = { ...mission, ...patch, updatedAt: ctx.clock(), version: mission.version + 1 };
  unwrap(await agents.missions.save(next, mission.version));
  return next;
}

/* ---- profiles -------------------------------------------------------------- */

export interface CreateAgentProfileInput { name: string; role: AgentRole; purpose?: string; allowedCapabilities?: string[]; prohibitedCapabilities?: string[]; approvalRequirements?: ApprovalClass[]; escalationPolicy?: string; }

export async function createAgentProfile(ctx: AppContext, rawWorkspaceId: unknown, input: CreateAgentProfileInput): Promise<AgentProfileDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const name = requireString(input.name, "name").trim();
  if (name === "") throw new ValidationError("An agent name is required");
  const agents = requireAgents(ctx);
  authorize(ctx.actor, AGENT_CONFIGURE_CAP, ctx.actor.clientId);
  // Any allow-listed capability must exist in the registry.
  for (const c of input.allowedCapabilities ?? []) if (getCapability(c) === undefined) throw new ValidationError(`Unknown capability "${c}"`);
  const profile = buildAgentProfile({ id: ctx.ids("aprof"), workspaceId, clientId: ctx.actor.clientId, name, role: input.role, purpose: input.purpose, allowedCapabilities: input.allowedCapabilities, prohibitedCapabilities: input.prohibitedCapabilities, approvalRequirements: input.approvalRequirements, escalationPolicy: input.escalationPolicy, now: ctx.clock() });
  unwrap(await agents.profiles.create(profile));
  return toAgentProfileDTO(profile);
}

async function setProfileStatus(ctx: AppContext, rawId: unknown, status: "active" | "inactive" | "archived"): Promise<AgentProfileDTO> {
  const id = requireId(rawId, "profileId");
  const agents = requireAgents(ctx);
  const profile = unwrap(await agents.profiles.getById(id));
  if (profile === null) throw new NotFoundError("agent profile");
  authorize(ctx.actor, AGENT_CONFIGURE_CAP, profile.clientId);
  const next = { ...profile, status, updatedAt: ctx.clock(), version: profile.version + 1 };
  unwrap(await agents.profiles.save(next, profile.version));
  return toAgentProfileDTO(next);
}
export const activateAgentProfile = (ctx: AppContext, id: unknown) => setProfileStatus(ctx, id, "active");
export const deactivateAgentProfile = (ctx: AppContext, id: unknown) => setProfileStatus(ctx, id, "inactive");

export interface UpdateAgentProfileInput { purpose?: string; allowedCapabilities?: string[]; prohibitedCapabilities?: string[]; escalationPolicy?: string; }
export async function updateAgentProfile(ctx: AppContext, rawId: unknown, input: UpdateAgentProfileInput): Promise<AgentProfileDTO> {
  const id = requireId(rawId, "profileId");
  const agents = requireAgents(ctx);
  const profile = unwrap(await agents.profiles.getById(id));
  if (profile === null) throw new NotFoundError("agent profile");
  authorize(ctx.actor, AGENT_CONFIGURE_CAP, profile.clientId);
  for (const c of input.allowedCapabilities ?? []) if (getCapability(c) === undefined) throw new ValidationError(`Unknown capability "${c}"`);
  const next = { ...profile, purpose: input.purpose ?? profile.purpose, allowedCapabilities: input.allowedCapabilities ?? profile.allowedCapabilities, prohibitedCapabilities: input.prohibitedCapabilities ?? profile.prohibitedCapabilities, escalationPolicy: input.escalationPolicy ?? profile.escalationPolicy, updatedAt: ctx.clock(), version: profile.version + 1 };
  unwrap(await agents.profiles.save(next, profile.version));
  return toAgentProfileDTO(next);
}

/** Seed the capability registry into persistence (idempotent upsert). */
export async function seedCapabilityRegistry(ctx: AppContext): Promise<number> {
  const agents = requireAgents(ctx);
  authorize(ctx.actor, AGENT_CONFIGURE_CAP, ctx.actor.clientId);
  const rows = listCapabilities().map((s) => buildCapabilityDefinition(s, ctx.clock()));
  unwrap(await agents.capabilities.upsertMany(rows));
  return rows.length;
}

/* ---- mission creation + planning ------------------------------------------- */

export interface CreateAgentMissionInput { coordinatorProfileId: string; title: string; goal: string; strategySessionId?: string | null; planningSessionId?: string | null; automationIntentId?: string | null; limits?: Partial<MissionLimits>; }

export async function createAgentMission(ctx: AppContext, rawWorkspaceId: unknown, input: CreateAgentMissionInput): Promise<AgentMissionDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const coordinatorProfileId = requireId(input.coordinatorProfileId, "coordinatorProfileId");
  const title = requireString(input.title, "title").trim();
  if (title === "") throw new ValidationError("A mission title is required");
  const agents = requireAgents(ctx);
  authorize(ctx.actor, AGENT_WRITE_CAP, ctx.actor.clientId);
  const coordinator = unwrap(await agents.profiles.getById(coordinatorProfileId));
  if (coordinator === null || coordinator.role !== "coordinator") throw new ValidationError("A coordinator profile is required");
  const mission = buildAgentMission({ id: ctx.ids("amsn"), workspaceId, clientId: ctx.actor.clientId, coordinatorProfileId, title, goal: input.goal, requestedByUserId: ctx.actor.userId, strategySessionId: input.strategySessionId, planningSessionId: input.planningSessionId, automationIntentId: input.automationIntentId, limits: input.limits, correlationId: ctx.ids("corr"), now: ctx.clock() });
  unwrap(await agents.missions.create(mission));
  return toAgentMissionDTO(mission);
}

export async function planAgentMission(ctx: AppContext, rawMissionId: unknown): Promise<AgentMissionDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  if (mission.planLocked) return toAgentMissionDTO(mission); // plan immutable after planning
  const startedAt = ctx.clock();
  const plan = planMission({ goal: mission.goal || mission.title, workspaceId: mission.workspaceId, strategySessionId: mission.strategySessionId, planningSessionId: mission.planningSessionId, automationIntentId: mission.automationIntentId, maxRetries: mission.limits.maxRetries });
  // The planner is deterministic; still VALIDATE before persistence.
  const nodes = plan.tasks.map((t) => ({ key: t.key, kind: t.kind, capabilityKey: t.capabilityKey, dependsOn: t.dependsOn, parallelizable: t.parallelizable, optional: t.optional, approvalGated: t.approvalGated, completionCriteria: t.completionCriteria, expectedOutput: t.expectedOutput, compensatesTaskKey: t.compensatesTaskKey }));
  const { validateTaskGraph } = await import("@brightloop/domain");
  const v = validateTaskGraph(nodes);
  if (!v.ok) throw new ValidationError(`Invalid mission plan: ${v.issues.join("; ")}`);

  let m = mission.status === "draft" ? await advanceMission(ctx, mission, "queued") : mission;
  m = await advanceMission(ctx, m, "planning", { planningDurationMs: Math.max(0, Date.parse(ctx.clock()) - Date.parse(startedAt)) });
  const tasks = plan.tasks.map((t: PlannedTask) => buildAgentTaskFromPlan(ctx.ids("atask"), missionId, mission.workspaceId, mission.clientId, t, ctx.clock()));
  unwrap(await agents.tasks.appendMany(tasks));
  m = await advanceMissionSameStatus(ctx, m, { planHash: stableHash(plan), planLocked: true, taskCount: tasks.length });
  unwrap(await agents.decisions.append(buildAgentDecision(ctx.ids("adec"), missionId, null, mission.workspaceId, mission.clientId, "plan", `Planned ${tasks.length} tasks for: ${mission.goal}`, null, { requiredCapabilities: plan.requiredCapabilities }, ctx.clock())));
  await checkpoint(ctx, m, "mission planned");
  return toAgentMissionDTO(unwrap(await agents.missions.getById(missionId))!);
}

export async function startAgentMission(ctx: AppContext, rawMissionId: unknown): Promise<AgentMissionDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  if (!mission.planLocked) throw new ConflictError("Mission must be planned before it starts");
  const run = buildAgentRun({ id: ctx.ids("arun"), missionId, workspaceId: mission.workspaceId, clientId: mission.clientId, agentProfileId: mission.coordinatorProfileId, role: "coordinator", delegationDepth: 0, correlationId: mission.correlationId, traceId: ctx.ids("trace"), now: ctx.clock() });
  unwrap(await agents.runs.create(run));
  const m = await advanceMission(ctx, mission, "running", { runCount: mission.runCount + 1 });
  return toAgentMissionDTO(m);
}

/* ---- the engine: run the next ready task ----------------------------------- */

export async function runNextAgentTask(ctx: AppContext, rawMissionId: unknown): Promise<StepResultDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  if (mission.status !== "running") throw new ConflictError(`Mission is ${mission.status}, not running`);

  // Hard-limit guard — stop before doing any more work.
  const usage: MissionUsage = { runCount: mission.runCount, taskCount: mission.taskCount, retryCount: mission.retryCount, durationMs: mission.durationMs, tokenTotal: mission.tokenTotal, cost: mission.cost, delegationDepth: 0 };
  const stop = terminationReason(mission.limits, usage);
  if (stop !== null || guardrailViolations(mission.limits, usage).length > 0) {
    await advanceMission(ctx, mission, "failed", { terminationReason: stop ?? "budget exceeded" });
    return { taskKey: null, taskStatus: null, missionStatus: "failed", note: stop ?? "budget exceeded" };
  }

  const tasks = unwrap(await agents.tasks.listByMission(missionId));
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const done = (k: string) => { const s = byKey.get(k)?.status; return s === "completed" || s === "skipped"; };
  const order = topologicalTaskOrder(tasks.map((t) => ({ key: t.key, kind: t.kind, capabilityKey: t.capabilityKey, dependsOn: t.dependsOn, parallelizable: t.parallelizable, optional: t.optional, approvalGated: t.approvalGated, completionCriteria: t.completionCriteria, expectedOutput: t.expectedOutput }))) ?? tasks.map((t) => t.key);
  const ready = order.map((k) => byKey.get(k)!).find((t) => (t.status === "pending" || t.status === "ready") && t.dependsOn.every(done));

  if (ready === undefined) {
    const allSettled = tasks.every((t) => t.status === "completed" || t.status === "skipped");
    if (allSettled) {
      await evaluateAgentMission(ctx, missionId);
      const completed = await advanceMission(ctx, mission, "completed", { progress: 100, terminationReason: "all tasks completed" });
      return { taskKey: null, taskStatus: null, missionStatus: completed.status, note: "mission completed" };
    }
    return { taskKey: null, taskStatus: null, missionStatus: mission.status, note: "no ready tasks (blocked or awaiting approval)" };
  }

  // Delegate to the specialist for this task (explicit + persisted).
  const depth = 1;
  if (!canDelegate(depth, mission.limits)) { await advanceMission(ctx, mission, "failed", { terminationReason: "max delegation depth" }); return { taskKey: ready.key, taskStatus: "failed", missionStatus: "failed", note: "delegation depth exceeded" }; }
  const run = buildAgentRun({ id: ctx.ids("arun"), missionId, workspaceId: mission.workspaceId, clientId: mission.clientId, agentProfileId: mission.coordinatorProfileId, role: ready.assignedRole, delegationDepth: depth, correlationId: mission.correlationId, traceId: ctx.ids("trace"), now: ctx.clock() });
  unwrap(await agents.runs.create(run));
  unwrap(await agents.delegations.append(buildAgentDelegation(ctx.ids("adel"), missionId, run.id, mission.workspaceId, mission.clientId, "coordinator", ready.assignedRole, ready.key, depth, ready.expectedOutput, "within mission limits", ctx.clock())));
  unwrap(await agents.decisions.append(buildAgentDecision(ctx.ids("adec"), missionId, run.id, mission.workspaceId, mission.clientId, "delegate", `Delegated ${ready.key} to ${ready.assignedRole}`, ready.key, {}, ctx.clock())));

  const setTask = async (t: AgentTask, patch: Partial<AgentTask>) => { const next = { ...t, ...patch, updatedAt: ctx.clock(), version: t.version + 1 }; unwrap(await agents.tasks.save(next, t.version)); return next; };

  // Approval gate (or an approval-required capability without recorded approval).
  const approvals = unwrap(await agents.approvals.listByMission(missionId));
  const neededClass: ApprovalClass | null = ready.approvalGated ? (ready.approvalClass ?? "high_risk") : (ready.capabilityKey ? capabilityApprovalClass(ready.capabilityKey) : null);
  const approvalSatisfied = neededClass === null || approvals.some((a) => a.status === "approved" && a.approvalClass === neededClass && a.taskKey === ready.key);

  if ((ready.approvalGated || (ready.capabilityKey !== null && getCapability(ready.capabilityKey)?.approval === "required")) && !approvalSatisfied) {
    await requestAgentApproval(ctx, missionId, { taskKey: ready.key, approvalClass: neededClass ?? "high_risk", payload: { taskKey: ready.key, capabilityKey: ready.capabilityKey }, requestedByRole: "review" });
    await setTask(ready, { status: canTransitionAgentTask(ready.status, "waiting_for_approval") ? "waiting_for_approval" : ready.status });
    const paused = await advanceMission(ctx, mission, "waiting_for_approval", {});
    await checkpoint(ctx, paused, `awaiting approval: ${ready.key}`);
    return { taskKey: ready.key, taskStatus: "waiting_for_approval", missionStatus: "waiting_for_approval", note: "approval requested" };
  }

  // Approval gate that IS satisfied → complete it.
  if (ready.kind === "approval_gate") {
    await setTask(ready, { status: "completed" });
    const m = await advanceMissionSameStatus(ctx, mission, { progress: Math.min(99, Math.round((tasks.filter((t) => t.status === "completed").length + 1) / tasks.length * 100)) });
    await checkpoint(ctx, m, `approval gate cleared: ${ready.key}`);
    return { taskKey: ready.key, taskStatus: "completed", missionStatus: m.status, note: "approval gate cleared" };
  }

  // Terminal task → evaluate + complete.
  if (ready.kind === "terminal") {
    await setTask(ready, { status: "completed" });
    await evaluateAgentMission(ctx, missionId);
    const completed = await advanceMission(ctx, mission, "completed", { progress: 100, terminationReason: "all tasks completed" });
    return { taskKey: ready.key, taskStatus: "completed", missionStatus: completed.status, note: "mission completed" };
  }

  // Capability task → invoke through the gateway.
  if (ready.kind === "capability" && ready.capabilityKey !== null) {
    const runningTask = await setTask(ready, { status: "running", claimedBy: run.id, claimedAt: ctx.clock() });
    try {
      const result = await invokeAgentCapability(ctx, { missionId, runId: run.id, taskKey: ready.key, capabilityKey: ready.capabilityKey, input: ready.capabilityInput, sourceClass: "mission_instruction" });
      let artifactId: string | null = null;
      const spec = getCapability(ready.capabilityKey)!;
      if (result.outputRef !== null && result.refContext !== null) {
        const art = await registerCapabilityArtifact(ctx, mission, artifactKindFor(ready.capabilityKey), result.refContext, result.outputRef, `${ready.title}`, result.citations, ready.assignedRole, ready.key);
        artifactId = art.id;
      }
      await setTask(runningTask, { status: "completed", resultArtifactId: artifactId });
      unwrap(await agents.delegations.append(buildAgentDelegation(ctx.ids("adel"), missionId, run.id, mission.workspaceId, mission.clientId, ready.assignedRole, "coordinator", ready.key, depth, "result returned", "", ctx.clock())));
      const completedCount = tasks.filter((t) => t.status === "completed").length + 1;
      const m = await advanceMissionSameStatus(ctx, mission, { capabilityCalls: mission.capabilityCalls + 1, delegationCount: mission.delegationCount + 1, runCount: mission.runCount + 1, cost: mission.cost + (spec.costCategory === "high" ? 0.5 : spec.costCategory === "medium" ? 0.2 : 0.05), progress: Math.min(99, Math.round(completedCount / tasks.length * 100)) });
      await checkpoint(ctx, m, `task completed: ${ready.key}`);
      return { taskKey: ready.key, taskStatus: "completed", missionStatus: m.status, note: result.fromCache ? "capability cache hit" : "capability invoked" };
    } catch (err) {
      if (err instanceof ConflictError) throw err; // budget/approval — surfaced as-is
      const retryable = ready.retryable && ready.retryCount < mission.limits.maxRetries;
      unwrap(await agents.failures.append(buildAgentFailure(ctx.ids("afail"), missionId, run.id, mission.workspaceId, mission.clientId, "capability", "runNextAgentTask", err instanceof Error ? err.message : "capability error", retryable, ready.retryCount, ready.key, ready.capabilityKey, ctx.clock())));
      if (retryable) {
        await setTask(runningTask, { status: "ready", retryCount: ready.retryCount + 1, claimedBy: null });
        await advanceMissionSameStatus(ctx, mission, { retryCount: mission.retryCount + 1, failedCapabilityCalls: mission.failedCapabilityCalls + 1 });
        return { taskKey: ready.key, taskStatus: "ready", missionStatus: mission.status, note: "capability failed — will retry" };
      }
      await setTask(runningTask, { status: ready.optional ? "skipped" : "failed" });
      if (ready.optional) { await advanceMissionSameStatus(ctx, mission, { failedCapabilityCalls: mission.failedCapabilityCalls + 1 }); return { taskKey: ready.key, taskStatus: "skipped", missionStatus: mission.status, note: "optional task skipped after failure" }; }
      const failed = await advanceMission(ctx, mission, "failed", { terminationReason: "unrecoverable task failure", failedCapabilityCalls: mission.failedCapabilityCalls + 1 });
      return { taskKey: ready.key, taskStatus: "failed", missionStatus: failed.status, note: "mission failed" };
    }
  }

  return { taskKey: ready.key, taskStatus: ready.status, missionStatus: mission.status, note: "no action" };
}

function artifactKindFor(capabilityKey: string): Parameters<typeof registerCapabilityArtifact>[2] {
  if (capabilityKey.startsWith("strategy")) return "strategy_result";
  if (capabilityKey === "planning.get_execution_plan" || capabilityKey === "planning.generate_plan") return "execution_plan";
  if (capabilityKey.startsWith("planning.validate")) return "validation_result";
  if (capabilityKey === "automation.simulate_workflow") return "simulation_result";
  if (capabilityKey.startsWith("automation")) return "automation_workflow";
  if (capabilityKey.startsWith("reporting")) return "report";
  if (capabilityKey.startsWith("knowledge")) return "knowledge_context";
  return "validation_result";
}

/* ---- delegation / observation / decision (explicit records) ---------------- */

export interface DelegateAgentTaskInput { parentRunId: string; delegatingRole: AgentRole; receivingRole: AgentRole; taskKey: string; depth: number; expectedOutput?: string; constraints?: string; }
export async function delegateAgentTask(ctx: AppContext, rawMissionId: unknown, input: DelegateAgentTaskInput): Promise<{ id: string; status: string }> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_DELEGATE_CAP);
  if (!canDelegate(input.depth, mission.limits)) throw new ConflictError("Max delegation depth reached");
  const d = buildAgentDelegation(ctx.ids("adel"), missionId, requireId(input.parentRunId, "parentRunId"), mission.workspaceId, mission.clientId, input.delegatingRole, input.receivingRole, requireString(input.taskKey, "taskKey"), input.depth, input.expectedOutput ?? "", input.constraints ?? "", ctx.clock());
  unwrap(await agents.delegations.append(d));
  await advanceMissionSameStatus(ctx, mission, { delegationCount: mission.delegationCount + 1 });
  return { id: d.id, status: d.status };
}

export async function recordAgentObservation(ctx: AppContext, rawMissionId: unknown, input: { taskKey?: string | null; summary: string; data?: Record<string, unknown> }): Promise<{ id: string }> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  const { buildAgentObservation } = await import("@brightloop/domain");
  const o = buildAgentObservation(ctx.ids("aobs"), missionId, null, input.taskKey ?? null, mission.workspaceId, mission.clientId, null, requireString(input.summary, "summary"), input.data ?? {}, {}, ctx.clock());
  unwrap(await agents.observations.append(o));
  return { id: o.id };
}

export async function recordAgentDecision(ctx: AppContext, rawMissionId: unknown, input: { kind: "plan" | "delegate" | "invoke" | "request_approval" | "replan" | "retry" | "escalate" | "complete" | "cancel"; rationale: string; taskKey?: string | null }): Promise<{ id: string }> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  const d = buildAgentDecision(ctx.ids("adec"), missionId, null, mission.workspaceId, mission.clientId, input.kind, requireString(input.rationale, "rationale"), input.taskKey ?? null, {}, ctx.clock());
  unwrap(await agents.decisions.append(d));
  return { id: d.id };
}

/* ---- approvals ------------------------------------------------------------- */

export interface RequestApprovalInput { taskKey: string; approvalClass: ApprovalClass; payload: Record<string, unknown>; requestedByRole: AgentRole; assignedApproverUserId?: string | null; expiresAt?: string | null; }
export async function requestAgentApproval(ctx: AppContext, rawMissionId: unknown, input: RequestApprovalInput): Promise<AgentApprovalDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  const existing = unwrap(await agents.approvals.listByMission(missionId)).find((a) => a.taskKey === input.taskKey && a.approvalClass === input.approvalClass && (a.status === "pending" || a.status === "approved"));
  if (existing !== undefined) return toAgentApprovalDTO(existing);
  const a = buildAgentApproval({ id: ctx.ids("aapp"), missionId, taskKey: requireString(input.taskKey, "taskKey"), workspaceId: mission.workspaceId, clientId: mission.clientId, approvalClass: input.approvalClass, payload: input.payload, payloadHash: stableHash(input.payload), requestedByRole: input.requestedByRole, assignedApproverUserId: input.assignedApproverUserId ?? null, expiresAt: input.expiresAt ?? null, now: ctx.clock() });
  unwrap(await agents.approvals.append(a));
  unwrap(await agents.messages.append(buildAgentMessage({ id: ctx.ids("amsg"), missionId, workspaceId: mission.workspaceId, clientId: mission.clientId, kind: "approval_request", senderRole: input.requestedByRole, receiverUserId: input.assignedApproverUserId ?? null, correlationId: mission.correlationId, payload: { taskKey: input.taskKey, approvalClass: input.approvalClass }, now: ctx.clock() })));
  return toAgentApprovalDTO(a);
}

async function loadApproval(ctx: AppContext, approvalId: string) {
  const agents = requireAgents(ctx);
  const approval = unwrap(await agents.approvals.getById(approvalId));
  if (approval === null) throw new NotFoundError("agent approval");
  return { agents, approval };
}

export async function approveAgentAction(ctx: AppContext, rawApprovalId: unknown, input: { reason?: string } = {}): Promise<AgentApprovalDTO> {
  const approvalId = requireId(rawApprovalId, "approvalId");
  const { agents, approval } = await loadApproval(ctx, approvalId);
  authorize(ctx.actor, AGENT_APPROVE_CAP, approval.clientId);
  // A client approver may only act on approvals ASSIGNED to them.
  if (isClientRole(ctx.actor.role) && approval.assignedApproverUserId !== ctx.actor.userId) throw new ForbiddenError();
  if (approval.status !== "pending") throw new ConflictError(`Approval is ${approval.status}`);
  const next: AgentApproval = { ...approval, status: "approved", decidedByUserId: ctx.actor.userId, decisionReason: input.reason ?? null, decidedAt: ctx.clock(), version: approval.version + 1 };
  unwrap(await agents.approvals.save(next, approval.version));
  unwrap(await agents.messages.append(buildAgentMessage({ id: ctx.ids("amsg"), missionId: approval.missionId, workspaceId: approval.workspaceId, clientId: approval.clientId, kind: "approval_response", senderUserId: ctx.actor.userId, correlationId: ctx.ids("corr"), payload: { approvalId, decision: "approved" }, now: ctx.clock() })));
  return toAgentApprovalDTO(next);
}

export async function rejectAgentAction(ctx: AppContext, rawApprovalId: unknown, input: { reason?: string } = {}): Promise<AgentApprovalDTO> {
  const approvalId = requireId(rawApprovalId, "approvalId");
  const { agents, approval } = await loadApproval(ctx, approvalId);
  authorize(ctx.actor, AGENT_APPROVE_CAP, approval.clientId);
  if (isClientRole(ctx.actor.role) && approval.assignedApproverUserId !== ctx.actor.userId) throw new ForbiddenError();
  if (approval.status !== "pending") throw new ConflictError(`Approval is ${approval.status}`);
  const next: AgentApproval = { ...approval, status: "rejected", decidedByUserId: ctx.actor.userId, decisionReason: input.reason ?? null, decidedAt: ctx.clock(), version: approval.version + 1 };
  unwrap(await agents.approvals.save(next, approval.version));
  // Rejecting stops the affected task + mission.
  const mission = unwrap(await agents.missions.getById(approval.missionId))!;
  const task = unwrap(await agents.tasks.listByMission(approval.missionId)).find((t) => t.key === approval.taskKey);
  if (task !== undefined) unwrap(await agents.tasks.save({ ...task, status: "failed", updatedAt: ctx.clock(), version: task.version + 1 }, task.version));
  if (mission.status === "waiting_for_approval") await advanceMission(ctx, mission, "failed", { terminationReason: "approval rejected" });
  return toAgentApprovalDTO(next);
}

export async function expireAgentApproval(ctx: AppContext, rawApprovalId: unknown): Promise<AgentApprovalDTO> {
  const approvalId = requireId(rawApprovalId, "approvalId");
  const { agents, approval } = await loadApproval(ctx, approvalId);
  authorize(ctx.actor, AGENT_APPROVE_CAP, approval.clientId);
  if (approval.status !== "pending") return toAgentApprovalDTO(approval);
  const next: AgentApproval = { ...approval, status: "expired", decidedAt: ctx.clock(), version: approval.version + 1 };
  unwrap(await agents.approvals.save(next, approval.version));
  return toAgentApprovalDTO(next);
}

/* ---- checkpoints + resume -------------------------------------------------- */

export async function createAgentCheckpoint(ctx: AppContext, rawMissionId: unknown, label = "manual"): Promise<AgentCheckpointDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  const m = await checkpoint(ctx, mission, label);
  const cp = unwrap(await agents.checkpoints.getById(m.resumableCheckpointId!))!;
  return toAgentCheckpointDTO(cp);
}

export async function resumeAgentMission(ctx: AppContext, rawMissionId: unknown): Promise<AgentMissionDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  if (mission.status !== "waiting_for_approval") throw new ConflictError(`Cannot resume a ${mission.status} mission`);
  const resuming = await advanceMission(ctx, mission, "resuming", {});
  // Reset any tasks parked at waiting_for_approval whose approval is now approved.
  const agents = requireAgents(ctx);
  const approvals = unwrap(await agents.approvals.listByMission(missionId));
  for (const t of unwrap(await agents.tasks.listByMission(missionId))) {
    if (t.status !== "waiting_for_approval") continue;
    const approved = approvals.some((a) => a.taskKey === t.key && a.status === "approved");
    if (approved && canTransitionAgentTask(t.status, "running")) unwrap(await agents.tasks.save({ ...t, status: "ready", updatedAt: ctx.clock(), version: t.version + 1 }, t.version));
  }
  const running = await advanceMission(ctx, resuming, "running", {});
  return toAgentMissionDTO(running);
}

export async function validateAgentCheckpoint(ctx: AppContext, rawMissionId: unknown, rawCheckpointId: unknown): Promise<{ valid: boolean }> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId, AGENT_READ_CAP);
  const cp = unwrap(await agents.checkpoints.getById(requireId(rawCheckpointId, "checkpointId")));
  if (cp === null || cp.missionId !== missionId) return { valid: false };
  return { valid: cp.stateHash === stableHash(cp.snapshot) };
}

export async function invalidateAgentCheckpoint(ctx: AppContext, rawMissionId: unknown, rawCheckpointId: unknown): Promise<AgentMissionDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  const targetId = requireId(rawCheckpointId, "checkpointId");
  const cps = [...unwrap(await agents.checkpoints.listByMission(missionId))].sort((a, b) => a.sequence - b.sequence);
  const prior = cps.filter((c) => c.id !== targetId && c.sequence < (cps.find((x) => x.id === targetId)?.sequence ?? Infinity)).pop() ?? null;
  const m = await advanceMissionSameStatus(ctx, mission, { resumableCheckpointId: prior?.id ?? null });
  return toAgentMissionDTO(m);
}

/* ---- evaluation ------------------------------------------------------------ */

export async function evaluateAgentTask(ctx: AppContext, rawMissionId: unknown, rawTaskKey: unknown): Promise<AgentEvaluationDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const taskKey = requireString(rawTaskKey, "taskKey");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_REVIEW_CAP);
  const task = unwrap(await agents.tasks.listByMission(missionId)).find((t) => t.key === taskKey);
  if (task === undefined) throw new NotFoundError("agent task");
  const observations = unwrap(await agents.observations.listByMission(missionId)).filter((o) => o.taskKey === taskKey);
  const completed = task.status === "completed";
  const dims = { correctness: completed ? 85 : 40, completeness: completed ? 85 : 40, evidenceQuality: observations.length > 0 ? 80 : 50, policyCompliance: 90, goalAlignment: completed ? 85 : 45, costEfficiency: 80, executionEfficiency: task.retryCount === 0 ? 85 : 60, confidence: completed ? 80 : 40 };
  const { score, verdict } = computeEvaluationScore(dims);
  const e = buildAgentEvaluation({ id: ctx.ids("aeval"), missionId, workspaceId: mission.workspaceId, clientId: mission.clientId, targetKind: "task", targetKey: taskKey, evaluatorRole: "review", dims, score, verdict, rationale: `Task ${task.status} with ${observations.length} observation(s)`, evidence: observations.map((o) => `obs:${o.id}`), now: ctx.clock() });
  unwrap(await agents.evaluations.append(e));
  return toAgentEvaluationDTO(e);
}

export async function evaluateAgentMission(ctx: AppContext, rawMissionId: unknown): Promise<AgentEvaluationDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_REVIEW_CAP);
  const [tasks, failures, artifacts] = await Promise.all([
    agents.tasks.listByMission(missionId).then(unwrap), agents.failures.listByMission(missionId).then(unwrap), agents.artifacts.listByMission(missionId).then(unwrap),
  ]);
  const completed = tasks.filter((t) => t.status === "completed").length;
  const ratio = tasks.length === 0 ? 0 : completed / tasks.length;
  const unresolved = failures.filter((f) => f.resolution === "unresolved" && !f.retryable).length;
  const dims = { correctness: Math.round(ratio * 90), completeness: Math.round(ratio * 90), evidenceQuality: artifacts.length > 0 ? 85 : 50, policyCompliance: unresolved === 0 ? 90 : 40, goalAlignment: Math.round(ratio * 85), costEfficiency: mission.cost <= mission.limits.maxCost ? 85 : 50, executionEfficiency: mission.retryCount === 0 ? 85 : 65, confidence: Math.round(ratio * 80) };
  const { score, verdict } = computeEvaluationScore(dims);
  const e = buildAgentEvaluation({ id: ctx.ids("aeval"), missionId, workspaceId: mission.workspaceId, clientId: mission.clientId, targetKind: "mission", targetKey: missionId, evaluatorRole: "review", dims, score, verdict, rationale: `${completed}/${tasks.length} tasks completed, ${artifacts.length} artifacts, ${unresolved} unresolved failures`, evidence: artifacts.map((a) => `${a.refContext}:${a.refId}`), now: ctx.clock() });
  unwrap(await agents.evaluations.append(e));
  return toAgentEvaluationDTO(e);
}

/* ---- terminal controls + memory + feedback --------------------------------- */

export async function cancelAgentMission(ctx: AppContext, rawMissionId: unknown, reason = "cancelled"): Promise<AgentMissionDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { mission } = await loadMission(ctx, missionId, AGENT_CANCEL_CAP);
  const m = await advanceMission(ctx, mission, "cancelled", { terminationReason: reason });
  return toAgentMissionDTO(m);
}

export async function failAgentMission(ctx: AppContext, rawMissionId: unknown, reason = "failed"): Promise<AgentMissionDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  const m = await advanceMission(ctx, mission, "failed", { terminationReason: reason });
  return toAgentMissionDTO(m);
}

export async function recordAgentMemory(ctx: AppContext, rawMissionId: unknown, input: { type: AgentMemoryType; key: string; value: string; sensitivity?: "public" | "internal" | "confidential" | "restricted"; ttlSeconds?: number | null; sourceRef?: string | null }): Promise<AgentMemoryDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_RUN_CAP);
  // Never store secrets in memory: restricted-sensitivity values are redacted.
  const redacted = input.sensitivity === "restricted";
  const m = buildAgentMemory({ id: ctx.ids("amem"), missionId, workspaceId: mission.workspaceId, clientId: mission.clientId, type: input.type, key: input.key, value: redacted ? "[redacted]" : input.value, sensitivity: input.sensitivity ?? "internal", sourceRef: input.sourceRef ?? null, ttlSeconds: input.ttlSeconds ?? null, redacted, now: ctx.clock() });
  unwrap(await agents.memories.append(m));
  return toAgentMemoryDTO(m);
}

export async function submitAgentFeedback(ctx: AppContext, rawMissionId: unknown, input: { kind: AgentFeedbackKind; rating?: number | null; comment?: string | null }): Promise<AgentFeedbackDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId, AGENT_FEEDBACK_CAP);
  const f = buildAgentFeedback(ctx.ids("afb"), missionId, mission.workspaceId, mission.clientId, input.kind, input.rating ?? null, input.comment ?? null, ctx.actor.userId, ctx.clock());
  unwrap(await agents.feedback.append(f));
  return toAgentFeedbackDTO(f);
}

export { invokeAgentCapability };
