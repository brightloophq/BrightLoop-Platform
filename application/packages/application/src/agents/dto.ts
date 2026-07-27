/* =============================================================================
 * AI Agents DTOs (Phase E · Sprint E7) — the outward boundary.
 * ========================================================================== */

import type {
  AgentApproval, AgentArtifact, AgentCheckpoint, AgentDecision, AgentDelegation, AgentEvaluation, AgentFailure,
  AgentFeedback, AgentMemory, AgentMessage, AgentMission, AgentObservation, AgentProfile, AgentRun, AgentTask,
  AgentToolCall, CapabilityDefinition,
} from "@brightloop/schema";

export interface AgentProfileDTO { id: string; name: string; role: AgentProfile["role"]; purpose: string; status: AgentProfile["status"]; allowedCapabilities: string[]; prohibitedCapabilities: string[]; approvalRequirements: string[]; maxRetries: number; maxDelegationDepth: number; version: number; }
export const toAgentProfileDTO = (p: AgentProfile): AgentProfileDTO => ({ id: p.id, name: p.name, role: p.role, purpose: p.purpose, status: p.status, allowedCapabilities: p.allowedCapabilities, prohibitedCapabilities: p.prohibitedCapabilities, approvalRequirements: p.approvalRequirements, maxRetries: p.maxRetries, maxDelegationDepth: p.maxDelegationDepth, version: p.version });

export interface AgentMissionDTO {
  id: string; title: string; goal: string; status: AgentMission["status"]; coordinatorProfileId: string;
  planLocked: boolean; planHash: string; resumableCheckpointId: string | null; correlationId: string;
  runCount: number; taskCount: number; delegationCount: number; retryCount: number; checkpointCount: number;
  capabilityCalls: number; failedCapabilityCalls: number; approvalWaitMs: number; tokenTotal: number; cost: number;
  progress: number; terminationReason: string; planningDurationMs: number; durationMs: number; version: number; createdAt: string; updatedAt: string;
}
export const toAgentMissionDTO = (m: AgentMission): AgentMissionDTO => ({ id: m.id, title: m.title, goal: m.goal, status: m.status, coordinatorProfileId: m.coordinatorProfileId, planLocked: m.planLocked, planHash: m.planHash, resumableCheckpointId: m.resumableCheckpointId, correlationId: m.correlationId, runCount: m.runCount, taskCount: m.taskCount, delegationCount: m.delegationCount, retryCount: m.retryCount, checkpointCount: m.checkpointCount, capabilityCalls: m.capabilityCalls, failedCapabilityCalls: m.failedCapabilityCalls, approvalWaitMs: m.approvalWaitMs, tokenTotal: m.tokenTotal, cost: m.cost, progress: m.progress, terminationReason: m.terminationReason, planningDurationMs: m.planningDurationMs, durationMs: m.durationMs, version: m.version, createdAt: m.createdAt, updatedAt: m.updatedAt });

export interface AgentRunDTO { id: string; agentProfileId: string; role: AgentRun["role"]; status: AgentRun["status"]; delegationDepth: number; parentRunId: string | null; traceId: string; }
export const toAgentRunDTO = (r: AgentRun): AgentRunDTO => ({ id: r.id, agentProfileId: r.agentProfileId, role: r.role, status: r.status, delegationDepth: r.delegationDepth, parentRunId: r.parentRunId, traceId: r.traceId });

export interface AgentTaskDTO {
  id: string; key: string; kind: AgentTask["kind"]; title: string; assignedRole: AgentTask["assignedRole"]; capabilityKey: string | null;
  dependsOn: string[]; parallelizable: boolean; optional: boolean; approvalGated: boolean; approvalClass: string | null; status: AgentTask["status"];
  retryCount: number; resultArtifactId: string | null; claimedBy: string | null; leaseExpiresAt: string | null; order: number;
}
export const toAgentTaskDTO = (t: AgentTask): AgentTaskDTO => ({ id: t.id, key: t.key, kind: t.kind, title: t.title, assignedRole: t.assignedRole, capabilityKey: t.capabilityKey, dependsOn: t.dependsOn, parallelizable: t.parallelizable, optional: t.optional, approvalGated: t.approvalGated, approvalClass: t.approvalClass, status: t.status, retryCount: t.retryCount, resultArtifactId: t.resultArtifactId, claimedBy: t.claimedBy, leaseExpiresAt: t.leaseExpiresAt, order: t.order });

