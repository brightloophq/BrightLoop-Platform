/* =============================================================================
 * AI Agents read models (Phase E · Sprint E7).
 *
 * Read-only projections across the agent operating surface. Load-then-authorize;
 * DTOs only.
 * ========================================================================== */

import { authorize, requireAgents, AGENT_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toAgentApprovalDTO, toAgentArtifactDTO, toAgentCheckpointDTO, toAgentDelegationDTO,
  toAgentEvaluationDTO, toAgentFailureDTO, toAgentFeedbackDTO, toAgentMemoryDTO, toAgentMessageDTO, toAgentMissionDTO,
  toAgentProfileDTO, toAgentRunDTO, toAgentTaskDTO, toAgentToolCallDTO, toCapabilityDefinitionDTO,
  type AgentApprovalDTO, type AgentArtifactDTO, type AgentCheckpointDTO, type AgentEvaluationDTO, type AgentFailureDTO,
  type AgentFeedbackDTO, type AgentMemoryDTO, type AgentMessageDTO, type AgentMissionDTO, type AgentOpsDashboardDTO,
  type AgentProfileDTO, type AgentRunDTO, type AgentTaskDTO, type AgentToolCallDTO, type CapabilityDefinitionDTO,
  type MissionDetailDTO,
} from "./dto.js";
import { listCapabilities } from "@brightloop/domain";

async function loadMission(ctx: AppContext, missionId: string) {
  const agents = requireAgents(ctx);
  const mission = unwrap(await agents.missions.getById(missionId));
  if (mission === null) throw new NotFoundError("agent mission");
  authorize(ctx.actor, AGENT_READ_CAP, mission.clientId);
  return { agents, mission };
}

export async function listAgentProfiles(ctx: AppContext, rawWorkspaceId: unknown): Promise<AgentProfileDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const agents = requireAgents(ctx);
  authorize(ctx.actor, AGENT_READ_CAP, ctx.actor.clientId);
  return unwrap(await agents.profiles.listByWorkspace(workspaceId)).map(toAgentProfileDTO);
}

/** Mission Queue — every mission in a workspace, newest first. */
export async function listAgentMissions(ctx: AppContext, rawWorkspaceId: unknown): Promise<AgentMissionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const agents = requireAgents(ctx);
  authorize(ctx.actor, AGENT_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await agents.missions.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toAgentMissionDTO);
}

/** Agent Operations Dashboard — workspace-level mission counters. */
export async function getAgentOpsDashboard(ctx: AppContext, rawWorkspaceId: unknown): Promise<AgentOpsDashboardDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const agents = requireAgents(ctx);
  authorize(ctx.actor, AGENT_READ_CAP, ctx.actor.clientId);
  const missions = unwrap(await agents.missions.listByWorkspace(workspaceId));
  return {
    totalMissions: missions.length,
    activeMissions: missions.filter((m) => m.status === "running" || m.status === "planning" || m.status === "resuming").length,
    waitingApprovals: missions.filter((m) => m.status === "waiting_for_approval").length,
    failedMissions: missions.filter((m) => m.status === "failed" || m.status === "timed_out").length,
    completedMissions: missions.filter((m) => m.status === "completed").length,
  };
}

export async function getMissionDetail(ctx: AppContext, rawMissionId: unknown): Promise<MissionDetailDTO> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents, mission } = await loadMission(ctx, missionId);
  const [tasks, runs, delegations, approvals, artifacts, evaluations, failures] = await Promise.all([
    agents.tasks.listByMission(missionId).then(unwrap), agents.runs.listByMission(missionId).then(unwrap),
    agents.delegations.listByMission(missionId).then(unwrap), agents.approvals.listByMission(missionId).then(unwrap),
    agents.artifacts.listByMission(missionId).then(unwrap), agents.evaluations.listByMission(missionId).then(unwrap),
    agents.failures.listByMission(missionId).then(unwrap),
  ]);
  return {
    mission: toAgentMissionDTO(mission),
    tasks: [...tasks].sort((a, b) => a.order - b.order).map(toAgentTaskDTO),
    runs: runs.map(toAgentRunDTO), delegations: delegations.map(toAgentDelegationDTO), approvals: approvals.map(toAgentApprovalDTO),
    artifacts: artifacts.map(toAgentArtifactDTO), evaluations: evaluations.map(toAgentEvaluationDTO), failures: failures.map(toAgentFailureDTO),
  };
}

export async function getTaskGraph(ctx: AppContext, rawMissionId: unknown): Promise<AgentTaskDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return [...unwrap(await agents.tasks.listByMission(missionId))].sort((a, b) => a.order - b.order).map(toAgentTaskDTO);
}

export async function listAgentRuns(ctx: AppContext, rawMissionId: unknown): Promise<AgentRunDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.runs.listByMission(missionId)).map(toAgentRunDTO);
}

