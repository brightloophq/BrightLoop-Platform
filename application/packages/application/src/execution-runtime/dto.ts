/* =============================================================================
 * Execution Runtime DTOs (Phase F · Sprint F3) — the outward boundary.
 *
 * DTOs NEVER carry secret material (no secretRef, tokens, URLs, or provider
 * bodies) and never leak provider-specific types. Credential state surfaces only
 * as a validation posture.
 * ========================================================================== */

import type {
  RuntimeCredentialReference, RuntimeDeployment, RuntimeDeploymentAttempt, RuntimeDeploymentEvent, RuntimeDeploymentLog,
  RuntimeExecution, RuntimeExecutionFailure, RuntimeHealthSnapshot, RuntimePolicy, RuntimeReconciliation,
  RuntimeRegistration, RuntimeRollbackRequest,
} from "@brightloop/schema";

export interface RuntimeRegistrationDTO {
  id: string; provider: RuntimeRegistration["provider"]; displayName: string; environment: RuntimeRegistration["environment"];
  status: RuntimeRegistration["status"]; healthState: RuntimeRegistration["healthState"]; providerVersion: string | null;
  supportedCapabilities: string[]; lastHealthCheckAt: string | null; createdAt: string; updatedAt: string;
}
export const toRuntimeDTO = (r: RuntimeRegistration): RuntimeRegistrationDTO => ({ id: r.id, provider: r.provider, displayName: r.displayName, environment: r.environment, status: r.status, healthState: r.healthState, providerVersion: r.providerVersion, supportedCapabilities: r.supportedCapabilities, lastHealthCheckAt: r.lastHealthCheckAt, createdAt: r.createdAt, updatedAt: r.updatedAt });

/** Credential state ONLY — never the reference/secret itself. */
export interface RuntimeCredentialStatusDTO { id: string; provider: RuntimeCredentialReference["provider"]; validationState: RuntimeCredentialReference["validationState"]; secretVersion: string; rotatedAt: string | null; expiresAt: string | null }
export const toCredentialStatusDTO = (c: RuntimeCredentialReference): RuntimeCredentialStatusDTO => ({ id: c.id, provider: c.provider, validationState: c.validationState, secretVersion: c.secretVersion, rotatedAt: c.rotatedAt, expiresAt: c.expiresAt });

export interface RuntimePolicyDTO { id: string; environment: RuntimePolicy["environment"]; provider: RuntimePolicy["provider"]; requiresApproval: boolean; exactHashApproval: boolean; rollbackRequired: boolean; healthCheckRequired: boolean; autoActivate: boolean; maxRetries: number; allowedDeployerRoles: string[] }
export const toPolicyDTO = (p: RuntimePolicy): RuntimePolicyDTO => ({ id: p.id, environment: p.environment, provider: p.provider, requiresApproval: p.requiresApproval, exactHashApproval: p.exactHashApproval, rollbackRequired: p.rollbackRequired, healthCheckRequired: p.healthCheckRequired, autoActivate: p.autoActivate, maxRetries: p.maxRetries, allowedDeployerRoles: p.allowedDeployerRoles });

export interface RuntimeHealthDTO { level: RuntimeHealthSnapshot["level"]; latencyMs: number; providerVersion: string | null; checkedAt: string }
export const toHealthDTO = (h: RuntimeHealthSnapshot): RuntimeHealthDTO => ({ level: h.level, latencyMs: h.latencyMs, providerVersion: h.providerVersion, checkedAt: h.checkedAt });

export interface DeploymentDTO {
  id: string; runtimeRegistrationId: string; provider: RuntimeDeployment["provider"]; deploymentPackageId: string;
  packageHash: string; workflowDefinitionId: string; deploymentVersion: number; targetEnvironment: RuntimeDeployment["targetEnvironment"];
  status: RuntimeDeployment["status"]; activationState: RuntimeDeployment["activationState"]; externalWorkflowId: string | null;
  approvalReferenceId: string | null; approvalExpiresAt: string | null; previousDeploymentId: string | null;
  rollbackSourceDeploymentId: string | null; deployedByUserId: string | null; deployedAt: string | null; createdAt: string; updatedAt: string;
}
export const toDeploymentDTO = (d: RuntimeDeployment): DeploymentDTO => ({ id: d.id, runtimeRegistrationId: d.runtimeRegistrationId, provider: d.provider, deploymentPackageId: d.deploymentPackageId, packageHash: d.packageHash, workflowDefinitionId: d.workflowDefinitionId, deploymentVersion: d.deploymentVersion, targetEnvironment: d.targetEnvironment, status: d.status, activationState: d.activationState, externalWorkflowId: d.externalWorkflowId, approvalReferenceId: d.approvalReferenceId, approvalExpiresAt: d.approvalExpiresAt, previousDeploymentId: d.previousDeploymentId, rollbackSourceDeploymentId: d.rollbackSourceDeploymentId, deployedByUserId: d.deployedByUserId, deployedAt: d.deployedAt, createdAt: d.createdAt, updatedAt: d.updatedAt });

