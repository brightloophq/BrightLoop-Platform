/* =============================================================================
 * AI Agents — row ↔ domain mappers (Phase E · Sprint E7). Jsonb fields (limits,
 * contracts, capability input, payloads, snapshots, string arrays) collapse
 * defensively. The type-safe boundary.
 * ========================================================================== */

import type {
  AgentApproval, AgentArtifact, AgentCheckpoint, AgentDecision, AgentDelegation, AgentEvaluation, AgentFailure,
  AgentFeedback, AgentMemory, AgentMessage, AgentMission, AgentObservation, AgentProfile, AgentRun, AgentTask,
  AgentToolCall, CapabilityDefinition, MissionLimits,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const nint = (v: unknown): number | null => (v === null || v === undefined ? null : int(v));
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const bool = (v: unknown): boolean => v === true;

const DEFAULT_LIMITS: MissionLimits = { maxRuns: 20, maxTasks: 50, maxRetries: 3, maxDurationMs: 3_600_000, maxTokens: 500_000, maxCost: 25, maxDelegationDepth: 3, allowedCapabilities: [], prohibitedCapabilities: [], requiredApprovalClasses: [] };

export function profileRow(p: AgentProfile): Record<string, unknown> {
  return { id: p.id, workspace_id: p.workspaceId, client_id: p.clientId, name: p.name, role: p.role, purpose: p.purpose, allowed_capabilities: p.allowedCapabilities, prohibited_capabilities: p.prohibitedCapabilities, input_contract: p.inputContract, output_contract: p.outputContract, escalation_policy: p.escalationPolicy, approval_requirements: p.approvalRequirements, max_retries: p.maxRetries, max_delegation_depth: p.maxDelegationDepth, status: p.status, version: p.version, created_at: p.createdAt, updated_at: p.updatedAt };
}
export function toProfile(r: Record<string, unknown>): AgentProfile {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), role: r["role"] as AgentProfile["role"], purpose: String(r["purpose"] ?? ""), allowedCapabilities: strArr(r["allowed_capabilities"]), prohibitedCapabilities: strArr(r["prohibited_capabilities"]), inputContract: obj(r["input_contract"]), outputContract: obj(r["output_contract"]), escalationPolicy: String(r["escalation_policy"] ?? ""), approvalRequirements: strArr(r["approval_requirements"]) as AgentProfile["approvalRequirements"], maxRetries: int(r["max_retries"], 2), maxDelegationDepth: int(r["max_delegation_depth"], 3), status: r["status"] as AgentProfile["status"], version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function missionRow(m: AgentMission): Record<string, unknown> {
  return { id: m.id, workspace_id: m.workspaceId, client_id: m.clientId, coordinator_profile_id: m.coordinatorProfileId, title: m.title, goal: m.goal, status: m.status, requested_by_user_id: m.requestedByUserId, strategy_session_id: m.strategySessionId, planning_session_id: m.planningSessionId, automation_intent_id: m.automationIntentId, limits: m.limits, plan_hash: m.planHash, plan_locked: m.planLocked, resumable_checkpoint_id: m.resumableCheckpointId, correlation_id: m.correlationId, provider: m.provider, model: m.model, planning_duration_ms: m.planningDurationMs, duration_ms: m.durationMs, run_count: m.runCount, task_count: m.taskCount, delegation_count: m.delegationCount, retry_count: m.retryCount, checkpoint_count: m.checkpointCount, approval_wait_ms: m.approvalWaitMs, capability_calls: m.capabilityCalls, failed_capability_calls: m.failedCapabilityCalls, token_total: m.tokenTotal, cost: m.cost, progress: m.progress, termination_reason: m.terminationReason, version: m.version, created_at: m.createdAt, updated_at: m.updatedAt };
}
export function toMission(r: Record<string, unknown>): AgentMission {
  const limits = obj(r["limits"]);
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), coordinatorProfileId: String(r["coordinator_profile_id"]), title: String(r["title"]), goal: String(r["goal"] ?? ""), status: r["status"] as AgentMission["status"], requestedByUserId: String(r["requested_by_user_id"]), strategySessionId: nstr(r["strategy_session_id"]), planningSessionId: nstr(r["planning_session_id"]), automationIntentId: nstr(r["automation_intent_id"]), limits: Object.keys(limits).length > 0 ? (limits as unknown as MissionLimits) : DEFAULT_LIMITS, planHash: String(r["plan_hash"] ?? ""), planLocked: bool(r["plan_locked"]), resumableCheckpointId: nstr(r["resumable_checkpoint_id"]), correlationId: String(r["correlation_id"]), provider: nstr(r["provider"]), model: nstr(r["model"]), planningDurationMs: int(r["planning_duration_ms"]), durationMs: int(r["duration_ms"]), runCount: int(r["run_count"]), taskCount: int(r["task_count"]), delegationCount: int(r["delegation_count"]), retryCount: int(r["retry_count"]), checkpointCount: int(r["checkpoint_count"]), approvalWaitMs: int(r["approval_wait_ms"]), capabilityCalls: int(r["capability_calls"]), failedCapabilityCalls: int(r["failed_capability_calls"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), progress: int(r["progress"]), terminationReason: String(r["termination_reason"] ?? ""), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function runRow(r: AgentRun): Record<string, unknown> {
  return { id: r.id, mission_id: r.missionId, workspace_id: r.workspaceId, client_id: r.clientId, agent_profile_id: r.agentProfileId, role: r.role, status: r.status, delegation_depth: r.delegationDepth, parent_run_id: r.parentRunId, correlation_id: r.correlationId, trace_id: r.traceId, started_at: r.startedAt, ended_at: r.endedAt, version: r.version, created_at: r.createdAt };
}
export function toRun(r: Record<string, unknown>): AgentRun {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), agentProfileId: String(r["agent_profile_id"]), role: r["role"] as AgentRun["role"], status: r["status"] as AgentRun["status"], delegationDepth: int(r["delegation_depth"]), parentRunId: nstr(r["parent_run_id"]), correlationId: String(r["correlation_id"]), traceId: String(r["trace_id"]), startedAt: nstr(r["started_at"]), endedAt: nstr(r["ended_at"]), version: int(r["version"], 1), createdAt: String(r["created_at"]) };
}