export async function getDelegationGraph(ctx: AppContext, rawMissionId: unknown): Promise<ReturnType<typeof toAgentDelegationDTO>[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.delegations.listByMission(missionId)).map(toAgentDelegationDTO);
}

/** Approval Queue — pending approvals for a mission (optionally the caller's). */
export async function getApprovalQueue(ctx: AppContext, rawMissionId: unknown): Promise<AgentApprovalDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.approvals.listByMission(missionId)).filter((a) => a.status === "pending").map(toAgentApprovalDTO);
}

export async function listToolCalls(ctx: AppContext, rawMissionId: unknown): Promise<AgentToolCallDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return [...unwrap(await agents.toolCalls.listByMission(missionId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toAgentToolCallDTO);
}

/** Capability Usage — call counts + failure counts per capability. */
export async function getCapabilityUsage(ctx: AppContext, rawMissionId: unknown): Promise<{ capabilityKey: string; calls: number; failures: number }[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  const byKey = new Map<string, { calls: number; failures: number }>();
  for (const c of unwrap(await agents.toolCalls.listByMission(missionId))) {
    const e = byKey.get(c.capabilityKey) ?? { calls: 0, failures: 0 };
    e.calls += 1; if (!c.ok) e.failures += 1; byKey.set(c.capabilityKey, e);
  }
  return [...byKey.entries()].map(([capabilityKey, v]) => ({ capabilityKey, ...v }));
}

export async function listAgentMessages(ctx: AppContext, rawMissionId: unknown): Promise<AgentMessageDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return [...unwrap(await agents.messages.listByMission(missionId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toAgentMessageDTO);
}

/** Mission Timeline — merged messages + decisions + observations, chronological. */
export async function getMissionTimeline(ctx: AppContext, rawMissionId: unknown): Promise<{ at: string; type: string; summary: string }[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  const [messages, decisions, observations] = await Promise.all([
    agents.messages.listByMission(missionId).then(unwrap), agents.decisions.listByMission(missionId).then(unwrap), agents.observations.listByMission(missionId).then(unwrap),
  ]);
  const events = [
    ...messages.map((m) => ({ at: m.createdAt, type: `message:${m.kind}`, summary: JSON.stringify(m.payload).slice(0, 120) })),
    ...decisions.map((d) => ({ at: d.createdAt, type: `decision:${d.kind}`, summary: d.rationale })),
    ...observations.map((o) => ({ at: o.createdAt, type: "observation", summary: o.summary })),
  ];
  return events.sort((a, b) => (a.at < b.at ? -1 : 1));
}

export async function listAgentCheckpoints(ctx: AppContext, rawMissionId: unknown): Promise<AgentCheckpointDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return [...unwrap(await agents.checkpoints.listByMission(missionId))].sort((a, b) => a.sequence - b.sequence).map(toAgentCheckpointDTO);
}

export async function listAgentFailures(ctx: AppContext, rawMissionId: unknown): Promise<AgentFailureDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.failures.listByMission(missionId)).map(toAgentFailureDTO);
}

export async function listAgentEvaluations(ctx: AppContext, rawMissionId: unknown): Promise<AgentEvaluationDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.evaluations.listByMission(missionId)).map(toAgentEvaluationDTO);
}

export async function listAgentArtifacts(ctx: AppContext, rawMissionId: unknown): Promise<AgentArtifactDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.artifacts.listByMission(missionId)).map(toAgentArtifactDTO);
}

export async function listAgentMemory(ctx: AppContext, rawMissionId: unknown): Promise<AgentMemoryDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return unwrap(await agents.memories.listByMission(missionId)).map(toAgentMemoryDTO);
}

/** Cost + Token Usage for a mission. */
export async function getCostTokenUsage(ctx: AppContext, rawMissionId: unknown): Promise<{ tokenTotal: number; cost: number; capabilityCalls: number; failedCapabilityCalls: number }> {
  const missionId = requireId(rawMissionId, "missionId");
  const { mission } = await loadMission(ctx, missionId);
  return { tokenTotal: mission.tokenTotal, cost: mission.cost, capabilityCalls: mission.capabilityCalls, failedCapabilityCalls: mission.failedCapabilityCalls };
}

export async function listAgentFeedback(ctx: AppContext, rawMissionId: unknown): Promise<AgentFeedbackDTO[]> {
  const missionId = requireId(rawMissionId, "missionId");
  const { agents } = await loadMission(ctx, missionId);
  return [...unwrap(await agents.feedback.listByMission(missionId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toAgentFeedbackDTO);
}

/** The capability registry (from the domain source of truth). */
export async function listCapabilityRegistry(ctx: AppContext): Promise<CapabilityDefinitionDTO[]> {
  authorize(ctx.actor, AGENT_READ_CAP, ctx.actor.clientId);
  const now = ctx.clock();
  return listCapabilities().map((s) => toCapabilityDefinitionDTO({ ...s, createdAt: now }));
}
