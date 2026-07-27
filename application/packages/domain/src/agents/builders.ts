/* =============================================================================
 * Agent aggregate builders (Phase E · Sprint E7) — PURE.
 *
 * Immutable constructors for every agent record. Versioned roots (profile,
 * mission, run, task, approval) start at version 1; append-only records
 * (delegation, message, observation, decision, tool call, checkpoint, evaluation,
 * memory, artifact, failure, feedback) are built once and never mutated. No io.
 * ========================================================================== */

import type {
  AgentApproval, AgentArtifact, AgentArtifactKind, AgentCheckpoint, AgentDecision, AgentDecisionKind, AgentDelegation,
  AgentEvaluation, AgentFailure, AgentFeedback, AgentFeedbackKind, AgentMemory, AgentMemoryType, AgentMessage,
  AgentMessageKind, AgentMission, AgentObservation, AgentProfile, AgentRole, AgentRun, AgentTask, AgentToolCall,
  ApprovalClass, CapabilityDefinition, DelegationStatus, EvaluationVerdict, FailureCategory, MissionLimits, MissionStatus,
  Sensitivity, SideEffectClass,
} from "@brightloop/schema";
import type { CapabilitySpec } from "./capabilities.js";
import type { PlannedTask } from "./planner.js";

export const DEFAULT_MISSION_LIMITS: MissionLimits = {
  maxRuns: 20, maxTasks: 50, maxRetries: 3, maxDurationMs: 3_600_000, maxTokens: 500_000, maxCost: 25,
  maxDelegationDepth: 3, allowedCapabilities: [], prohibitedCapabilities: [], requiredApprovalClasses: [],
};

export interface BuildAgentProfileInput {
  id: string; workspaceId: string; clientId: string | null; name: string; role: AgentRole; purpose?: string;
  allowedCapabilities?: readonly string[]; prohibitedCapabilities?: readonly string[]; escalationPolicy?: string;
  approvalRequirements?: readonly ApprovalClass[]; maxRetries?: number; maxDelegationDepth?: number; now: string;
}
export function buildAgentProfile(i: BuildAgentProfileInput): AgentProfile {
  return {
    id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, name: i.name.slice(0, 200), role: i.role, purpose: i.purpose ?? "",
    allowedCapabilities: [...(i.allowedCapabilities ?? [])], prohibitedCapabilities: [...(i.prohibitedCapabilities ?? [])],
    inputContract: {}, outputContract: {}, escalationPolicy: i.escalationPolicy ?? "", approvalRequirements: [...(i.approvalRequirements ?? [])],
    maxRetries: i.maxRetries ?? 2, maxDelegationDepth: i.maxDelegationDepth ?? 3, status: "draft", version: 1, createdAt: i.now, updatedAt: i.now,
  };
}

export interface BuildAgentMissionInput {
  id: string; workspaceId: string; clientId: string | null; coordinatorProfileId: string; title: string; goal?: string;
  requestedByUserId: string; strategySessionId?: string | null; planningSessionId?: string | null; automationIntentId?: string | null;
  limits?: Partial<MissionLimits>; correlationId: string; now: string;
}
export function buildAgentMission(i: BuildAgentMissionInput): AgentMission {
  return {
    id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, coordinatorProfileId: i.coordinatorProfileId, title: i.title.slice(0, 300),
    goal: i.goal ?? "", status: "draft", requestedByUserId: i.requestedByUserId, strategySessionId: i.strategySessionId ?? null,
    planningSessionId: i.planningSessionId ?? null, automationIntentId: i.automationIntentId ?? null,
    limits: { ...DEFAULT_MISSION_LIMITS, ...(i.limits ?? {}) }, planHash: "", planLocked: false, resumableCheckpointId: null,
    correlationId: i.correlationId, provider: null, model: null, planningDurationMs: 0, durationMs: 0, runCount: 0, taskCount: 0,
    delegationCount: 0, retryCount: 0, checkpointCount: 0, approvalWaitMs: 0, capabilityCalls: 0, failedCapabilityCalls: 0,
    tokenTotal: 0, cost: 0, progress: 0, terminationReason: "", version: 1, createdAt: i.now, updatedAt: i.now,
  };
}

export interface BuildAgentRunInput { id: string; missionId: string; workspaceId: string; clientId: string | null; agentProfileId: string; role: AgentRole; delegationDepth?: number; parentRunId?: string | null; correlationId: string; traceId: string; now: string; }
export function buildAgentRun(i: BuildAgentRunInput): AgentRun {
  return { id: i.id, missionId: i.missionId, workspaceId: i.workspaceId, clientId: i.clientId, agentProfileId: i.agentProfileId, role: i.role, status: "created", delegationDepth: i.delegationDepth ?? 0, parentRunId: i.parentRunId ?? null, correlationId: i.correlationId, traceId: i.traceId, startedAt: null, endedAt: null, version: 1, createdAt: i.now };
}