export function taskRow(t: AgentTask): Record<string, unknown> {
  return { id: t.id, mission_id: t.missionId, workspace_id: t.workspaceId, client_id: t.clientId, key: t.key, kind: t.kind, title: t.title, assigned_role: t.assignedRole, capability_key: t.capabilityKey, capability_input: t.capabilityInput, depends_on: t.dependsOn, parallelizable: t.parallelizable, optional: t.optional, approval_gated: t.approvalGated, approval_class: t.approvalClass, retryable: t.retryable, compensates_task_key: t.compensatesTaskKey, completion_criteria: t.completionCriteria, expected_output: t.expectedOutput, status: t.status, retry_count: t.retryCount, result_artifact_id: t.resultArtifactId, order_index: t.order, claimed_by: t.claimedBy, claimed_at: t.claimedAt, lease_expires_at: t.leaseExpiresAt, heartbeat_at: t.heartbeatAt, version: t.version, created_at: t.createdAt, updated_at: t.updatedAt };
}
export function toTask(r: Record<string, unknown>): AgentTask {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), key: String(r["key"]), kind: r["kind"] as AgentTask["kind"], title: String(r["title"]), assignedRole: r["assigned_role"] as AgentTask["assignedRole"], capabilityKey: nstr(r["capability_key"]), capabilityInput: obj(r["capability_input"]), dependsOn: strArr(r["depends_on"]), parallelizable: bool(r["parallelizable"]), optional: bool(r["optional"]), approvalGated: bool(r["approval_gated"]), approvalClass: nstr(r["approval_class"]) as AgentTask["approvalClass"], retryable: bool(r["retryable"]), compensatesTaskKey: nstr(r["compensates_task_key"]), completionCriteria: String(r["completion_criteria"] ?? ""), expectedOutput: String(r["expected_output"] ?? ""), status: r["status"] as AgentTask["status"], retryCount: int(r["retry_count"]), resultArtifactId: nstr(r["result_artifact_id"]), order: int(r["order_index"]), claimedBy: nstr(r["claimed_by"]), claimedAt: nstr(r["claimed_at"]), leaseExpiresAt: nstr(r["lease_expires_at"]), heartbeatAt: nstr(r["heartbeat_at"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function delegationRow(d: AgentDelegation): Record<string, unknown> {
  return { id: d.id, mission_id: d.missionId, parent_run_id: d.parentRunId, workspace_id: d.workspaceId, client_id: d.clientId, delegating_role: d.delegatingRole, receiving_role: d.receivingRole, task_key: d.taskKey, expected_output: d.expectedOutput, constraints: d.constraints, deadline: d.deadline, depth: d.depth, status: d.status, result_artifact_id: d.resultArtifactId, failure_reason: d.failureReason, created_at: d.createdAt };
}
export function toDelegation(r: Record<string, unknown>): AgentDelegation {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), parentRunId: String(r["parent_run_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), delegatingRole: r["delegating_role"] as AgentDelegation["delegatingRole"], receivingRole: r["receiving_role"] as AgentDelegation["receivingRole"], taskKey: String(r["task_key"]), expectedOutput: String(r["expected_output"] ?? ""), constraints: String(r["constraints"] ?? ""), deadline: nstr(r["deadline"]), depth: int(r["depth"]), status: r["status"] as AgentDelegation["status"], resultArtifactId: nstr(r["result_artifact_id"]), failureReason: nstr(r["failure_reason"]), createdAt: String(r["created_at"]) };
}

export function messageRow(m: AgentMessage): Record<string, unknown> {
  return { id: m.id, mission_id: m.missionId, run_id: m.runId, workspace_id: m.workspaceId, client_id: m.clientId, kind: m.kind, sender_role: m.senderRole, sender_user_id: m.senderUserId, receiver_role: m.receiverRole, receiver_user_id: m.receiverUserId, correlation_id: m.correlationId, parent_message_id: m.parentMessageId, payload: m.payload, created_at: m.createdAt };
}
export function toMessage(r: Record<string, unknown>): AgentMessage {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), runId: nstr(r["run_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as AgentMessage["kind"], senderRole: nstr(r["sender_role"]) as AgentMessage["senderRole"], senderUserId: nstr(r["sender_user_id"]), receiverRole: nstr(r["receiver_role"]) as AgentMessage["receiverRole"], receiverUserId: nstr(r["receiver_user_id"]), correlationId: String(r["correlation_id"]), parentMessageId: nstr(r["parent_message_id"]), payload: obj(r["payload"]), createdAt: String(r["created_at"]) };
}

export function observationRow(o: AgentObservation): Record<string, unknown> {
  return { id: o.id, mission_id: o.missionId, run_id: o.runId, task_key: o.taskKey, workspace_id: o.workspaceId, client_id: o.clientId, capability_key: o.capabilityKey, summary: o.summary, data: o.data, provenance: o.provenance, created_at: o.createdAt };
}
export function toObservation(r: Record<string, unknown>): AgentObservation {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), runId: nstr(r["run_id"]), taskKey: nstr(r["task_key"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), capabilityKey: nstr(r["capability_key"]), summary: String(r["summary"] ?? ""), data: obj(r["data"]), provenance: obj(r["provenance"]), createdAt: String(r["created_at"]) };
}

export function decisionRow(d: AgentDecision): Record<string, unknown> {
  return { id: d.id, mission_id: d.missionId, run_id: d.runId, workspace_id: d.workspaceId, client_id: d.clientId, kind: d.kind, rationale: d.rationale, task_key: d.taskKey, data: d.data, created_at: d.createdAt };
}
export function toDecision(r: Record<string, unknown>): AgentDecision {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), runId: nstr(r["run_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as AgentDecision["kind"], rationale: String(r["rationale"] ?? ""), taskKey: nstr(r["task_key"]), data: obj(r["data"]), createdAt: String(r["created_at"]) };
}

export function toolCallRow(c: AgentToolCall): Record<string, unknown> {
  return { id: c.id, mission_id: c.missionId, run_id: c.runId, task_key: c.taskKey, workspace_id: c.workspaceId, client_id: c.clientId, capability_key: c.capabilityKey, required_permission: c.requiredPermission, side_effect: c.sideEffect, input: c.input, output_ref: c.outputRef, ok: c.ok, duration_ms: c.durationMs, token_total: c.tokenTotal, cost: c.cost, idempotency_key: c.idempotencyKey, correlation_id: c.correlationId, error_code: c.errorCode, created_at: c.createdAt };
}
export function toToolCall(r: Record<string, unknown>): AgentToolCall {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), runId: nstr(r["run_id"]), taskKey: nstr(r["task_key"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), capabilityKey: String(r["capability_key"]), requiredPermission: String(r["required_permission"]), sideEffect: r["side_effect"] as AgentToolCall["sideEffect"], input: obj(r["input"]), outputRef: nstr(r["output_ref"]), ok: bool(r["ok"]), durationMs: int(r["duration_ms"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), idempotencyKey: String(r["idempotency_key"]), correlationId: String(r["correlation_id"]), errorCode: nstr(r["error_code"]), createdAt: String(r["created_at"]) };
}

export function checkpointRow(c: AgentCheckpoint): Record<string, unknown> {
  return { id: c.id, mission_id: c.missionId, workspace_id: c.workspaceId, client_id: c.clientId, label: c.label, mission_status: c.missionStatus, state_hash: c.stateHash, snapshot: c.snapshot, sequence: c.sequence, created_at: c.createdAt };
}
export function toCheckpoint(r: Record<string, unknown>): AgentCheckpoint {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), label: String(r["label"] ?? ""), missionStatus: r["mission_status"] as AgentCheckpoint["missionStatus"], stateHash: String(r["state_hash"]), snapshot: obj(r["snapshot"]), sequence: int(r["sequence"]), createdAt: String(r["created_at"]) };
}

export function approvalRow(a: AgentApproval): Record<string, unknown> {
  return { id: a.id, mission_id: a.missionId, task_key: a.taskKey, workspace_id: a.workspaceId, client_id: a.clientId, approval_class: a.approvalClass, status: a.status, payload: a.payload, payload_hash: a.payloadHash, requested_by_role: a.requestedByRole, assigned_approver_user_id: a.assignedApproverUserId, decided_by_user_id: a.decidedByUserId, decision_reason: a.decisionReason, requested_at: a.requestedAt, decided_at: a.decidedAt, expires_at: a.expiresAt, version: a.version, created_at: a.createdAt };
}
export function toApproval(r: Record<string, unknown>): AgentApproval {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), taskKey: String(r["task_key"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), approvalClass: r["approval_class"] as AgentApproval["approvalClass"], status: r["status"] as AgentApproval["status"], payload: obj(r["payload"]), payloadHash: String(r["payload_hash"]), requestedByRole: r["requested_by_role"] as AgentApproval["requestedByRole"], assignedApproverUserId: nstr(r["assigned_approver_user_id"]), decidedByUserId: nstr(r["decided_by_user_id"]), decisionReason: nstr(r["decision_reason"]), requestedAt: String(r["requested_at"]), decidedAt: nstr(r["decided_at"]), expiresAt: nstr(r["expires_at"]), version: int(r["version"], 1), createdAt: String(r["created_at"]) };
}

export function evaluationRow(e: AgentEvaluation): Record<string, unknown> {
  return { id: e.id, mission_id: e.missionId, workspace_id: e.workspaceId, client_id: e.clientId, target_kind: e.targetKind, target_key: e.targetKey, evaluator_role: e.evaluatorRole, correctness: e.correctness, completeness: e.completeness, evidence_quality: e.evidenceQuality, policy_compliance: e.policyCompliance, goal_alignment: e.goalAlignment, cost_efficiency: e.costEfficiency, execution_efficiency: e.executionEfficiency, confidence: e.confidence, human_accepted: e.humanAccepted, score: e.score, verdict: e.verdict, rationale: e.rationale, evidence: e.evidence, required_remediation: e.requiredRemediation, created_at: e.createdAt };
}
export function toEvaluation(r: Record<string, unknown>): AgentEvaluation {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), targetKind: r["target_kind"] as AgentEvaluation["targetKind"], targetKey: String(r["target_key"]), evaluatorRole: r["evaluator_role"] as AgentEvaluation["evaluatorRole"], correctness: int(r["correctness"]), completeness: int(r["completeness"]), evidenceQuality: int(r["evidence_quality"]), policyCompliance: int(r["policy_compliance"]), goalAlignment: int(r["goal_alignment"]), costEfficiency: int(r["cost_efficiency"]), executionEfficiency: int(r["execution_efficiency"]), confidence: int(r["confidence"]), humanAccepted: r["human_accepted"] === null || r["human_accepted"] === undefined ? null : bool(r["human_accepted"]), score: int(r["score"]), verdict: r["verdict"] as AgentEvaluation["verdict"], rationale: String(r["rationale"] ?? ""), evidence: strArr(r["evidence"]), requiredRemediation: String(r["required_remediation"] ?? ""), createdAt: String(r["created_at"]) };
}

