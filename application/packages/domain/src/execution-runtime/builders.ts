/* =============================================================================
 * Execution Runtime — immutable builders (Phase F · Sprint F3). PURE.
 *
 * Every aggregate is constructed here with sensible defaults; id + clock are
 * injected (no clock/random in the domain). Builders never see or set secrets.
 * ========================================================================== */

import type {
  ActivationState, RuntimeDeploymentStatus, RuntimeCapabilitySnapshot, RuntimeCredentialReference, RuntimeDeployment,
  RuntimeDeploymentAttempt, RuntimeDeploymentEvent, RuntimeDeploymentLog, RuntimeEnvironment, RuntimeExecution,
  RuntimeExecutionAttempt, RuntimeExecutionFailure, RuntimeFailureCategory, RuntimeHealthLevel, RuntimeHealthSnapshot,
  RuntimePolicy, RuntimeProvider, RuntimeReconciliation, RuntimeRegistration, RuntimeRollbackRequest,
  RuntimeWebhookReceipt, DeploymentOperation, DriftClass, LogSeverity, ReconciliationKind, RuntimeExecutionStatus,
} from "@brightloop/schema";

export interface BuildRuntimeRegistrationInput {
  id: string; workspaceId: string; clientId: string | null; provider: RuntimeProvider; displayName: string;
  environment: RuntimeEnvironment; baseUrlRef: string; credentialReferenceId: string | null; createdByUserId: string;
  correlationId: string; now: string;
}
export function buildRuntimeRegistration(i: BuildRuntimeRegistrationInput): RuntimeRegistration {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, provider: i.provider, displayName: i.displayName, environment: i.environment, baseUrlRef: i.baseUrlRef, credentialReferenceId: i.credentialReferenceId, status: "pending_configuration", providerVersion: null, supportedCapabilities: [], healthState: "unknown", lastHealthCheckAt: null, createdByUserId: i.createdByUserId, correlationId: i.correlationId, version: 1, createdAt: i.now, updatedAt: i.now };
}

export interface BuildCredentialReferenceInput {
  id: string; workspaceId: string; clientId: string | null; runtimeRegistrationId: string | null; provider: RuntimeProvider;
  secretRef: string; secretVersion?: string; metadata?: Record<string, unknown>; expiresAt?: string | null; createdByUserId: string; now: string;
}
export function buildCredentialReference(i: BuildCredentialReferenceInput): RuntimeCredentialReference {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, runtimeRegistrationId: i.runtimeRegistrationId, provider: i.provider, secretRef: i.secretRef, secretVersion: i.secretVersion ?? "1", metadata: i.metadata ?? {}, validationState: "unverified", rotatedAt: null, expiresAt: i.expiresAt ?? null, createdByUserId: i.createdByUserId, createdAt: i.now, updatedAt: i.now };
}

export interface BuildRuntimePolicyInput {
  id: string; workspaceId: string; clientId: string | null; environment: RuntimeEnvironment; provider: RuntimeProvider;
  requiresApproval: boolean; exactHashApproval: boolean; rollbackRequired: boolean; healthCheckRequired: boolean;
  autoActivate: boolean; maxRetries?: number; maxExecutionMs?: number; allowedDeployerRoles?: string[]; createdByUserId: string; now: string;
}
export function buildRuntimePolicy(i: BuildRuntimePolicyInput): RuntimePolicy {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, environment: i.environment, provider: i.provider, requiresApproval: i.requiresApproval, exactHashApproval: i.exactHashApproval, rollbackRequired: i.rollbackRequired, healthCheckRequired: i.healthCheckRequired, autoActivate: i.autoActivate, maxRetries: i.maxRetries ?? 3, maxExecutionMs: i.maxExecutionMs ?? 3_600_000, allowedDeployerRoles: i.allowedDeployerRoles ?? [], createdByUserId: i.createdByUserId, version: 1, createdAt: i.now, updatedAt: i.now };
}

export function buildCapabilitySnapshot(id: string, runtimeRegistrationId: string, workspaceId: string, clientId: string | null, provider: RuntimeProvider, capabilities: { operation: string; supported: boolean }[], providerVersion: string | null, now: string): RuntimeCapabilitySnapshot {
  return { id, runtimeRegistrationId, workspaceId, clientId, provider, capabilities, providerVersion, discoveredAt: now, createdAt: now };
}
export function buildHealthSnapshot(id: string, runtimeRegistrationId: string, workspaceId: string, clientId: string | null, level: RuntimeHealthLevel, latencyMs: number, providerVersion: string | null, detail: Record<string, unknown>, now: string): RuntimeHealthSnapshot {
  return { id, runtimeRegistrationId, workspaceId, clientId, level, latencyMs, providerVersion, detail, checkedAt: now, createdAt: now };
}

export interface BuildDeploymentInput {
  id: string; workspaceId: string; clientId: string | null; runtimeRegistrationId: string; provider: RuntimeProvider;
  deploymentPackageId: string; packageHash: string; workflowDefinitionId: string; deploymentVersion: number;
  targetEnvironment: RuntimeEnvironment; translatedWorkflowHash: string; previousDeploymentId: string | null;
  requestedByUserId: string; correlationId: string; traceId: string; now: string;
}
export function buildDeployment(i: BuildDeploymentInput): RuntimeDeployment {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, runtimeRegistrationId: i.runtimeRegistrationId, provider: i.provider, deploymentPackageId: i.deploymentPackageId, packageHash: i.packageHash, workflowDefinitionId: i.workflowDefinitionId, deploymentVersion: i.deploymentVersion, targetEnvironment: i.targetEnvironment, translatedWorkflowHash: i.translatedWorkflowHash, externalWorkflowId: null, externalWorkflowVersion: null, approvalReferenceId: null, approvedByUserId: null, approvalExpiresAt: null, previousDeploymentId: i.previousDeploymentId, rollbackSourceDeploymentId: null, status: "draft", activationState: "inactive", requestedByUserId: i.requestedByUserId, deployedByUserId: null, deployedAt: null, correlationId: i.correlationId, traceId: i.traceId, version: 1, createdAt: i.now, updatedAt: i.now };
}