export interface AgentDelegationDTO { id: string; delegatingRole: string; receivingRole: string; taskKey: string; depth: number; status: AgentDelegation["status"]; resultArtifactId: string | null; }
export const toAgentDelegationDTO = (d: AgentDelegation): AgentDelegationDTO => ({ id: d.id, delegatingRole: d.delegatingRole, receivingRole: d.receivingRole, taskKey: d.taskKey, depth: d.depth, status: d.status, resultArtifactId: d.resultArtifactId });

export interface AgentMessageDTO { id: string; kind: AgentMessage["kind"]; senderRole: string | null; receiverRole: string | null; correlationId: string; parentMessageId: string | null; payload: Record<string, unknown>; createdAt: string; }
export const toAgentMessageDTO = (m: AgentMessage): AgentMessageDTO => ({ id: m.id, kind: m.kind, senderRole: m.senderRole, receiverRole: m.receiverRole, correlationId: m.correlationId, parentMessageId: m.parentMessageId, payload: m.payload, createdAt: m.createdAt });

export interface AgentObservationDTO { id: string; taskKey: string | null; capabilityKey: string | null; summary: string; provenance: Record<string, unknown>; createdAt: string; }
export const toAgentObservationDTO = (o: AgentObservation): AgentObservationDTO => ({ id: o.id, taskKey: o.taskKey, capabilityKey: o.capabilityKey, summary: o.summary, provenance: o.provenance, createdAt: o.createdAt });

export interface AgentDecisionDTO { id: string; kind: AgentDecision["kind"]; rationale: string; taskKey: string | null; createdAt: string; }
export const toAgentDecisionDTO = (d: AgentDecision): AgentDecisionDTO => ({ id: d.id, kind: d.kind, rationale: d.rationale, taskKey: d.taskKey, createdAt: d.createdAt });

export interface AgentToolCallDTO { id: string; taskKey: string | null; capabilityKey: string; requiredPermission: string; sideEffect: string; ok: boolean; outputRef: string | null; durationMs: number; idempotencyKey: string; errorCode: string | null; createdAt: string; }
export const toAgentToolCallDTO = (c: AgentToolCall): AgentToolCallDTO => ({ id: c.id, taskKey: c.taskKey, capabilityKey: c.capabilityKey, requiredPermission: c.requiredPermission, sideEffect: c.sideEffect, ok: c.ok, outputRef: c.outputRef, durationMs: c.durationMs, idempotencyKey: c.idempotencyKey, errorCode: c.errorCode, createdAt: c.createdAt });

export interface AgentCheckpointDTO { id: string; label: string; missionStatus: string; stateHash: string; sequence: number; createdAt: string; }
export const toAgentCheckpointDTO = (c: AgentCheckpoint): AgentCheckpointDTO => ({ id: c.id, label: c.label, missionStatus: c.missionStatus, stateHash: c.stateHash, sequence: c.sequence, createdAt: c.createdAt });

export interface AgentApprovalDTO { id: string; taskKey: string; approvalClass: string; status: AgentApproval["status"]; payloadHash: string; assignedApproverUserId: string | null; decidedByUserId: string | null; requestedAt: string; decidedAt: string | null; expiresAt: string | null; }
export const toAgentApprovalDTO = (a: AgentApproval): AgentApprovalDTO => ({ id: a.id, taskKey: a.taskKey, approvalClass: a.approvalClass, status: a.status, payloadHash: a.payloadHash, assignedApproverUserId: a.assignedApproverUserId, decidedByUserId: a.decidedByUserId, requestedAt: a.requestedAt, decidedAt: a.decidedAt, expiresAt: a.expiresAt });

