/* =============================================================================
 * Supabase AI Agents repositories (Phase E · Sprint E7).
 *
 * Seventeen adapters (untyped-cast pattern; mappers are the boundary). Versioned
 * (optimistic concurrency): profiles, missions, runs, tasks, approvals. Append-only:
 * delegations, messages, observations, decisions, tool calls, checkpoints,
 * evaluations, memories, artifacts, failures, feedback. Capability definitions
 * upsert by key.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type AgentApprovalRepository, type AgentArtifactRepository, type AgentCheckpointRepository, type AgentDecisionRepository,
  type AgentDelegationRepository, type AgentEvaluationRepository, type AgentFailureRepository, type AgentFeedbackRepository,
  type AgentMemoryRepository, type AgentMessageRepository, type AgentMissionRepository, type AgentObservationRepository,
  type AgentProfileRepository, type AgentRunRepository, type AgentTaskRepository, type AgentToolCallRepository,
  type CapabilityDefinitionRepository, type RuntimeResult,
} from "@brightloop/domain";
import type {
  AgentApproval, AgentArtifact, AgentCheckpoint, AgentDecision, AgentDelegation, AgentEvaluation, AgentFailure,
  AgentFeedback, AgentMemory, AgentMessage, AgentMission, AgentObservation, AgentProfile, AgentRun, AgentTask,
  AgentToolCall, CapabilityDefinition,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

function appendRepo<T>(db: SupabaseClient, table: string, toRow: (t: T) => Record<string, unknown>, toDomain: (r: Record<string, unknown>) => T, ctx: string) {
  return async (row: T): Promise<RuntimeResult<T>> => {
    const { data, error } = await db.from(table).insert(toRow(row)).select("*").single();
    if (error) return mapDatabaseError(error, `${ctx}.append`);
    return ok("created", toDomain(data as Record<string, unknown>));
  };
}
function listByCol<T>(db: SupabaseClient, table: string, col: string, toDomain: (r: Record<string, unknown>) => T, ctx: string, orderCol = "created_at") {
  return async (value: string): Promise<RuntimeResult<T[]>> => {
    const { data, error } = await db.from(table).select("*").eq(col, value).order(orderCol, { ascending: true });
    if (error) return mapDatabaseError(error, `${ctx}.list`);
    return ok("found", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}

export class SupabaseAgentProfileRepository implements AgentProfileRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(r: AgentProfile) { const { data, error } = await this.db.from("agent_profile").insert(m.profileRow(r)).select("*").single(); if (error) return mapDatabaseError(error, "agentProfile.create"); return ok("created", m.toProfile(data as Record<string, unknown>)); }
  async getById(id: string) { const { data, error } = await this.db.from("agent_profile").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "agentProfile.getById"); return ok("found", data ? m.toProfile(data as Record<string, unknown>) : null); }
  async listByWorkspace(w: string) { const { data, error } = await this.db.from("agent_profile").select("*").eq("workspace_id", w).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "agentProfile.list"); return ok("found", (data ?? []).map((r) => m.toProfile(r as Record<string, unknown>))); }
  async save(next: AgentProfile, expected: number) { const { data, error } = await this.db.from("agent_profile").update(m.profileRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "agentProfile.save"); if (data === null) return err("conflict", "agentProfile.save: version mismatch"); return ok("updated", m.toProfile(data as Record<string, unknown>)); }
}

export class SupabaseAgentMissionRepository implements AgentMissionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(r: AgentMission) { const { data, error } = await this.db.from("agent_mission").insert(m.missionRow(r)).select("*").single(); if (error) return mapDatabaseError(error, "agentMission.create"); return ok("created", m.toMission(data as Record<string, unknown>)); }
  async getById(id: string) { const { data, error } = await this.db.from("agent_mission").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "agentMission.getById"); return ok("found", data ? m.toMission(data as Record<string, unknown>) : null); }
  async listByWorkspace(w: string) { const { data, error } = await this.db.from("agent_mission").select("*").eq("workspace_id", w).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "agentMission.list"); return ok("found", (data ?? []).map((r) => m.toMission(r as Record<string, unknown>))); }
  async save(next: AgentMission, expected: number) { const { data, error } = await this.db.from("agent_mission").update(m.missionRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "agentMission.save"); if (data === null) return err("conflict", "agentMission.save: version mismatch"); return ok("updated", m.toMission(data as Record<string, unknown>)); }
}

export class SupabaseAgentRunRepository implements AgentRunRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(r: AgentRun) { const { data, error } = await this.db.from("agent_run").insert(m.runRow(r)).select("*").single(); if (error) return mapDatabaseError(error, "agentRun.create"); return ok("created", m.toRun(data as Record<string, unknown>)); }
  async getById(id: string) { const { data, error } = await this.db.from("agent_run").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "agentRun.getById"); return ok("found", data ? m.toRun(data as Record<string, unknown>) : null); }
  listByMission(id: string) { return listByCol<AgentRun>(this.db, "agent_run", "mission_id", m.toRun, "agentRun")(id); }
  async save(next: AgentRun, expected: number) { const { data, error } = await this.db.from("agent_run").update(m.runRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "agentRun.save"); if (data === null) return err("conflict", "agentRun.save: version mismatch"); return ok("updated", m.toRun(data as Record<string, unknown>)); }
}

export class SupabaseAgentTaskRepository implements AgentTaskRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly AgentTask[]) { if (rows.length === 0) return ok("created", [] as AgentTask[]); const { data, error } = await this.db.from("agent_task").insert(rows.map(m.taskRow)).select("*"); if (error) return mapDatabaseError(error, "agentTask.appendMany"); return ok("created", (data ?? []).map((r) => m.toTask(r as Record<string, unknown>))); }
  async getById(id: string) { const { data, error } = await this.db.from("agent_task").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "agentTask.getById"); return ok("found", data ? m.toTask(data as Record<string, unknown>) : null); }
  listByMission(id: string) { return listByCol<AgentTask>(this.db, "agent_task", "mission_id", m.toTask, "agentTask", "order_index")(id); }
  async save(next: AgentTask, expected: number) { const { data, error } = await this.db.from("agent_task").update(m.taskRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "agentTask.save"); if (data === null) return err("conflict", "agentTask.save: version mismatch"); return ok("updated", m.toTask(data as Record<string, unknown>)); }
}

export class SupabaseAgentDelegationRepository implements AgentDelegationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentDelegation) { return appendRepo<AgentDelegation>(this.db, "agent_delegation", m.delegationRow, m.toDelegation, "agentDelegation")(r); }
  listByMission(id: string) { return listByCol<AgentDelegation>(this.db, "agent_delegation", "mission_id", m.toDelegation, "agentDelegation")(id); }
}
export class SupabaseAgentMessageRepository implements AgentMessageRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentMessage) { return appendRepo<AgentMessage>(this.db, "agent_message", m.messageRow, m.toMessage, "agentMessage")(r); }
  listByMission(id: string) { return listByCol<AgentMessage>(this.db, "agent_message", "mission_id", m.toMessage, "agentMessage")(id); }
}
export class SupabaseAgentObservationRepository implements AgentObservationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentObservation) { return appendRepo<AgentObservation>(this.db, "agent_observation", m.observationRow, m.toObservation, "agentObservation")(r); }
  listByMission(id: string) { return listByCol<AgentObservation>(this.db, "agent_observation", "mission_id", m.toObservation, "agentObservation")(id); }
}
export class SupabaseAgentDecisionRepository implements AgentDecisionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentDecision) { return appendRepo<AgentDecision>(this.db, "agent_decision", m.decisionRow, m.toDecision, "agentDecision")(r); }
  listByMission(id: string) { return listByCol<AgentDecision>(this.db, "agent_decision", "mission_id", m.toDecision, "agentDecision")(id); }
}
export class SupabaseAgentToolCallRepository implements AgentToolCallRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentToolCall) { return appendRepo<AgentToolCall>(this.db, "agent_tool_call", m.toolCallRow, m.toToolCall, "agentToolCall")(r); }
  listByMission(id: string) { return listByCol<AgentToolCall>(this.db, "agent_tool_call", "mission_id", m.toToolCall, "agentToolCall")(id); }
  async findByIdempotencyKey(missionId: string, key: string) { const { data, error } = await this.db.from("agent_tool_call").select("*").eq("mission_id", missionId).eq("idempotency_key", key).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) return mapDatabaseError(error, "agentToolCall.findByIdempotencyKey"); return ok("found", data ? m.toToolCall(data as Record<string, unknown>) : null); }
}
export class SupabaseAgentCheckpointRepository implements AgentCheckpointRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentCheckpoint) { return appendRepo<AgentCheckpoint>(this.db, "agent_checkpoint", m.checkpointRow, m.toCheckpoint, "agentCheckpoint")(r); }
  async getById(id: string) { const { data, error } = await this.db.from("agent_checkpoint").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "agentCheckpoint.getById"); return ok("found", data ? m.toCheckpoint(data as Record<string, unknown>) : null); }
  listByMission(id: string) { return listByCol<AgentCheckpoint>(this.db, "agent_checkpoint", "mission_id", m.toCheckpoint, "agentCheckpoint", "sequence")(id); }
}
export class SupabaseAgentApprovalRepository implements AgentApprovalRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentApproval) { return appendRepo<AgentApproval>(this.db, "agent_approval", m.approvalRow, m.toApproval, "agentApproval")(r); }
  async getById(id: string) { const { data, error } = await this.db.from("agent_approval").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "agentApproval.getById"); return ok("found", data ? m.toApproval(data as Record<string, unknown>) : null); }
  listByMission(id: string) { return listByCol<AgentApproval>(this.db, "agent_approval", "mission_id", m.toApproval, "agentApproval")(id); }
  async save(next: AgentApproval, expected: number) { const { data, error } = await this.db.from("agent_approval").update({ status: next.status, decided_by_user_id: next.decidedByUserId, decision_reason: next.decisionReason, decided_at: next.decidedAt, version: next.version }).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "agentApproval.save"); if (data === null) return err("conflict", "agentApproval.save: version mismatch"); return ok("updated", m.toApproval(data as Record<string, unknown>)); }
}
export class SupabaseAgentEvaluationRepository implements AgentEvaluationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentEvaluation) { return appendRepo<AgentEvaluation>(this.db, "agent_evaluation", m.evaluationRow, m.toEvaluation, "agentEvaluation")(r); }
  listByMission(id: string) { return listByCol<AgentEvaluation>(this.db, "agent_evaluation", "mission_id", m.toEvaluation, "agentEvaluation")(id); }
}
export class SupabaseAgentMemoryRepository implements AgentMemoryRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentMemory) { return appendRepo<AgentMemory>(this.db, "agent_memory", m.memoryRow, m.toMemory, "agentMemory")(r); }
  listByMission(id: string) { return listByCol<AgentMemory>(this.db, "agent_memory", "mission_id", m.toMemory, "agentMemory")(id); }
}
export class SupabaseAgentArtifactRepository implements AgentArtifactRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentArtifact) { return appendRepo<AgentArtifact>(this.db, "agent_artifact", m.artifactRow, m.toArtifact, "agentArtifact")(r); }
  listByMission(id: string) { return listByCol<AgentArtifact>(this.db, "agent_artifact", "mission_id", m.toArtifact, "agentArtifact")(id); }
}
export class SupabaseAgentFailureRepository implements AgentFailureRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentFailure) { return appendRepo<AgentFailure>(this.db, "agent_failure", m.failureRow, m.toFailure, "agentFailure")(r); }
  listByMission(id: string) { return listByCol<AgentFailure>(this.db, "agent_failure", "mission_id", m.toFailure, "agentFailure")(id); }
}
export class SupabaseAgentFeedbackRepository implements AgentFeedbackRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  append(r: AgentFeedback) { return appendRepo<AgentFeedback>(this.db, "agent_feedback", m.feedbackRow, m.toFeedback, "agentFeedback")(r); }
  listByMission(id: string) { return listByCol<AgentFeedback>(this.db, "agent_feedback", "mission_id", m.toFeedback, "agentFeedback")(id); }
}
export class SupabaseCapabilityDefinitionRepository implements CapabilityDefinitionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async upsertMany(rows: readonly CapabilityDefinition[]) { if (rows.length === 0) return ok("created", [] as CapabilityDefinition[]); const { data, error } = await this.db.from("capability_definition").upsert(rows.map(m.capabilityRow), { onConflict: "key" }).select("*"); if (error) return mapDatabaseError(error, "capabilityDefinition.upsertMany"); return ok("created", (data ?? []).map((r) => m.toCapability(r as Record<string, unknown>))); }
  async list() { const { data, error } = await this.db.from("capability_definition").select("*").order("key", { ascending: true }); if (error) return mapDatabaseError(error, "capabilityDefinition.list"); return ok("found", (data ?? []).map((r) => m.toCapability(r as Record<string, unknown>))); }
}