export function buildAgentTaskFromPlan(id: string, missionId: string, workspaceId: string, clientId: string | null, t: PlannedTask, now: string): AgentTask {
  return {
    id, missionId, workspaceId, clientId, key: t.key, kind: t.kind, title: t.title.slice(0, 300), assignedRole: t.assignedRole,
    capabilityKey: t.capabilityKey, capabilityInput: t.capabilityInput, dependsOn: [...t.dependsOn], parallelizable: t.parallelizable,
    optional: t.optional, approvalGated: t.approvalGated, approvalClass: t.approvalClass, retryable: t.retryable,
    compensatesTaskKey: t.compensatesTaskKey, completionCriteria: t.completionCriteria, expectedOutput: t.expectedOutput,
    status: "pending", retryCount: 0, resultArtifactId: null, order: t.order, claimedBy: null, claimedAt: null, leaseExpiresAt: null,
    heartbeatAt: null, version: 1, createdAt: now, updatedAt: now,
  };
}

export function buildAgentDelegation(id: string, missionId: string, parentRunId: string, workspaceId: string, clientId: string | null, delegatingRole: AgentRole, receivingRole: AgentRole, taskKey: string, depth: number, expectedOutput: string, constraints: string, now: string): AgentDelegation {
  return { id, missionId, parentRunId, workspaceId, clientId, delegatingRole, receivingRole, taskKey, expectedOutput, constraints, deadline: null, depth, status: "pending" as DelegationStatus, resultArtifactId: null, failureReason: null, createdAt: now };
}

export interface BuildAgentMessageInput { id: string; missionId: string; runId?: string | null; workspaceId: string; clientId: string | null; kind: AgentMessageKind; senderRole?: AgentRole | null; senderUserId?: string | null; receiverRole?: AgentRole | null; receiverUserId?: string | null; correlationId: string; parentMessageId?: string | null; payload?: Record<string, unknown>; now: string; }
export function buildAgentMessage(i: BuildAgentMessageInput): AgentMessage {
  return { id: i.id, missionId: i.missionId, runId: i.runId ?? null, workspaceId: i.workspaceId, clientId: i.clientId, kind: i.kind, senderRole: i.senderRole ?? null, senderUserId: i.senderUserId ?? null, receiverRole: i.receiverRole ?? null, receiverUserId: i.receiverUserId ?? null, correlationId: i.correlationId, parentMessageId: i.parentMessageId ?? null, payload: i.payload ?? {}, createdAt: i.now };
}

export function buildAgentObservation(id: string, missionId: string, runId: string | null, taskKey: string | null, workspaceId: string, clientId: string | null, capabilityKey: string | null, summary: string, data: Record<string, unknown>, provenance: Record<string, unknown>, now: string): AgentObservation {
  return { id, missionId, runId, taskKey, workspaceId, clientId, capabilityKey, summary: summary.slice(0, 2000), data, provenance, createdAt: now };
}

export function buildAgentDecision(id: string, missionId: string, runId: string | null, workspaceId: string, clientId: string | null, kind: AgentDecisionKind, rationale: string, taskKey: string | null, data: Record<string, unknown>, now: string): AgentDecision {
  return { id, missionId, runId, workspaceId, clientId, kind, rationale: rationale.slice(0, 2000), taskKey, data, createdAt: now };
}

export interface BuildAgentToolCallInput {
  id: string; missionId: string; runId: string | null; taskKey: string | null; workspaceId: string; clientId: string | null;
  capabilityKey: string; requiredPermission: string; sideEffect: SideEffectClass; input: Record<string, unknown>; outputRef: string | null;
  ok: boolean; durationMs: number; tokenTotal: number; cost: number; idempotencyKey: string; correlationId: string; errorCode?: string | null; now: string;
}
export function buildAgentToolCall(i: BuildAgentToolCallInput): AgentToolCall {
  return { id: i.id, missionId: i.missionId, runId: i.runId, taskKey: i.taskKey, workspaceId: i.workspaceId, clientId: i.clientId, capabilityKey: i.capabilityKey, requiredPermission: i.requiredPermission, sideEffect: i.sideEffect, input: i.input, outputRef: i.outputRef, ok: i.ok, durationMs: i.durationMs, tokenTotal: i.tokenTotal, cost: i.cost, idempotencyKey: i.idempotencyKey, correlationId: i.correlationId, errorCode: i.errorCode ?? null, createdAt: i.now };
}

export function buildAgentCheckpoint(id: string, missionId: string, workspaceId: string, clientId: string | null, label: string, missionStatus: MissionStatus, stateHash: string, snapshot: Record<string, unknown>, sequence: number, now: string): AgentCheckpoint {
  return { id, missionId, workspaceId, clientId, label, missionStatus, stateHash, snapshot, sequence, createdAt: now };
}