export interface AgentEvaluationDTO { id: string; targetKind: string; targetKey: string; evaluatorRole: string; score: number; verdict: AgentEvaluation["verdict"]; rationale: string; evidence: string[]; requiredRemediation: string; humanAccepted: boolean | null; }
export const toAgentEvaluationDTO = (e: AgentEvaluation): AgentEvaluationDTO => ({ id: e.id, targetKind: e.targetKind, targetKey: e.targetKey, evaluatorRole: e.evaluatorRole, score: e.score, verdict: e.verdict, rationale: e.rationale, evidence: e.evidence, requiredRemediation: e.requiredRemediation, humanAccepted: e.humanAccepted });

export interface AgentMemoryDTO { id: string; type: AgentMemory["type"]; key: string; value: string; sensitivity: string; redacted: boolean; ttlSeconds: number | null; createdAt: string; }
export const toAgentMemoryDTO = (m: AgentMemory): AgentMemoryDTO => ({ id: m.id, type: m.type, key: m.key, value: m.redacted ? "[redacted]" : m.value, sensitivity: m.sensitivity, redacted: m.redacted, ttlSeconds: m.ttlSeconds, createdAt: m.createdAt });

export interface AgentArtifactDTO { id: string; kind: AgentArtifact["kind"]; refContext: string; refId: string; title: string; citations: string[]; producedByRole: string; taskKey: string | null; createdAt: string; }
export const toAgentArtifactDTO = (a: AgentArtifact): AgentArtifactDTO => ({ id: a.id, kind: a.kind, refContext: a.refContext, refId: a.refId, title: a.title, citations: a.citations, producedByRole: a.producedByRole, taskKey: a.taskKey, createdAt: a.createdAt });

export interface AgentFailureDTO { id: string; category: AgentFailure["category"]; stage: string; cause: string; retryable: boolean; retryCount: number; affectedTaskKey: string | null; affectedCapability: string | null; resolution: string; createdAt: string; }
export const toAgentFailureDTO = (f: AgentFailure): AgentFailureDTO => ({ id: f.id, category: f.category, stage: f.stage, cause: f.cause, retryable: f.retryable, retryCount: f.retryCount, affectedTaskKey: f.affectedTaskKey, affectedCapability: f.affectedCapability, resolution: f.resolution, createdAt: f.createdAt });

export interface AgentFeedbackDTO { id: string; kind: AgentFeedback["kind"]; rating: number | null; comment: string | null; subjectUserId: string; createdAt: string; }
export const toAgentFeedbackDTO = (f: AgentFeedback): AgentFeedbackDTO => ({ id: f.id, kind: f.kind, rating: f.rating, comment: f.comment, subjectUserId: f.subjectUserId, createdAt: f.createdAt });

export interface CapabilityDefinitionDTO { key: string; owningContext: string; service: string; requiredPermission: string; sideEffect: string; approval: string; retry: string; idempotency: string; timeoutMs: number; costCategory: string; description: string; }
export const toCapabilityDefinitionDTO = (c: CapabilityDefinition): CapabilityDefinitionDTO => ({ key: c.key, owningContext: c.owningContext, service: c.service, requiredPermission: c.requiredPermission, sideEffect: c.sideEffect, approval: c.approval, retry: c.retry, idempotency: c.idempotency, timeoutMs: c.timeoutMs, costCategory: c.costCategory, description: c.description });

/** The normalized result of a Tool Gateway invocation. */
export interface CapabilityResultDTO { capabilityKey: string; ok: boolean; outputRef: string | null; refContext: string | null; summary: string; citations: string[]; fromCache: boolean; }

/** One step of the orchestration engine. */
export interface StepResultDTO { taskKey: string | null; taskStatus: string | null; missionStatus: string; note: string; }

export interface MissionDetailDTO {
  mission: AgentMissionDTO;
  tasks: AgentTaskDTO[];
  runs: AgentRunDTO[];
  delegations: AgentDelegationDTO[];
  approvals: AgentApprovalDTO[];
  artifacts: AgentArtifactDTO[];
  evaluations: AgentEvaluationDTO[];
  failures: AgentFailureDTO[];
}

export interface AgentOpsDashboardDTO { activeMissions: number; waitingApprovals: number; failedMissions: number; completedMissions: number; totalMissions: number; }