export function buildDeploymentAttempt(id: string, deploymentId: string, workspaceId: string, clientId: string | null, operation: DeploymentOperation, idempotencyKey: string, attemptNumber: number, now: string): RuntimeDeploymentAttempt {
  return { id, deploymentId, workspaceId, clientId, operation, idempotencyKey, attemptNumber, status: "pending", failureCategory: null, providerCode: null, startedAt: now, finishedAt: null, createdAt: now };
}
export function buildDeploymentEvent(id: string, deploymentId: string, workspaceId: string, clientId: string | null, operation: DeploymentOperation | null, fromStatus: RuntimeDeploymentStatus | null, toStatus: RuntimeDeploymentStatus | null, actorUserId: string | null, reason: string, correlationId: string, now: string): RuntimeDeploymentEvent {
  return { id, deploymentId, workspaceId, clientId, operation, fromStatus, toStatus, actorUserId, reason, correlationId, createdAt: now };
}
export interface BuildLogInput { id: string; workspaceId: string; clientId: string | null; runtimeRegistrationId: string | null; deploymentId: string | null; executionId: string | null; provider: RuntimeProvider; operation: string; severity?: LogSeverity; message: string; metadata?: Record<string, unknown>; correlationId: string; traceId: string; now: string }
export function buildDeploymentLog(i: BuildLogInput): RuntimeDeploymentLog {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, runtimeRegistrationId: i.runtimeRegistrationId, deploymentId: i.deploymentId, executionId: i.executionId, provider: i.provider, operation: i.operation, severity: i.severity ?? "info", message: i.message, metadata: i.metadata ?? {}, correlationId: i.correlationId, traceId: i.traceId, createdAt: i.now };
}

export interface BuildExecutionInput { id: string; workspaceId: string; clientId: string | null; deploymentId: string; runtimeRegistrationId: string; externalExecutionId: string; externalWorkflowId: string | null; status: RuntimeExecutionStatus; triggerType: string | null; correlationId: string; traceId: string; now: string }
export function buildExecution(i: BuildExecutionInput): RuntimeExecution {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, deploymentId: i.deploymentId, runtimeRegistrationId: i.runtimeRegistrationId, externalExecutionId: i.externalExecutionId, externalWorkflowId: i.externalWorkflowId, status: i.status, triggerType: i.triggerType, retryNumber: 0, startedAt: null, stoppedAt: null, durationMs: 0, failureCategory: null, errorSummary: "", lastNode: null, correlationId: i.correlationId, traceId: i.traceId, version: 1, createdAt: i.now, updatedAt: i.now };
}
export function buildExecutionAttempt(id: string, runtimeExecutionId: string, deploymentId: string, workspaceId: string, clientId: string | null, attemptNumber: number, status: RuntimeExecutionStatus, now: string): RuntimeExecutionAttempt {
  return { id, runtimeExecutionId, deploymentId, workspaceId, clientId, attemptNumber, status, failureCategory: null, startedAt: now, finishedAt: null, createdAt: now };
}
export function buildExecutionFailure(id: string, runtimeExecutionId: string, deploymentId: string, workspaceId: string, clientId: string | null, category: RuntimeFailureCategory, retryable: boolean, message: string, providerCode: string | null, lastNode: string | null, now: string): RuntimeExecutionFailure {
  return { id, runtimeExecutionId, deploymentId, workspaceId, clientId, category, retryable, message, providerCode, lastNode, createdAt: now };
}

export interface BuildRollbackInput { id: string; workspaceId: string; clientId: string | null; sourceDeploymentId: string; targetDeploymentId: string; reason: string; requestedByUserId: string; correlationId: string; now: string }
export function buildRollbackRequest(i: BuildRollbackInput): RuntimeRollbackRequest {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, sourceDeploymentId: i.sourceDeploymentId, targetDeploymentId: i.targetDeploymentId, reason: i.reason, requestedByUserId: i.requestedByUserId, approvalReferenceId: null, status: "requested", resultDeploymentId: null, correlationId: i.correlationId, version: 1, createdAt: i.now, updatedAt: i.now };
}

export function buildWebhookReceipt(id: string, workspaceId: string, clientId: string | null, runtimeRegistrationId: string, provider: RuntimeProvider, externalEventId: string, idempotencyKey: string, signatureValid: boolean, now: string): RuntimeWebhookReceipt {
  return { id, workspaceId, clientId, runtimeRegistrationId, provider, externalEventId, idempotencyKey, signatureValid, status: "received", receivedAt: now, processedAt: null, createdAt: now };
}
export function buildReconciliation(id: string, workspaceId: string, clientId: string | null, runtimeRegistrationId: string, deploymentId: string | null, kind: ReconciliationKind, driftClass: DriftClass, expectedHash: string, providerHash: string, detail: string, now: string): RuntimeReconciliation {
  return { id, workspaceId, clientId, runtimeRegistrationId, deploymentId, kind, driftClass, expectedHash, providerHash, detail, createdAt: now };
}

/** Small helper: derive the next activation state for a lifecycle transition. */
export function activationFor(status: RuntimeDeploymentStatus): ActivationState {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  return "inactive";
}