export interface BuildAgentApprovalInput { id: string; missionId: string; taskKey: string; workspaceId: string; clientId: string | null; approvalClass: ApprovalClass; payload: Record<string, unknown>; payloadHash: string; requestedByRole: AgentRole; assignedApproverUserId?: string | null; expiresAt?: string | null; now: string; }
export function buildAgentApproval(i: BuildAgentApprovalInput): AgentApproval {
  return { id: i.id, missionId: i.missionId, taskKey: i.taskKey, workspaceId: i.workspaceId, clientId: i.clientId, approvalClass: i.approvalClass, status: "pending", payload: i.payload, payloadHash: i.payloadHash, requestedByRole: i.requestedByRole, assignedApproverUserId: i.assignedApproverUserId ?? null, decidedByUserId: null, decisionReason: null, requestedAt: i.now, decidedAt: null, expiresAt: i.expiresAt ?? null, version: 1, createdAt: i.now };
}

export interface BuildAgentEvaluationInput {
  id: string; missionId: string; workspaceId: string; clientId: string | null; targetKind: "task" | "mission"; targetKey: string;
  evaluatorRole: AgentRole; dims: { correctness: number; completeness: number; evidenceQuality: number; policyCompliance: number; goalAlignment: number; costEfficiency: number; executionEfficiency: number; confidence: number };
  humanAccepted?: boolean | null; score: number; verdict: EvaluationVerdict; rationale?: string; evidence?: readonly string[]; requiredRemediation?: string; now: string;
}
export function buildAgentEvaluation(i: BuildAgentEvaluationInput): AgentEvaluation {
  return { id: i.id, missionId: i.missionId, workspaceId: i.workspaceId, clientId: i.clientId, targetKind: i.targetKind, targetKey: i.targetKey, evaluatorRole: i.evaluatorRole, ...i.dims, humanAccepted: i.humanAccepted ?? null, score: i.score, verdict: i.verdict, rationale: i.rationale ?? "", evidence: [...(i.evidence ?? [])], requiredRemediation: i.requiredRemediation ?? "", createdAt: i.now };
}

export interface BuildAgentMemoryInput { id: string; missionId: string; workspaceId: string; clientId: string | null; type: AgentMemoryType; key: string; value: string; sensitivity?: Sensitivity; sourceRef?: string | null; ttlSeconds?: number | null; redacted?: boolean; now: string; }
export function buildAgentMemory(i: BuildAgentMemoryInput): AgentMemory {
  return { id: i.id, missionId: i.missionId, workspaceId: i.workspaceId, clientId: i.clientId, type: i.type, key: i.key.slice(0, 200), value: i.value.slice(0, 8000), sensitivity: i.sensitivity ?? "internal", sourceRef: i.sourceRef ?? null, ttlSeconds: i.ttlSeconds ?? null, redacted: i.redacted ?? false, createdAt: i.now };
}

export function buildAgentArtifact(id: string, missionId: string, workspaceId: string, clientId: string | null, kind: AgentArtifactKind, refContext: string, refId: string, title: string, snapshot: Record<string, unknown>, citations: readonly string[], producedByRole: AgentRole, taskKey: string | null, now: string): AgentArtifact {
  return { id, missionId, workspaceId, clientId, kind, refContext, refId, title: title.slice(0, 300), snapshot, citations: [...citations], producedByRole, taskKey, createdAt: now };
}

export function buildAgentFailure(id: string, missionId: string, runId: string | null, workspaceId: string, clientId: string | null, category: FailureCategory, stage: string, cause: string, retryable: boolean, retryCount: number, affectedTaskKey: string | null, affectedCapability: string | null, now: string): AgentFailure {
  return { id, missionId, runId, workspaceId, clientId, category, stage, cause: cause.slice(0, 2000), retryable, retryCount, affectedTaskKey, affectedCapability, resolution: "unresolved", createdAt: now };
}

export function buildAgentFeedback(id: string, missionId: string, workspaceId: string, clientId: string | null, kind: AgentFeedbackKind, rating: number | null, comment: string | null, subjectUserId: string, now: string): AgentFeedback {
  return { id, missionId, workspaceId, clientId, kind, rating, comment, subjectUserId, createdAt: now };
}

export function buildCapabilityDefinition(spec: CapabilitySpec, now: string): CapabilityDefinition {
  return { key: spec.key, owningContext: spec.owningContext, service: spec.service, requiredPermission: spec.requiredPermission, sideEffect: spec.sideEffect, approval: spec.approval, retry: spec.retry, idempotency: spec.idempotency, timeoutMs: spec.timeoutMs, costCategory: spec.costCategory, description: spec.description, createdAt: now };
}
