/* =============================================================================
 * AI Agents — REPOSITORY PORTS (Phase E · Sprint E7).
 *
 * Persistence contracts; Supabase adapters live in `@brightloop/data`. Versioned
 * (optimistic concurrency): profiles, missions, runs, tasks, approvals. Append-only:
 * delegations, messages, observations, decisions, tool calls, checkpoints,
 * evaluations, memories, artifacts, failures, feedback, capability definitions.
 * Agents reach Phase D + E1–E6 ONLY via their application services (through the
 * Tool Gateway), so no upstream ports appear here. RLS is the tenant boundary.
 * ========================================================================== */

import type {
  AgentApproval, AgentArtifact, AgentCheckpoint, AgentDecision, AgentDelegation, AgentEvaluation, AgentFailure,
  AgentFeedback, AgentMemory, AgentMessage, AgentMission, AgentObservation, AgentProfile, AgentRun, AgentTask,
  AgentToolCall, CapabilityDefinition,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface AgentProfileRepository {
  create(row: AgentProfile): Promise<RuntimeResult<AgentProfile>>;
  getById(id: string): Promise<RuntimeResult<AgentProfile | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<AgentProfile[]>>;
  save(next: AgentProfile, expectedVersion: number): Promise<RuntimeResult<AgentProfile>>;
}

export interface AgentMissionRepository {
  create(row: AgentMission): Promise<RuntimeResult<AgentMission>>;
  getById(id: string): Promise<RuntimeResult<AgentMission | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<AgentMission[]>>;
  save(next: AgentMission, expectedVersion: number): Promise<RuntimeResult<AgentMission>>;
}

export interface AgentRunRepository {
  create(row: AgentRun): Promise<RuntimeResult<AgentRun>>;
  getById(id: string): Promise<RuntimeResult<AgentRun | null>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentRun[]>>;
  save(next: AgentRun, expectedVersion: number): Promise<RuntimeResult<AgentRun>>;
}

export interface AgentTaskRepository {
  appendMany(rows: readonly AgentTask[]): Promise<RuntimeResult<AgentTask[]>>;
  getById(id: string): Promise<RuntimeResult<AgentTask | null>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentTask[]>>;
  save(next: AgentTask, expectedVersion: number): Promise<RuntimeResult<AgentTask>>;
}

export interface AgentDelegationRepository {
  append(row: AgentDelegation): Promise<RuntimeResult<AgentDelegation>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentDelegation[]>>;
}
export interface AgentMessageRepository {
  append(row: AgentMessage): Promise<RuntimeResult<AgentMessage>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentMessage[]>>;
}
export interface AgentObservationRepository {
  append(row: AgentObservation): Promise<RuntimeResult<AgentObservation>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentObservation[]>>;
}
export interface AgentDecisionRepository {
  append(row: AgentDecision): Promise<RuntimeResult<AgentDecision>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentDecision[]>>;
}
export interface AgentToolCallRepository {
  append(row: AgentToolCall): Promise<RuntimeResult<AgentToolCall>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentToolCall[]>>;
  findByIdempotencyKey(missionId: string, idempotencyKey: string): Promise<RuntimeResult<AgentToolCall | null>>;
}
export interface AgentCheckpointRepository {
  append(row: AgentCheckpoint): Promise<RuntimeResult<AgentCheckpoint>>;
  getById(id: string): Promise<RuntimeResult<AgentCheckpoint | null>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentCheckpoint[]>>;
}
export interface AgentApprovalRepository {
  append(row: AgentApproval): Promise<RuntimeResult<AgentApproval>>;
  getById(id: string): Promise<RuntimeResult<AgentApproval | null>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentApproval[]>>;
  save(next: AgentApproval, expectedVersion: number): Promise<RuntimeResult<AgentApproval>>;
}
export interface AgentEvaluationRepository {
  append(row: AgentEvaluation): Promise<RuntimeResult<AgentEvaluation>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentEvaluation[]>>;
}
export interface AgentMemoryRepository {
  append(row: AgentMemory): Promise<RuntimeResult<AgentMemory>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentMemory[]>>;
}
export interface AgentArtifactRepository {
  append(row: AgentArtifact): Promise<RuntimeResult<AgentArtifact>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentArtifact[]>>;
}
export interface AgentFailureRepository {
  append(row: AgentFailure): Promise<RuntimeResult<AgentFailure>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentFailure[]>>;
}
export interface AgentFeedbackRepository {
  append(row: AgentFeedback): Promise<RuntimeResult<AgentFeedback>>;
  listByMission(missionId: string): Promise<RuntimeResult<AgentFeedback[]>>;
}
export interface CapabilityDefinitionRepository {
  upsertMany(rows: readonly CapabilityDefinition[]): Promise<RuntimeResult<CapabilityDefinition[]>>;
  list(): Promise<RuntimeResult<CapabilityDefinition[]>>;
}

/** The ports the Agents application use-cases are wired with. */
export interface AgentRepositories {
  profiles: AgentProfileRepository;
  missions: AgentMissionRepository;
  runs: AgentRunRepository;
  tasks: AgentTaskRepository;
  delegations: AgentDelegationRepository;
  messages: AgentMessageRepository;
  observations: AgentObservationRepository;
  decisions: AgentDecisionRepository;
  toolCalls: AgentToolCallRepository;
  checkpoints: AgentCheckpointRepository;
  approvals: AgentApprovalRepository;
  evaluations: AgentEvaluationRepository;
  memories: AgentMemoryRepository;
  artifacts: AgentArtifactRepository;
  failures: AgentFailureRepository;
  feedback: AgentFeedbackRepository;
  capabilities: CapabilityDefinitionRepository;
}
