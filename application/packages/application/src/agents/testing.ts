/* =============================================================================
 * In-memory Agents repositories (Phase E · Sprint E7) — TEST SUPPORT.
 *
 * Versioned (optimistic concurrency): profiles, missions, runs, tasks, approvals.
 * Append-only: delegations, messages, observations, decisions, tool calls,
 * checkpoints, evaluations, memories, artifacts, failures, feedback, capabilities.
 * Upstream (Phase D + E1–E6) doubles come from their own testing modules — agents
 * reach them only via the Tool Gateway.
 * ========================================================================== */

import { ok, type AgentRepositories, type RuntimeResult } from "@brightloop/domain";
import type {
  AgentApproval, AgentArtifact, AgentCheckpoint, AgentDecision, AgentDelegation, AgentEvaluation, AgentFailure,
  AgentFeedback, AgentMemory, AgentMessage, AgentMission, AgentObservation, AgentProfile, AgentRun, AgentTask,
  AgentToolCall, CapabilityDefinition,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryAgentRepos(): AgentRepositories {
  const profiles = new Map<string, AgentProfile>();
  const missions = new Map<string, AgentMission>();
  const runs = new Map<string, AgentRun>();
  const tasks = new Map<string, AgentTask>();
  const approvals = new Map<string, AgentApproval>();
  const checkpoints = new Map<string, AgentCheckpoint>();
  const delegations: AgentDelegation[] = [];
  const messages: AgentMessage[] = [];
  const observations: AgentObservation[] = [];
  const decisions: AgentDecision[] = [];
  const toolCalls: AgentToolCall[] = [];
  const evaluations: AgentEvaluation[] = [];
  const memories: AgentMemory[] = [];
  const artifacts: AgentArtifact[] = [];
  const failures: AgentFailure[] = [];
  const feedback: AgentFeedback[] = [];
  const capabilities = new Map<string, CapabilityDefinition>();

  return {
    profiles: {
      create: async (r) => { profiles.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", profiles.get(id) ?? null),
      listByWorkspace: async (w) => ok("found", [...profiles.values()].filter((p) => p.workspaceId === w)),
      save: async (next, expected) => { const cur = profiles.get(next.id); if (!cur || cur.version !== expected) return conflict(); profiles.set(next.id, next); return ok("updated", next); },
    },
    missions: {
      create: async (r) => { missions.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", missions.get(id) ?? null),
      listByWorkspace: async (w) => ok("found", [...missions.values()].filter((m) => m.workspaceId === w)),
      save: async (next, expected) => { const cur = missions.get(next.id); if (!cur || cur.version !== expected) return conflict(); missions.set(next.id, next); return ok("updated", next); },
    },
    runs: {
      create: async (r) => { runs.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", runs.get(id) ?? null),
      listByMission: async (m) => ok("found", [...runs.values()].filter((r) => r.missionId === m)),
      save: async (next, expected) => { const cur = runs.get(next.id); if (!cur || cur.version !== expected) return conflict(); runs.set(next.id, next); return ok("updated", next); },
    },
    tasks: {
      appendMany: async (rows) => { for (const t of rows) tasks.set(t.id, t); return ok("created", [...rows]); },
      getById: async (id) => ok("found", tasks.get(id) ?? null),
      listByMission: async (m) => ok("found", [...tasks.values()].filter((t) => t.missionId === m)),
      save: async (next, expected) => { const cur = tasks.get(next.id); if (!cur || cur.version !== expected) return conflict(); tasks.set(next.id, next); return ok("updated", next); },
    },
    delegations: { append: async (r) => { delegations.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", delegations.filter((x) => x.missionId === m)) },
    messages: { append: async (r) => { messages.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", messages.filter((x) => x.missionId === m)) },
    observations: { append: async (r) => { observations.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", observations.filter((x) => x.missionId === m)) },
    decisions: { append: async (r) => { decisions.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", decisions.filter((x) => x.missionId === m)) },
    toolCalls: {
      append: async (r) => { toolCalls.push(r); return ok("created", r); },
      listByMission: async (m) => ok("found", toolCalls.filter((x) => x.missionId === m)),
      findByIdempotencyKey: async (m, key) => ok("found", toolCalls.find((x) => x.missionId === m && x.idempotencyKey === key) ?? null),
    },
    checkpoints: {
      append: async (r) => { checkpoints.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", checkpoints.get(id) ?? null),
      listByMission: async (m) => ok("found", [...checkpoints.values()].filter((c) => c.missionId === m)),
    },
    approvals: {
      append: async (r) => { approvals.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", approvals.get(id) ?? null),
      listByMission: async (m) => ok("found", [...approvals.values()].filter((a) => a.missionId === m)),
      save: async (next, expected) => { const cur = approvals.get(next.id); if (!cur || cur.version !== expected) return conflict(); approvals.set(next.id, next); return ok("updated", next); },
    },
    evaluations: { append: async (r) => { evaluations.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", evaluations.filter((x) => x.missionId === m)) },
    memories: { append: async (r) => { memories.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", memories.filter((x) => x.missionId === m)) },
    artifacts: { append: async (r) => { artifacts.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", artifacts.filter((x) => x.missionId === m)) },
    failures: { append: async (r) => { failures.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", failures.filter((x) => x.missionId === m)) },
    feedback: { append: async (r) => { feedback.push(r); return ok("created", r); }, listByMission: async (m) => ok("found", feedback.filter((x) => x.missionId === m)) },
    capabilities: { upsertMany: async (rows) => { for (const c of rows) capabilities.set(c.key, c); return ok("created", [...rows]); }, list: async () => ok("found", [...capabilities.values()]) },
  };
}
