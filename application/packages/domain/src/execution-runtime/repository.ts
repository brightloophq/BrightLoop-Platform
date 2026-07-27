/* =============================================================================
 * Execution Runtime — REPOSITORY PORTS (Phase F · Sprint F3).
 *
 * Registration / policy / deployment / execution / rollback are versioned or
 * mutable roots (optimistic concurrency); capability & health snapshots, attempts,
 * events, logs, failures, webhook receipts and reconciliations are append-only.
 * Idempotency lookups back the "return the existing result" guarantee. RLS is the
 * tenant boundary. The context consumes upstream contexts via their app services,
 * so no upstream ports appear here.
 * ========================================================================== */

import type {
  RuntimeCapabilitySnapshot, RuntimeCredentialReference, RuntimeDeployment, RuntimeDeploymentAttempt,
  RuntimeDeploymentEvent, RuntimeDeploymentLog, RuntimeEnvironment, RuntimeExecution, RuntimeExecutionAttempt,
  RuntimeExecutionFailure, RuntimeHealthSnapshot, RuntimePolicy, RuntimeProvider, RuntimeReconciliation,
  RuntimeRegistration, RuntimeRollbackRequest, RuntimeWebhookReceipt,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface RuntimeRegistrationRepository {
  create(row: RuntimeRegistration): Promise<RuntimeResult<RuntimeRegistration>>;
  getById(id: string): Promise<RuntimeResult<RuntimeRegistration | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RuntimeRegistration[]>>;
  save(next: RuntimeRegistration, expectedVersion: number): Promise<RuntimeResult<RuntimeRegistration>>;
}
export interface RuntimeCredentialReferenceRepository {
  create(row: RuntimeCredentialReference): Promise<RuntimeResult<RuntimeCredentialReference>>;
  getById(id: string): Promise<RuntimeResult<RuntimeCredentialReference | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RuntimeCredentialReference[]>>;
  save(next: RuntimeCredentialReference): Promise<RuntimeResult<RuntimeCredentialReference>>;
}
export interface RuntimePolicyRepository {
  create(row: RuntimePolicy): Promise<RuntimeResult<RuntimePolicy>>;
  getById(id: string): Promise<RuntimeResult<RuntimePolicy | null>>;
  findByEnvironment(workspaceId: string, environment: RuntimeEnvironment, provider: RuntimeProvider): Promise<RuntimeResult<RuntimePolicy | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RuntimePolicy[]>>;
  save(next: RuntimePolicy, expectedVersion: number): Promise<RuntimeResult<RuntimePolicy>>;
}
export interface RuntimeCapabilitySnapshotRepository {
  append(row: RuntimeCapabilitySnapshot): Promise<RuntimeResult<RuntimeCapabilitySnapshot>>;
  listByRuntime(runtimeRegistrationId: string): Promise<RuntimeResult<RuntimeCapabilitySnapshot[]>>;
}
export interface RuntimeHealthSnapshotRepository {
  append(row: RuntimeHealthSnapshot): Promise<RuntimeResult<RuntimeHealthSnapshot>>;
  listByRuntime(runtimeRegistrationId: string): Promise<RuntimeResult<RuntimeHealthSnapshot[]>>;
}
export interface RuntimeDeploymentRepository {
  create(row: RuntimeDeployment): Promise<RuntimeResult<RuntimeDeployment>>;
  getById(id: string): Promise<RuntimeResult<RuntimeDeployment | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RuntimeDeployment[]>>;
  listByPackage(deploymentPackageId: string): Promise<RuntimeResult<RuntimeDeployment[]>>;
  save(next: RuntimeDeployment, expectedVersion: number): Promise<RuntimeResult<RuntimeDeployment>>;
}
export interface RuntimeDeploymentAttemptRepository {
  append(row: RuntimeDeploymentAttempt): Promise<RuntimeResult<RuntimeDeploymentAttempt>>;
  listByDeployment(deploymentId: string): Promise<RuntimeResult<RuntimeDeploymentAttempt[]>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeDeploymentAttempt | null>>;
}
export interface RuntimeDeploymentEventRepository {
  append(row: RuntimeDeploymentEvent): Promise<RuntimeResult<RuntimeDeploymentEvent>>;
  listByDeployment(deploymentId: string): Promise<RuntimeResult<RuntimeDeploymentEvent[]>>;
}
export interface RuntimeDeploymentLogRepository {
  append(row: RuntimeDeploymentLog): Promise<RuntimeResult<RuntimeDeploymentLog>>;
  listByDeployment(deploymentId: string): Promise<RuntimeResult<RuntimeDeploymentLog[]>>;
  listByWorkspace(workspaceId: string, limit: number): Promise<RuntimeResult<RuntimeDeploymentLog[]>>;
}
export interface RuntimeExecutionRepository {
  create(row: RuntimeExecution): Promise<RuntimeResult<RuntimeExecution>>;
  getById(id: string): Promise<RuntimeResult<RuntimeExecution | null>>;
  listByDeployment(deploymentId: string): Promise<RuntimeResult<RuntimeExecution[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RuntimeExecution[]>>;
  findByExternalId(runtimeRegistrationId: string, externalExecutionId: string): Promise<RuntimeResult<RuntimeExecution | null>>;
  save(next: RuntimeExecution, expectedVersion: number): Promise<RuntimeResult<RuntimeExecution>>;
}
export interface RuntimeExecutionAttemptRepository {
  append(row: RuntimeExecutionAttempt): Promise<RuntimeResult<RuntimeExecutionAttempt>>;
  listByExecution(runtimeExecutionId: string): Promise<RuntimeResult<RuntimeExecutionAttempt[]>>;
}
export interface RuntimeExecutionFailureRepository {
  append(row: RuntimeExecutionFailure): Promise<RuntimeResult<RuntimeExecutionFailure>>;
  listByExecution(runtimeExecutionId: string): Promise<RuntimeResult<RuntimeExecutionFailure[]>>;
}
export interface RuntimeRollbackRequestRepository {
  create(row: RuntimeRollbackRequest): Promise<RuntimeResult<RuntimeRollbackRequest>>;
  getById(id: string): Promise<RuntimeResult<RuntimeRollbackRequest | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RuntimeRollbackRequest[]>>;
  save(next: RuntimeRollbackRequest, expectedVersion: number): Promise<RuntimeResult<RuntimeRollbackRequest>>;
}
export interface RuntimeWebhookReceiptRepository {
  append(row: RuntimeWebhookReceipt): Promise<RuntimeResult<RuntimeWebhookReceipt>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeWebhookReceipt | null>>;
}
export interface RuntimeReconciliationRepository {
  append(row: RuntimeReconciliation): Promise<RuntimeResult<RuntimeReconciliation>>;
  listByRuntime(runtimeRegistrationId: string): Promise<RuntimeResult<RuntimeReconciliation[]>>;
  listByDeployment(deploymentId: string): Promise<RuntimeResult<RuntimeReconciliation[]>>;
}

export interface ExecutionRuntimeRepositories {
  runtimes: RuntimeRegistrationRepository;
  credentials: RuntimeCredentialReferenceRepository;
  policies: RuntimePolicyRepository;
  capabilitySnapshots: RuntimeCapabilitySnapshotRepository;
  healthSnapshots: RuntimeHealthSnapshotRepository;
  deployments: RuntimeDeploymentRepository;
  deploymentAttempts: RuntimeDeploymentAttemptRepository;
  deploymentEvents: RuntimeDeploymentEventRepository;
  deploymentLogs: RuntimeDeploymentLogRepository;
  executions: RuntimeExecutionRepository;
  executionAttempts: RuntimeExecutionAttemptRepository;
  executionFailures: RuntimeExecutionFailureRepository;
  rollbacks: RuntimeRollbackRequestRepository;
  webhookReceipts: RuntimeWebhookReceiptRepository;
  reconciliations: RuntimeReconciliationRepository;
}