export function memoryRow(m: AgentMemory): Record<string, unknown> {
  return { id: m.id, mission_id: m.missionId, workspace_id: m.workspaceId, client_id: m.clientId, type: m.type, key: m.key, value: m.value, sensitivity: m.sensitivity, source_ref: m.sourceRef, ttl_seconds: m.ttlSeconds, redacted: m.redacted, created_at: m.createdAt };
}
export function toMemory(r: Record<string, unknown>): AgentMemory {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), type: r["type"] as AgentMemory["type"], key: String(r["key"]), value: String(r["value"] ?? ""), sensitivity: r["sensitivity"] as AgentMemory["sensitivity"], sourceRef: nstr(r["source_ref"]), ttlSeconds: nint(r["ttl_seconds"]), redacted: bool(r["redacted"]), createdAt: String(r["created_at"]) };
}

export function artifactRow(a: AgentArtifact): Record<string, unknown> {
  return { id: a.id, mission_id: a.missionId, workspace_id: a.workspaceId, client_id: a.clientId, kind: a.kind, ref_context: a.refContext, ref_id: a.refId, title: a.title, snapshot: a.snapshot, citations: a.citations, produced_by_role: a.producedByRole, task_key: a.taskKey, created_at: a.createdAt };
}
export function toArtifact(r: Record<string, unknown>): AgentArtifact {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as AgentArtifact["kind"], refContext: String(r["ref_context"]), refId: String(r["ref_id"]), title: String(r["title"] ?? ""), snapshot: obj(r["snapshot"]), citations: strArr(r["citations"]), producedByRole: r["produced_by_role"] as AgentArtifact["producedByRole"], taskKey: nstr(r["task_key"]), createdAt: String(r["created_at"]) };
}

