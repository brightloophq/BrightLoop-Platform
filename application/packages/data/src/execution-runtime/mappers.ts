/* =============================================================================
 * Execution Runtime — row ↔ domain mappers (Phase F · Sprint F3).
 *
 * The type-safe boundary. Jsonb fields (capabilities, detail, metadata, role
 * lists) collapse defensively. NO secret material is ever mapped — credential
 * rows carry only a reference + validation posture.
 * ========================================================================== */

import type {
  RuntimeCapabilitySnapshot, RuntimeCredentialReference, RuntimeDeployment, RuntimeDeploymentAttempt,
  RuntimeDeploymentEvent, RuntimeDeploymentLog, RuntimeExecution, RuntimeExecutionAttempt, RuntimeExecutionFailure,
  RuntimeHealthSnapshot, RuntimePolicy, RuntimeReconciliation, RuntimeRegistration, RuntimeRollbackRequest,
  RuntimeWebhookReceipt,
} from "@brightloop/schema";

const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const bool = (v: unknown, d = false): boolean => (typeof v === "boolean" ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function runtimeRow(r: RuntimeRegistration): Record<string, unknown> {
  return { id: r.id, workspace_id: r.workspaceId, client_id: r.clientId, provider: r.provider, display_name: r.displayName, environment: r.environment, base_url_ref: r.baseUrlRef, credential_reference_id: r.credentialReferenceId, status: r.status, provider_version: r.providerVersion, supported_capabilities: r.supportedCapabilities, health_state: r.healthState, last_health_check_at: r.lastHealthCheckAt, created_by_user_id: r.createdByUserId, correlation_id: r.correlationId, version: r.version, created_at: r.createdAt, updated_at: r.updatedAt };
}
export function toRuntime(r: Record<string, unknown>): RuntimeRegistration {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), provider: r["provider"] as RuntimeRegistration["provider"], displayName: String(r["display_name"]), environment: r["environment"] as RuntimeRegistration["environment"], baseUrlRef: String(r["base_url_ref"]), credentialReferenceId: nstr(r["credential_reference_id"]), status: r["status"] as RuntimeRegistration["status"], providerVersion: nstr(r["provider_version"]), supportedCapabilities: strArr(r["supported_capabilities"]), healthState: r["health_state"] as RuntimeRegistration["healthState"], lastHealthCheckAt: nstr(r["last_health_check_at"]), createdByUserId: String(r["created_by_user_id"]), correlationId: String(r["correlation_id"] ?? ""), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function credentialRow(c: RuntimeCredentialReference): Record<string, unknown> {
  return { id: c.id, workspace_id: c.workspaceId, client_id: c.clientId, runtime_registration_id: c.runtimeRegistrationId, provider: c.provider, secret_ref: c.secretRef, secret_version: c.secretVersion, metadata: c.metadata, validation_state: c.validationState, rotated_at: c.rotatedAt, expires_at: c.expiresAt, created_by_user_id: c.createdByUserId, created_at: c.createdAt, updated_at: c.updatedAt };
}
export function toCredential(r: Record<string, unknown>): RuntimeCredentialReference {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), runtimeRegistrationId: nstr(r["runtime_registration_id"]), provider: r["provider"] as RuntimeCredentialReference["provider"], secretRef: String(r["secret_ref"]), secretVersion: String(r["secret_version"] ?? "1"), metadata: obj(r["metadata"]), validationState: r["validation_state"] as RuntimeCredentialReference["validationState"], rotatedAt: nstr(r["rotated_at"]), expiresAt: nstr(r["expires_at"]), createdByUserId: String(r["created_by_user_id"]), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function policyRow(p: RuntimePolicy): Record<string, unknown> {
  return { id: p.id, workspace_id: p.workspaceId, client_id: p.clientId, environment: p.environment, provider: p.provider, requires_approval: p.requiresApproval, exact_hash_approval: p.exactHashApproval, rollback_required: p.rollbackRequired, health_check_required: p.healthCheckRequired, auto_activate: p.autoActivate, max_retries: p.maxRetries, max_execution_ms: p.maxExecutionMs, allowed_deployer_roles: p.allowedDeployerRoles, created_by_user_id: p.createdByUserId, version: p.version, created_at: p.createdAt, updated_at: p.updatedAt };
}
export function toPolicy(r: Record<string, unknown>): RuntimePolicy {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), environment: r["environment"] as RuntimePolicy["environment"], provider: r["provider"] as RuntimePolicy["provider"], requiresApproval: bool(r["requires_approval"], true), exactHashApproval: bool(r["exact_hash_approval"]), rollbackRequired: bool(r["rollback_required"]), healthCheckRequired: bool(r["health_check_required"]), autoActivate: bool(r["auto_activate"]), maxRetries: int(r["max_retries"], 3), maxExecutionMs: int(r["max_execution_ms"], 3_600_000), allowedDeployerRoles: strArr(r["allowed_deployer_roles"]), createdByUserId: String(r["created_by_user_id"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function capabilitySnapshotRow(c: RuntimeCapabilitySnapshot): Record<string, unknown> {
  return { id: c.id, runtime_registration_id: c.runtimeRegistrationId, workspace_id: c.workspaceId, client_id: c.clientId, provider: c.provider, capabilities: c.capabilities, provider_version: c.providerVersion, discovered_at: c.discoveredAt, created_at: c.createdAt };
}
export function toCapabilitySnapshot(r: Record<string, unknown>): RuntimeCapabilitySnapshot {
  const caps = Array.isArray(r["capabilities"]) ? (r["capabilities"] as unknown[]).map((x) => { const o = obj(x); return { operation: String(o["operation"] ?? ""), supported: bool(o["supported"]) }; }) : [];
  return { id: String(r["id"]), runtimeRegistrationId: String(r["runtime_registration_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), provider: r["provider"] as RuntimeCapabilitySnapshot["provider"], capabilities: caps, providerVersion: nstr(r["provider_version"]), discoveredAt: String(r["discovered_at"]), createdAt: String(r["created_at"]) };
}

export function healthSnapshotRow(h: RuntimeHealthSnapshot): Record<string, unknown> {
  return { id: h.id, runtime_registration_id: h.runtimeRegistrationId, workspace_id: h.workspaceId, client_id: h.clientId, level: h.level, latency_ms: h.latencyMs, provider_version: h.providerVersion, detail: h.detail, checked_at: h.checkedAt, created_at: h.createdAt };
}
export function toHealthSnapshot(r: Record<string, unknown>): RuntimeHealthSnapshot {
  return { id: String(r["id"]), runtimeRegistrationId: String(r["runtime_registration_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), level: r["level"] as RuntimeHealthSnapshot["level"], latencyMs: int(r["latency_ms"]), providerVersion: nstr(r["provider_version"]), detail: obj(r["detail"]), checkedAt: String(r["checked_at"]), createdAt: String(r["created_at"]) };
}

export function deploymentRow(d: RuntimeDeployment): Record<string, unknown> {
  return { id: d.id, workspace_id: d.workspaceId, client_id: d.clientId, runtime_registration_id: d.runtimeRegistrationId, provider: d.provider, deployment_package_id: d.deploymentPackageId, package_hash: d.packageHash, workflow_definition_id: d.workflowDefinitionId, deployment_version: d.deploymentVersion, target_environment: d.targetEnvironment, translated_workflow_hash: d.translatedWorkflowHash, external_workflow_id: d.externalWorkflowId, external_workflow_version: d.externalWorkflowVersion, approval_reference_id: d.approvalReferenceId, approved_by_user_id: d.approvedByUserId, approval_expires_at: d.approvalExpiresAt, previous_deployment_id: d.previousDeploymentId, rollback_source_deployment_id: d.rollbackSourceDeploymentId, status: d.status, activation_state: d.activationState, requested_by_user_id: d.requestedByUserId, deployed_by_user_id: d.deployedByUserId, deployed_at: d.deployedAt, correlation_id: d.correlationId, trace_id: d.traceId, version: d.version, created_at: d.createdAt, updated_at: d.updatedAt };
}
export function toDeployment(r: Record<string, unknown>): RuntimeDeployment {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), runtimeRegistrationId: String(r["runtime_registration_id"]), provider: r["provider"] as RuntimeDeployment["provider"], deploymentPackageId: String(r["deployment_package_id"]), packageHash: String(r["package_hash"]), workflowDefinitionId: String(r["workflow_definition_id"]), deploymentVersion: int(r["deployment_version"], 1), targetEnvironment: r["target_environment"] as RuntimeDeployment["targetEnvironment"], translatedWorkflowHash: String(r["translated_workflow_hash"] ?? ""), externalWorkflowId: nstr(r["external_workflow_id"]), externalWorkflowVersion: nstr(r["external_workflow_version"]), approvalReferenceId: nstr(r["approval_reference_id"]), approvedByUserId: nstr(r["approved_by_user_id"]), approvalExpiresAt: nstr(r["approval_expires_at"]), previousDeploymentId: nstr(r["previous_deployment_id"]), rollbackSourceDeploymentId: nstr(r["rollback_source_deployment_id"]), status: r["status"] as RuntimeDeployment["status"], activationState: r["activation_state"] as RuntimeDeployment["activationState"], requestedByUserId: String(r["requested_by_user_id"]), deployedByUserId: nstr(r["deployed_by_user_id"]), deployedAt: nstr(r["deployed_at"]), correlationId: String(r["correlation_id"] ?? ""), traceId: String(r["trace_id"] ?? ""), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function deploymentAttemptRow(a: RuntimeDeploymentAttempt): Record<string, unknown> {
  return { id: a.id, deployment_id: a.deploymentId, workspace_id: a.workspaceId, client_id: a.clientId, operation: a.operation, idempotency_key: a.idempotencyKey, attempt_number: a.attemptNumber, status: a.status, failure_category: a.failureCategory, provider_code: a.providerCode, started_at: a.startedAt, finished_at: a.finishedAt, created_at: a.createdAt };
}
export function toDeploymentAttempt(r: Record<string, unknown>): RuntimeDeploymentAttempt {
  return { id: String(r["id"]), deploymentId: String(r["deployment_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), operation: r["operation"] as RuntimeDeploymentAttempt["operation"], idempotencyKey: String(r["idempotency_key"]), attemptNumber: int(r["attempt_number"], 1), status: r["status"] as RuntimeDeploymentAttempt["status"], failureCategory: (r["failure_category"] ?? null) as RuntimeDeploymentAttempt["failureCategory"], providerCode: nstr(r["provider_code"]), startedAt: String(r["started_at"]), finishedAt: nstr(r["finished_at"]), createdAt: String(r["created_at"]) };
}

export function deploymentEventRow(e: RuntimeDeploymentEvent): Record<string, unknown> {
  return { id: e.id, deployment_id: e.deploymentId, workspace_id: e.workspaceId, client_id: e.clientId, operation: e.operation, from_status: e.fromStatus, to_status: e.toStatus, actor_user_id: e.actorUserId, reason: e.reason, correlation_id: e.correlationId, created_at: e.createdAt };
}
export function toDeploymentEvent(r: Record<string, unknown>): RuntimeDeploymentEvent {
  return { id: String(r["id"]), deploymentId: String(r["deployment_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), operation: (r["operation"] ?? null) as RuntimeDeploymentEvent["operation"], fromStatus: (r["from_status"] ?? null) as RuntimeDeploymentEvent["fromStatus"], toStatus: (r["to_status"] ?? null) as RuntimeDeploymentEvent["toStatus"], actorUserId: nstr(r["actor_user_id"]), reason: String(r["reason"] ?? ""), correlationId: String(r["correlation_id"] ?? ""), createdAt: String(r["created_at"]) };
}

export function deploymentLogRow(l: RuntimeDeploymentLog): Record<string, unknown> {
  return { id: l.id, workspace_id: l.workspaceId, client_id: l.clientId, runtime_registration_id: l.runtimeRegistrationId, deployment_id: l.deploymentId, execution_id: l.executionId, provider: l.provider, operation: l.operation, severity: l.severity, message: l.message, metadata: l.metadata, correlation_id: l.correlationId, trace_id: l.traceId, created_at: l.createdAt };
}
export function toDeploymentLog(r: Record<string, unknown>): RuntimeDeploymentLog {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), runtimeRegistrationId: nstr(r["runtime_registration_id"]), deploymentId: nstr(r["deployment_id"]), executionId: nstr(r["execution_id"]), provider: r["provider"] as RuntimeDeploymentLog["provider"], operation: String(r["operation"]), severity: r["severity"] as RuntimeDeploymentLog["severity"], message: String(r["message"] ?? ""), metadata: obj(r["metadata"]), correlationId: String(r["correlation_id"] ?? ""), traceId: String(r["trace_id"] ?? ""), createdAt: String(r["created_at"]) };
}

export function executionRow(e: RuntimeExecution): Record<string, unknown> {
  return { id: e.id, workspace_id: e.workspaceId, client_id: e.clientId, deployment_id: e.deploymentId, runtime_registration_id: e.runtimeRegistrationId, external_execution_id: e.externalExecutionId, external_workflow_id: e.externalWorkflowId, status: e.status, trigger_type: e.triggerType, retry_number: e.retryNumber, started_at: e.startedAt, stopped_at: e.stoppedAt, duration_ms: e.durationMs, failure_category: e.failureCategory, error_summary: e.errorSummary, last_node: e.lastNode, correlation_id: e.correlationId, trace_id: e.traceId, version: e.version, created_at: e.createdAt, updated_at: e.updatedAt };
}
export function toExecution(r: Record<string, unknown>): RuntimeExecution {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), deploymentId: String(r["deployment_id"]), runtimeRegistrationId: String(r["runtime_registration_id"]), externalExecutionId: String(r["external_execution_id"]), externalWorkflowId: nstr(r["external_workflow_id"]), status: r["status"] as RuntimeExecution["status"], triggerType: nstr(r["trigger_type"]), retryNumber: int(r["retry_number"]), startedAt: nstr(r["started_at"]), stoppedAt: nstr(r["stopped_at"]), durationMs: int(r["duration_ms"]), failureCategory: (r["failure_category"] ?? null) as RuntimeExecution["failureCategory"], errorSummary: String(r["error_summary"] ?? ""), lastNode: nstr(r["last_node"]), correlationId: String(r["correlation_id"] ?? ""), traceId: String(r["trace_id"] ?? ""), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function executionAttemptRow(a: RuntimeExecutionAttempt): Record<string, unknown> {
  return { id: a.id, runtime_execution_id: a.runtimeExecutionId, deployment_id: a.deploymentId, workspace_id: a.workspaceId, client_id: a.clientId, attempt_number: a.attemptNumber, status: a.status, failure_category: a.failureCategory, started_at: a.startedAt, finished_at: a.finishedAt, created_at: a.createdAt };
}
export function toExecutionAttempt(r: Record<string, unknown>): RuntimeExecutionAttempt {
  return { id: String(r["id"]), runtimeExecutionId: String(r["runtime_execution_id"]), deploymentId: String(r["deployment_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), attemptNumber: int(r["attempt_number"], 1), status: r["status"] as RuntimeExecutionAttempt["status"], failureCategory: (r["failure_category"] ?? null) as RuntimeExecutionAttempt["failureCategory"], startedAt: nstr(r["started_at"]), finishedAt: nstr(r["finished_at"]), createdAt: String(r["created_at"]) };
}

export function executionFailureRow(f: RuntimeExecutionFailure): Record<string, unknown> {
  return { id: f.id, runtime_execution_id: f.runtimeExecutionId, deployment_id: f.deploymentId, workspace_id: f.workspaceId, client_id: f.clientId, category: f.category, retryable: f.retryable, message: f.message, provider_code: f.providerCode, last_node: f.lastNode, created_at: f.createdAt };
}
export function toExecutionFailure(r: Record<string, unknown>): RuntimeExecutionFailure {
  return { id: String(r["id"]), runtimeExecutionId: String(r["runtime_execution_id"]), deploymentId: String(r["deployment_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), category: r["category"] as RuntimeExecutionFailure["category"], retryable: bool(r["retryable"]), message: String(r["message"] ?? ""), providerCode: nstr(r["provider_code"]), lastNode: nstr(r["last_node"]), createdAt: String(r["created_at"]) };
}

export function rollbackRow(r: RuntimeRollbackRequest): Record<string, unknown> {
  return { id: r.id, workspace_id: r.workspaceId, client_id: r.clientId, source_deployment_id: r.sourceDeploymentId, target_deployment_id: r.targetDeploymentId, reason: r.reason, requested_by_user_id: r.requestedByUserId, approval_reference_id: r.approvalReferenceId, status: r.status, result_deployment_id: r.resultDeploymentId, correlation_id: r.correlationId, version: r.version, created_at: r.createdAt, updated_at: r.updatedAt };
}
export function toRollback(r: Record<string, unknown>): RuntimeRollbackRequest {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), sourceDeploymentId: String(r["source_deployment_id"]), targetDeploymentId: String(r["target_deployment_id"]), reason: String(r["reason"] ?? ""), requestedByUserId: String(r["requested_by_user_id"]), approvalReferenceId: nstr(r["approval_reference_id"]), status: r["status"] as RuntimeRollbackRequest["status"], resultDeploymentId: nstr(r["result_deployment_id"]), correlationId: String(r["correlation_id"] ?? ""), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function webhookReceiptRow(w: RuntimeWebhookReceipt): Record<string, unknown> {
  return { id: w.id, workspace_id: w.workspaceId, client_id: w.clientId, runtime_registration_id: w.runtimeRegistrationId, provider: w.provider, external_event_id: w.externalEventId, idempotency_key: w.idempotencyKey, signature_valid: w.signatureValid, status: w.status, received_at: w.receivedAt, processed_at: w.processedAt, created_at: w.createdAt };
}
export function toWebhookReceipt(r: Record<string, unknown>): RuntimeWebhookReceipt {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), runtimeRegistrationId: String(r["runtime_registration_id"]), provider: r["provider"] as RuntimeWebhookReceipt["provider"], externalEventId: String(r["external_event_id"]), idempotencyKey: String(r["idempotency_key"]), signatureValid: bool(r["signature_valid"]), status: r["status"] as RuntimeWebhookReceipt["status"], receivedAt: String(r["received_at"]), processedAt: nstr(r["processed_at"]), createdAt: String(r["created_at"]) };
}

export function reconciliationRow(r: RuntimeReconciliation): Record<string, unknown> {
  return { id: r.id, workspace_id: r.workspaceId, client_id: r.clientId, runtime_registration_id: r.runtimeRegistrationId, deployment_id: r.deploymentId, kind: r.kind, drift_class: r.driftClass, expected_hash: r.expectedHash, provider_hash: r.providerHash, detail: r.detail, created_at: r.createdAt };
}
export function toReconciliation(r: Record<string, unknown>): RuntimeReconciliation {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), runtimeRegistrationId: String(r["runtime_registration_id"]), deploymentId: nstr(r["deployment_id"]), kind: r["kind"] as RuntimeReconciliation["kind"], driftClass: r["drift_class"] as RuntimeReconciliation["driftClass"], expectedHash: String(r["expected_hash"] ?? ""), providerHash: String(r["provider_hash"] ?? ""), detail: String(r["detail"] ?? ""), createdAt: String(r["created_at"]) };
}
