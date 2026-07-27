/* =============================================================================
 * Supabase Execution Runtime repositories (Phase F · Sprint F3).
 *
 * Fifteen adapters (untyped-cast pattern; mappers are the boundary). Registration/
 * policy/deployment/execution/rollback are versioned or mutable roots (optimistic
 * concurrency); snapshots, attempts, events, logs, failures, receipts and
 * reconciliations are append-only. RLS scopes every row to its tenant. No secret
 * material is read or written here — only references.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type ExecutionRuntimeRepositories, type RuntimeCapabilitySnapshotRepository, type RuntimeCredentialReferenceRepository,
  type RuntimeDeploymentAttemptRepository, type RuntimeDeploymentEventRepository, type RuntimeDeploymentLogRepository,
  type RuntimeDeploymentRepository, type RuntimeExecutionAttemptRepository, type RuntimeExecutionFailureRepository,
  type RuntimeExecutionRepository, type RuntimeHealthSnapshotRepository, type RuntimePolicyRepository,
  type RuntimeReconciliationRepository, type RuntimeRegistrationRepository, type RuntimeResult,
  type RuntimeRollbackRequestRepository, type RuntimeWebhookReceiptRepository,
} from "@brightloop/domain";
import type {
  RuntimeCapabilitySnapshot, RuntimeCredentialReference, RuntimeDeployment, RuntimeDeploymentAttempt,
  RuntimeDeploymentEvent, RuntimeDeploymentLog, RuntimeEnvironment, RuntimeExecution, RuntimeExecutionAttempt,
  RuntimeExecutionFailure, RuntimeHealthSnapshot, RuntimePolicy, RuntimeProvider, RuntimeReconciliation,
  RuntimeRegistration, RuntimeRollbackRequest, RuntimeWebhookReceipt,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const cast = (c: AuxionSupabaseClient): SupabaseClient => c as unknown as SupabaseClient;
const rec = (r: unknown) => r as Record<string, unknown>;

async function single<T>(p: PromiseLike<{ data: unknown; error: unknown }>, toDomain: (r: Record<string, unknown>) => T, ctx: string): Promise<RuntimeResult<T>> {
  const { data, error } = await p;
  if (error) return mapDatabaseError(error as never, ctx);
  return ok("created", toDomain(rec(data)));
}

export class SupabaseRuntimeRegistrationRepository implements RuntimeRegistrationRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: RuntimeRegistration) { return single(this.db.from("runtime_registration").insert(m.runtimeRow(r)).select("*").single(), m.toRuntime, "runtimeRegistration.create"); }
  async getById(id: string): Promise<RuntimeResult<RuntimeRegistration | null>> { const { data, error } = await this.db.from("runtime_registration").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeRegistration.getById"); return ok("found", data ? m.toRuntime(rec(data)) : null); }
  async listByWorkspace(w: string): Promise<RuntimeResult<RuntimeRegistration[]>> { const { data, error } = await this.db.from("runtime_registration").select("*").eq("workspace_id", w).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeRegistration.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toRuntime(rec(x)))); }
  async save(next: RuntimeRegistration, expected: number): Promise<RuntimeResult<RuntimeRegistration>> { const { data, error } = await this.db.from("runtime_registration").update(m.runtimeRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "runtimeRegistration.save"); if (data === null) return err("conflict", "runtimeRegistration.save: version mismatch"); return ok("updated", m.toRuntime(rec(data))); }
}

export class SupabaseRuntimeCredentialReferenceRepository implements RuntimeCredentialReferenceRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: RuntimeCredentialReference) { return single(this.db.from("runtime_credential_reference").insert(m.credentialRow(r)).select("*").single(), m.toCredential, "runtimeCredential.create"); }
  async getById(id: string): Promise<RuntimeResult<RuntimeCredentialReference | null>> { const { data, error } = await this.db.from("runtime_credential_reference").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeCredential.getById"); return ok("found", data ? m.toCredential(rec(data)) : null); }
  async listByWorkspace(w: string): Promise<RuntimeResult<RuntimeCredentialReference[]>> { const { data, error } = await this.db.from("runtime_credential_reference").select("*").eq("workspace_id", w); if (error) return mapDatabaseError(error, "runtimeCredential.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toCredential(rec(x)))); }
  async save(next: RuntimeCredentialReference): Promise<RuntimeResult<RuntimeCredentialReference>> { const { data, error } = await this.db.from("runtime_credential_reference").update(m.credentialRow(next)).eq("id", next.id).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "runtimeCredential.save"); if (data === null) return err("conflict", "runtimeCredential.save: not found"); return ok("updated", m.toCredential(rec(data))); }
}

export class SupabaseRuntimePolicyRepository implements RuntimePolicyRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: RuntimePolicy) { return single(this.db.from("runtime_policy").insert(m.policyRow(r)).select("*").single(), m.toPolicy, "runtimePolicy.create"); }
  async getById(id: string): Promise<RuntimeResult<RuntimePolicy | null>> { const { data, error } = await this.db.from("runtime_policy").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "runtimePolicy.getById"); return ok("found", data ? m.toPolicy(rec(data)) : null); }
  async findByEnvironment(w: string, env: RuntimeEnvironment, prov: RuntimeProvider): Promise<RuntimeResult<RuntimePolicy | null>> { const { data, error } = await this.db.from("runtime_policy").select("*").eq("workspace_id", w).eq("environment", env).eq("provider", prov).maybeSingle(); if (error) return mapDatabaseError(error, "runtimePolicy.findByEnvironment"); return ok("found", data ? m.toPolicy(rec(data)) : null); }
  async listByWorkspace(w: string): Promise<RuntimeResult<RuntimePolicy[]>> { const { data, error } = await this.db.from("runtime_policy").select("*").eq("workspace_id", w); if (error) return mapDatabaseError(error, "runtimePolicy.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toPolicy(rec(x)))); }
  async save(next: RuntimePolicy, expected: number): Promise<RuntimeResult<RuntimePolicy>> { const { data, error } = await this.db.from("runtime_policy").update(m.policyRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "runtimePolicy.save"); if (data === null) return err("conflict", "runtimePolicy.save: version mismatch"); return ok("updated", m.toPolicy(rec(data))); }
}

export class SupabaseRuntimeCapabilitySnapshotRepository implements RuntimeCapabilitySnapshotRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeCapabilitySnapshot) { return single(this.db.from("runtime_capability_snapshot").insert(m.capabilitySnapshotRow(r)).select("*").single(), m.toCapabilitySnapshot, "runtimeCapabilitySnapshot.append"); }
  async listByRuntime(id: string): Promise<RuntimeResult<RuntimeCapabilitySnapshot[]>> { const { data, error } = await this.db.from("runtime_capability_snapshot").select("*").eq("runtime_registration_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeCapabilitySnapshot.listByRuntime"); return ok("found", (data ?? []).map((x) => m.toCapabilitySnapshot(rec(x)))); }
}

export class SupabaseRuntimeHealthSnapshotRepository implements RuntimeHealthSnapshotRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeHealthSnapshot) { return single(this.db.from("runtime_health_snapshot").insert(m.healthSnapshotRow(r)).select("*").single(), m.toHealthSnapshot, "runtimeHealthSnapshot.append"); }
  async listByRuntime(id: string): Promise<RuntimeResult<RuntimeHealthSnapshot[]>> { const { data, error } = await this.db.from("runtime_health_snapshot").select("*").eq("runtime_registration_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeHealthSnapshot.listByRuntime"); return ok("found", (data ?? []).map((x) => m.toHealthSnapshot(rec(x)))); }
}

export class SupabaseRuntimeDeploymentRepository implements RuntimeDeploymentRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: RuntimeDeployment) { return single(this.db.from("runtime_deployment").insert(m.deploymentRow(r)).select("*").single(), m.toDeployment, "runtimeDeployment.create"); }
  async getById(id: string): Promise<RuntimeResult<RuntimeDeployment | null>> { const { data, error } = await this.db.from("runtime_deployment").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeDeployment.getById"); return ok("found", data ? m.toDeployment(rec(data)) : null); }
  async listByWorkspace(w: string): Promise<RuntimeResult<RuntimeDeployment[]>> { const { data, error } = await this.db.from("runtime_deployment").select("*").eq("workspace_id", w).order("updated_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeDeployment.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toDeployment(rec(x)))); }
  async listByPackage(pkg: string): Promise<RuntimeResult<RuntimeDeployment[]>> { const { data, error } = await this.db.from("runtime_deployment").select("*").eq("deployment_package_id", pkg); if (error) return mapDatabaseError(error, "runtimeDeployment.listByPackage"); return ok("found", (data ?? []).map((x) => m.toDeployment(rec(x)))); }
  async save(next: RuntimeDeployment, expected: number): Promise<RuntimeResult<RuntimeDeployment>> { const { data, error } = await this.db.from("runtime_deployment").update(m.deploymentRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "runtimeDeployment.save"); if (data === null) return err("conflict", "runtimeDeployment.save: version mismatch"); return ok("updated", m.toDeployment(rec(data))); }
}

export class SupabaseRuntimeDeploymentAttemptRepository implements RuntimeDeploymentAttemptRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeDeploymentAttempt) { return single(this.db.from("runtime_deployment_attempt").insert(m.deploymentAttemptRow(r)).select("*").single(), m.toDeploymentAttempt, "runtimeDeploymentAttempt.append"); }
  async listByDeployment(id: string): Promise<RuntimeResult<RuntimeDeploymentAttempt[]>> { const { data, error } = await this.db.from("runtime_deployment_attempt").select("*").eq("deployment_id", id).order("created_at", { ascending: true }); if (error) return mapDatabaseError(error, "runtimeDeploymentAttempt.listByDeployment"); return ok("found", (data ?? []).map((x) => m.toDeploymentAttempt(rec(x)))); }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeDeploymentAttempt | null>> { const { data, error } = await this.db.from("runtime_deployment_attempt").select("*").eq("idempotency_key", key).eq("status", "succeeded").limit(1).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeDeploymentAttempt.findByIdempotencyKey"); return ok("found", data ? m.toDeploymentAttempt(rec(data)) : null); }
}

export class SupabaseRuntimeDeploymentEventRepository implements RuntimeDeploymentEventRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeDeploymentEvent) { return single(this.db.from("runtime_deployment_event").insert(m.deploymentEventRow(r)).select("*").single(), m.toDeploymentEvent, "runtimeDeploymentEvent.append"); }
  async listByDeployment(id: string): Promise<RuntimeResult<RuntimeDeploymentEvent[]>> { const { data, error } = await this.db.from("runtime_deployment_event").select("*").eq("deployment_id", id).order("created_at", { ascending: true }); if (error) return mapDatabaseError(error, "runtimeDeploymentEvent.listByDeployment"); return ok("found", (data ?? []).map((x) => m.toDeploymentEvent(rec(x)))); }
}

export class SupabaseRuntimeDeploymentLogRepository implements RuntimeDeploymentLogRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeDeploymentLog) { return single(this.db.from("runtime_deployment_log").insert(m.deploymentLogRow(r)).select("*").single(), m.toDeploymentLog, "runtimeDeploymentLog.append"); }
  async listByDeployment(id: string): Promise<RuntimeResult<RuntimeDeploymentLog[]>> { const { data, error } = await this.db.from("runtime_deployment_log").select("*").eq("deployment_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeDeploymentLog.listByDeployment"); return ok("found", (data ?? []).map((x) => m.toDeploymentLog(rec(x)))); }
  async listByWorkspace(w: string, limit: number): Promise<RuntimeResult<RuntimeDeploymentLog[]>> { const { data, error } = await this.db.from("runtime_deployment_log").select("*").eq("workspace_id", w).order("created_at", { ascending: false }).limit(limit); if (error) return mapDatabaseError(error, "runtimeDeploymentLog.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toDeploymentLog(rec(x)))); }
}

export class SupabaseRuntimeExecutionRepository implements RuntimeExecutionRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: RuntimeExecution) { return single(this.db.from("runtime_execution").insert(m.executionRow(r)).select("*").single(), m.toExecution, "runtimeExecution.create"); }
  async getById(id: string): Promise<RuntimeResult<RuntimeExecution | null>> { const { data, error } = await this.db.from("runtime_execution").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeExecution.getById"); return ok("found", data ? m.toExecution(rec(data)) : null); }
  async listByDeployment(id: string): Promise<RuntimeResult<RuntimeExecution[]>> { const { data, error } = await this.db.from("runtime_execution").select("*").eq("deployment_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeExecution.listByDeployment"); return ok("found", (data ?? []).map((x) => m.toExecution(rec(x)))); }
  async listByWorkspace(w: string): Promise<RuntimeResult<RuntimeExecution[]>> { const { data, error } = await this.db.from("runtime_execution").select("*").eq("workspace_id", w).order("created_at", { ascending: false }).limit(200); if (error) return mapDatabaseError(error, "runtimeExecution.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toExecution(rec(x)))); }
  async findByExternalId(rt: string, ext: string): Promise<RuntimeResult<RuntimeExecution | null>> { const { data, error } = await this.db.from("runtime_execution").select("*").eq("runtime_registration_id", rt).eq("external_execution_id", ext).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeExecution.findByExternalId"); return ok("found", data ? m.toExecution(rec(data)) : null); }
  async save(next: RuntimeExecution, expected: number): Promise<RuntimeResult<RuntimeExecution>> { const { data, error } = await this.db.from("runtime_execution").update(m.executionRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "runtimeExecution.save"); if (data === null) return err("conflict", "runtimeExecution.save: version mismatch"); return ok("updated", m.toExecution(rec(data))); }
}

export class SupabaseRuntimeExecutionAttemptRepository implements RuntimeExecutionAttemptRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeExecutionAttempt) { return single(this.db.from("runtime_execution_attempt").insert(m.executionAttemptRow(r)).select("*").single(), m.toExecutionAttempt, "runtimeExecutionAttempt.append"); }
  async listByExecution(id: string): Promise<RuntimeResult<RuntimeExecutionAttempt[]>> { const { data, error } = await this.db.from("runtime_execution_attempt").select("*").eq("runtime_execution_id", id).order("created_at", { ascending: true }); if (error) return mapDatabaseError(error, "runtimeExecutionAttempt.listByExecution"); return ok("found", (data ?? []).map((x) => m.toExecutionAttempt(rec(x)))); }
}

export class SupabaseRuntimeExecutionFailureRepository implements RuntimeExecutionFailureRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeExecutionFailure) { return single(this.db.from("runtime_execution_failure").insert(m.executionFailureRow(r)).select("*").single(), m.toExecutionFailure, "runtimeExecutionFailure.append"); }
  async listByExecution(id: string): Promise<RuntimeResult<RuntimeExecutionFailure[]>> { const { data, error } = await this.db.from("runtime_execution_failure").select("*").eq("runtime_execution_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeExecutionFailure.listByExecution"); return ok("found", (data ?? []).map((x) => m.toExecutionFailure(rec(x)))); }
}

export class SupabaseRuntimeRollbackRequestRepository implements RuntimeRollbackRequestRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  create(r: RuntimeRollbackRequest) { return single(this.db.from("runtime_rollback_request").insert(m.rollbackRow(r)).select("*").single(), m.toRollback, "runtimeRollback.create"); }
  async getById(id: string): Promise<RuntimeResult<RuntimeRollbackRequest | null>> { const { data, error } = await this.db.from("runtime_rollback_request").select("*").eq("id", id).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeRollback.getById"); return ok("found", data ? m.toRollback(rec(data)) : null); }
  async listByWorkspace(w: string): Promise<RuntimeResult<RuntimeRollbackRequest[]>> { const { data, error } = await this.db.from("runtime_rollback_request").select("*").eq("workspace_id", w).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeRollback.listByWorkspace"); return ok("found", (data ?? []).map((x) => m.toRollback(rec(x)))); }
  async save(next: RuntimeRollbackRequest, expected: number): Promise<RuntimeResult<RuntimeRollbackRequest>> { const { data, error } = await this.db.from("runtime_rollback_request").update(m.rollbackRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle(); if (error) return mapDatabaseError(error, "runtimeRollback.save"); if (data === null) return err("conflict", "runtimeRollback.save: version mismatch"); return ok("updated", m.toRollback(rec(data))); }
}

export class SupabaseRuntimeWebhookReceiptRepository implements RuntimeWebhookReceiptRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeWebhookReceipt) { return single(this.db.from("runtime_webhook_receipt").insert(m.webhookReceiptRow(r)).select("*").single(), m.toWebhookReceipt, "runtimeWebhookReceipt.append"); }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<RuntimeWebhookReceipt | null>> { const { data, error } = await this.db.from("runtime_webhook_receipt").select("*").eq("idempotency_key", key).in("status", ["received", "processed"]).limit(1).maybeSingle(); if (error) return mapDatabaseError(error, "runtimeWebhookReceipt.findByIdempotencyKey"); return ok("found", data ? m.toWebhookReceipt(rec(data)) : null); }
}

export class SupabaseRuntimeReconciliationRepository implements RuntimeReconciliationRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) { this.db = cast(c); }
  append(r: RuntimeReconciliation) { return single(this.db.from("runtime_reconciliation").insert(m.reconciliationRow(r)).select("*").single(), m.toReconciliation, "runtimeReconciliation.append"); }
  async listByRuntime(id: string): Promise<RuntimeResult<RuntimeReconciliation[]>> { const { data, error } = await this.db.from("runtime_reconciliation").select("*").eq("runtime_registration_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeReconciliation.listByRuntime"); return ok("found", (data ?? []).map((x) => m.toReconciliation(rec(x)))); }
  async listByDeployment(id: string): Promise<RuntimeResult<RuntimeReconciliation[]>> { const { data, error } = await this.db.from("runtime_reconciliation").select("*").eq("deployment_id", id).order("created_at", { ascending: false }); if (error) return mapDatabaseError(error, "runtimeReconciliation.listByDeployment"); return ok("found", (data ?? []).map((x) => m.toReconciliation(rec(x)))); }
}

/** Build the full F3 repository bundle bound to a request-scoped RLS client. */
export function createExecutionRuntimeRepositories(client: AuxionSupabaseClient): ExecutionRuntimeRepositories {
  return {
    runtimes: new SupabaseRuntimeRegistrationRepository(client),
    credentials: new SupabaseRuntimeCredentialReferenceRepository(client),
    policies: new SupabaseRuntimePolicyRepository(client),
    capabilitySnapshots: new SupabaseRuntimeCapabilitySnapshotRepository(client),
    healthSnapshots: new SupabaseRuntimeHealthSnapshotRepository(client),
    deployments: new SupabaseRuntimeDeploymentRepository(client),
    deploymentAttempts: new SupabaseRuntimeDeploymentAttemptRepository(client),
    deploymentEvents: new SupabaseRuntimeDeploymentEventRepository(client),
    deploymentLogs: new SupabaseRuntimeDeploymentLogRepository(client),
    executions: new SupabaseRuntimeExecutionRepository(client),
    executionAttempts: new SupabaseRuntimeExecutionAttemptRepository(client),
    executionFailures: new SupabaseRuntimeExecutionFailureRepository(client),
    rollbacks: new SupabaseRuntimeRollbackRequestRepository(client),
    webhookReceipts: new SupabaseRuntimeWebhookReceiptRepository(client),
    reconciliations: new SupabaseRuntimeReconciliationRepository(client),
  };
}