export function failureRow(f: AgentFailure): Record<string, unknown> {
  return { id: f.id, mission_id: f.missionId, run_id: f.runId, workspace_id: f.workspaceId, client_id: f.clientId, category: f.category, stage: f.stage, cause: f.cause, retryable: f.retryable, retry_count: f.retryCount, affected_task_key: f.affectedTaskKey, affected_capability: f.affectedCapability, resolution: f.resolution, created_at: f.createdAt };
}
export function toFailure(r: Record<string, unknown>): AgentFailure {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), runId: nstr(r["run_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), category: r["category"] as AgentFailure["category"], stage: String(r["stage"] ?? ""), cause: String(r["cause"] ?? ""), retryable: bool(r["retryable"]), retryCount: int(r["retry_count"]), affectedTaskKey: nstr(r["affected_task_key"]), affectedCapability: nstr(r["affected_capability"]), resolution: r["resolution"] as AgentFailure["resolution"], createdAt: String(r["created_at"]) };
}

export function feedbackRow(f: AgentFeedback): Record<string, unknown> {
  return { id: f.id, mission_id: f.missionId, workspace_id: f.workspaceId, client_id: f.clientId, kind: f.kind, rating: f.rating, comment: f.comment, subject_user_id: f.subjectUserId, created_at: f.createdAt };
}
export function toFeedback(r: Record<string, unknown>): AgentFeedback {
  return { id: String(r["id"]), missionId: String(r["mission_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as AgentFeedback["kind"], rating: nint(r["rating"]), comment: nstr(r["comment"]), subjectUserId: String(r["subject_user_id"]), createdAt: String(r["created_at"]) };
}

export function capabilityRow(c: CapabilityDefinition): Record<string, unknown> {
  return { key: c.key, owning_context: c.owningContext, service: c.service, required_permission: c.requiredPermission, side_effect: c.sideEffect, approval: c.approval, retry: c.retry, idempotency: c.idempotency, timeout_ms: c.timeoutMs, cost_category: c.costCategory, description: c.description, created_at: c.createdAt };
}
export function toCapability(r: Record<string, unknown>): CapabilityDefinition {
  return { key: String(r["key"]), owningContext: String(r["owning_context"]), service: String(r["service"]), requiredPermission: String(r["required_permission"]), sideEffect: r["side_effect"] as CapabilityDefinition["sideEffect"], approval: r["approval"] as CapabilityDefinition["approval"], retry: r["retry"] as CapabilityDefinition["retry"], idempotency: r["idempotency"] as CapabilityDefinition["idempotency"], timeoutMs: int(r["timeout_ms"], 30_000), costCategory: r["cost_category"] as CapabilityDefinition["costCategory"], description: String(r["description"] ?? ""), createdAt: String(r["created_at"]) };
}