export interface DeploymentEventDTO { id: string; operation: RuntimeDeploymentEvent["operation"]; fromStatus: string | null; toStatus: string | null; actorUserId: string | null; reason: string; createdAt: string }
export const toEventDTO = (e: RuntimeDeploymentEvent): DeploymentEventDTO => ({ id: e.id, operation: e.operation, fromStatus: e.fromStatus, toStatus: e.toStatus, actorUserId: e.actorUserId, reason: e.reason, createdAt: e.createdAt });

export interface DeploymentAttemptDTO { id: string; operation: RuntimeDeploymentAttempt["operation"]; attemptNumber: number; status: RuntimeDeploymentAttempt["status"]; failureCategory: string | null; providerCode: string | null; startedAt: string; finishedAt: string | null }
export const toAttemptDTO = (a: RuntimeDeploymentAttempt): DeploymentAttemptDTO => ({ id: a.id, operation: a.operation, attemptNumber: a.attemptNumber, status: a.status, failureCategory: a.failureCategory, providerCode: a.providerCode, startedAt: a.startedAt, finishedAt: a.finishedAt });

export interface DeploymentLogDTO { id: string; operation: string; severity: RuntimeDeploymentLog["severity"]; message: string; metadata: Record<string, unknown>; createdAt: string }
export const toLogDTO = (l: RuntimeDeploymentLog): DeploymentLogDTO => ({ id: l.id, operation: l.operation, severity: l.severity, message: l.message, metadata: l.metadata, createdAt: l.createdAt });

export interface RuntimeExecutionDTO { id: string; deploymentId: string; externalExecutionId: string; status: RuntimeExecution["status"]; triggerType: string | null; retryNumber: number; durationMs: number; failureCategory: string | null; errorSummary: string; lastNode: string | null; startedAt: string | null; stoppedAt: string | null; createdAt: string }
export const toExecutionDTO = (e: RuntimeExecution): RuntimeExecutionDTO => ({ id: e.id, deploymentId: e.deploymentId, externalExecutionId: e.externalExecutionId, status: e.status, triggerType: e.triggerType, retryNumber: e.retryNumber, durationMs: e.durationMs, failureCategory: e.failureCategory, errorSummary: e.errorSummary, lastNode: e.lastNode, startedAt: e.startedAt, stoppedAt: e.stoppedAt, createdAt: e.createdAt });

export interface ExecutionFailureDTO { id: string; category: RuntimeExecutionFailure["category"]; retryable: boolean; message: string; providerCode: string | null; lastNode: string | null; createdAt: string }
export const toExecutionFailureDTO = (f: RuntimeExecutionFailure): ExecutionFailureDTO => ({ id: f.id, category: f.category, retryable: f.retryable, message: f.message, providerCode: f.providerCode, lastNode: f.lastNode, createdAt: f.createdAt });

export interface RollbackRequestDTO { id: string; sourceDeploymentId: string; targetDeploymentId: string; reason: string; status: RuntimeRollbackRequest["status"]; resultDeploymentId: string | null; createdAt: string }
export const toRollbackDTO = (r: RuntimeRollbackRequest): RollbackRequestDTO => ({ id: r.id, sourceDeploymentId: r.sourceDeploymentId, targetDeploymentId: r.targetDeploymentId, reason: r.reason, status: r.status, resultDeploymentId: r.resultDeploymentId, createdAt: r.createdAt });

export interface ReconciliationDTO { id: string; kind: RuntimeReconciliation["kind"]; driftClass: RuntimeReconciliation["driftClass"]; detail: string; createdAt: string }
export const toReconciliationDTO = (r: RuntimeReconciliation): ReconciliationDTO => ({ id: r.id, kind: r.kind, driftClass: r.driftClass, detail: r.detail, createdAt: r.createdAt });

/** The structured result of a runtime operation surfaced to callers (safe). */
export interface RuntimeOperationResultDTO { ok: boolean; deployment: DeploymentDTO | null; failureCategory: string | null; message: string; recommendedAction: string | null }
