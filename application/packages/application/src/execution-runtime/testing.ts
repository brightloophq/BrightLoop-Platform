/* =============================================================================
 * Execution Runtime — TEST SUPPORT (Phase F · Sprint F3).
 *
 * A deterministic in-memory repository bundle, an in-memory RuntimeSecretStore
 * (secret VALUES never leave it), and a scriptable FAKE runtime adapter that
 * simulates the full matrix — healthy/invalid/unsupported/timeout/throttled/
 * transient/permanent/drift/exec success+failure/rollback — with NO network.
 * ========================================================================== */

import {
  detectIncompatibilities, hashString, readNeutralPackage,
  ok, type ExecutionRuntimeRepositories, type ProviderResult, type RuntimeAdapter, type RuntimeResult,
  type RuntimeSecretStore, type SecretMetadata, type TranslationOutcome,
} from "@brightloop/domain";
import type {
  RuntimeCapabilitySnapshot, RuntimeCredentialReference, RuntimeDeployment, RuntimeDeploymentAttempt,
  RuntimeDeploymentEvent, RuntimeDeploymentLog, RuntimeExecution, RuntimeExecutionAttempt, RuntimeExecutionFailure,
  RuntimeHealthSnapshot, RuntimePolicy, RuntimeReconciliation, RuntimeRegistration, RuntimeRollbackRequest,
  RuntimeWebhookReceipt,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

/* ---- in-memory repositories ------------------------------------------------ */

export function createInMemoryExecutionRuntimeRepos(): ExecutionRuntimeRepositories {
  const runtimes = new Map<string, RuntimeRegistration>();
  const credentials = new Map<string, RuntimeCredentialReference>();
  const policies = new Map<string, RuntimePolicy>();
  const deployments = new Map<string, RuntimeDeployment>();
  const executions = new Map<string, RuntimeExecution>();
  const rollbacks = new Map<string, RuntimeRollbackRequest>();
  const capSnaps: RuntimeCapabilitySnapshot[] = [];
  const healthSnaps: RuntimeHealthSnapshot[] = [];
  const dAttempts: RuntimeDeploymentAttempt[] = [];
  const dEvents: RuntimeDeploymentEvent[] = [];
  const dLogs: RuntimeDeploymentLog[] = [];
  const eAttempts: RuntimeExecutionAttempt[] = [];
  const eFailures: RuntimeExecutionFailure[] = [];
  const receipts: RuntimeWebhookReceipt[] = [];
  const recon: RuntimeReconciliation[] = [];

  const versioned = <T extends { id: string; version: number }>(map: Map<string, T>) => ({
    create: async (r: T) => { map.set(r.id, r); return ok("created", r); },
    getById: async (id: string) => ok("found", map.get(id) ?? null),
    save: async (next: T, expected: number) => { const cur = map.get(next.id); if (!cur || cur.version !== expected) return conflict(); map.set(next.id, next); return ok("updated", next); },
  });

  return {
    runtimes: { ...versioned(runtimes), listByWorkspace: async (w) => ok("found", [...runtimes.values()].filter((r) => r.workspaceId === w)) },
    credentials: {
      create: async (r) => { credentials.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", credentials.get(id) ?? null),
      listByWorkspace: async (w) => ok("found", [...credentials.values()].filter((c) => c.workspaceId === w)),
      save: async (next) => { credentials.set(next.id, next); return ok("updated", next); },
    },
    policies: {
      ...versioned(policies),
      findByEnvironment: async (w, env, prov) => ok("found", [...policies.values()].find((p) => p.workspaceId === w && p.environment === env && p.provider === prov) ?? null),
      listByWorkspace: async (w) => ok("found", [...policies.values()].filter((p) => p.workspaceId === w)),
    },
    capabilitySnapshots: { append: async (r) => { capSnaps.push(r); return ok("created", r); }, listByRuntime: async (id) => ok("found", capSnaps.filter((c) => c.runtimeRegistrationId === id)) },
    healthSnapshots: { append: async (r) => { healthSnaps.push(r); return ok("created", r); }, listByRuntime: async (id) => ok("found", healthSnaps.filter((c) => c.runtimeRegistrationId === id)) },
    deployments: {
      ...versioned(deployments),
      listByWorkspace: async (w) => ok("found", [...deployments.values()].filter((d) => d.workspaceId === w)),
      listByPackage: async (pkg) => ok("found", [...deployments.values()].filter((d) => d.deploymentPackageId === pkg)),
    },
    deploymentAttempts: { append: async (r) => { dAttempts.push(r); return ok("created", r); }, listByDeployment: async (id) => ok("found", dAttempts.filter((a) => a.deploymentId === id)), findByIdempotencyKey: async (k) => ok("found", dAttempts.find((a) => a.idempotencyKey === k) ?? null) },
    deploymentEvents: { append: async (r) => { dEvents.push(r); return ok("created", r); }, listByDeployment: async (id) => ok("found", dEvents.filter((e) => e.deploymentId === id)) },
    deploymentLogs: { append: async (r) => { dLogs.push(r); return ok("created", r); }, listByDeployment: async (id) => ok("found", dLogs.filter((l) => l.deploymentId === id)), listByWorkspace: async (w, limit) => ok("found", dLogs.filter((l) => l.workspaceId === w).slice(-limit)) },
    executions: {
      ...versioned(executions),
      listByDeployment: async (id) => ok("found", [...executions.values()].filter((e) => e.deploymentId === id)),
      listByWorkspace: async (w) => ok("found", [...executions.values()].filter((e) => e.workspaceId === w)),
      findByExternalId: async (rt, ext) => ok("found", [...executions.values()].find((e) => e.runtimeRegistrationId === rt && e.externalExecutionId === ext) ?? null),
    },
    executionAttempts: { append: async (r) => { eAttempts.push(r); return ok("created", r); }, listByExecution: async (id) => ok("found", eAttempts.filter((a) => a.runtimeExecutionId === id)) },
    executionFailures: { append: async (r) => { eFailures.push(r); return ok("created", r); }, listByExecution: async (id) => ok("found", eFailures.filter((f) => f.runtimeExecutionId === id)) },
    rollbacks: { ...versioned(rollbacks), listByWorkspace: async (w) => ok("found", [...rollbacks.values()].filter((r) => r.workspaceId === w)) },
    webhookReceipts: { append: async (r) => { receipts.push(r); return ok("created", r); }, findByIdempotencyKey: async (k) => ok("found", receipts.find((r) => r.idempotencyKey === k) ?? null) },
    reconciliations: { append: async (r) => { recon.push(r); return ok("created", r); }, listByRuntime: async (id) => ok("found", recon.filter((r) => r.runtimeRegistrationId === id)), listByDeployment: async (id) => ok("found", recon.filter((r) => r.deploymentId === id)) },
  };
}

/* ---- in-memory secret store ------------------------------------------------ */

export function createInMemoryRuntimeSecretStore(): RuntimeSecretStore & { _debugHas(ref: string): boolean } {
  const store = new Map<string, { value: string; metadata: SecretMetadata }>();
  return {
    putSecret: async (ref, value, metadata) => { store.set(ref, { value, metadata }); },
    getSecret: async (ref) => store.get(ref)?.value ?? null,
    rotateSecret: async (ref, value) => { const e = store.get(ref); if (e) store.set(ref, { value, metadata: { ...e.metadata, version: String(Number(e.metadata.version) + 1) } }); return store.get(ref)?.metadata.version ?? "1"; },
    revokeSecret: async (ref) => { store.delete(ref); },
    validateSecretReference: async (ref) => (store.has(ref) ? { valid: true, reason: null } : { valid: false, reason: "reference not found" }),
    _debugHas: (ref) => store.has(ref),
  };
}

/* ---- deterministic fake runtime adapter ------------------------------------ */

export type FakeScenario = "healthy" | "invalid_credentials" | "unsupported" | "timeout" | "throttled" | "provider_unavailable" | "conflict";

export interface FakeAdapterState {
  scenario: FakeScenario;
  /** External workflow snapshot for drift/reconcile simulation. */
  externalWorkflowHash: string | null;
  externalActive: boolean;
  externalNodeCount: number;
  externalConnectionCount: number;
  /** Execution the fake surfaces from listExecutions/getExecution. */
  execution: { id: string; status: "succeeded" | "failed" | "running"; failure: import("@brightloop/schema").RuntimeFailureCategory | null } | null;
}

const N8N_SUPPORT = {
  triggerKinds: new Set(["manual", "schedule", "webhook", "crm_event", "form_submission", "payment", "email", "api_event"]),
  actionKinds: new Set(["send_email", "create_task", "update_crm", "http_request", "transform_data", "wait", "condition", "branch", "store_record", "notification", "webhook"]),
  variableTypes: new Set(["string", "number", "boolean", "json", "date"]),
  nodeKinds: new Set(["trigger", "action", "condition", "branch", "wait"]),
};

const errFor = (state: FakeAdapterState): ProviderResult<never> | null => {
  switch (state.scenario) {
    case "invalid_credentials": return { ok: false, category: "authentication", code: "AUTH_401", message: "invalid credentials" };
    case "timeout": return { ok: false, category: "timeout", code: "TIMEOUT", message: "timed out" };
    case "throttled": return { ok: false, category: "throttled", code: "RATE_429", message: "rate limited" };
    case "provider_unavailable": return { ok: false, category: "provider_unavailable", code: "UNAVAIL_503", message: "unavailable" };
    case "conflict": return { ok: false, category: "conflict", code: "CONFLICT_409", message: "conflict" };
    default: return null;
  }
};

/** A scriptable, deterministic n8n-shaped fake. Mutate `state` to drive scenarios. */
export function createFakeRuntimeAdapter(state: FakeAdapterState): RuntimeAdapter & { state: FakeAdapterState } {
  const guard = <T>(fn: () => T): ProviderResult<T> => { const e = errFor(state); return e ?? { ok: true, value: fn() }; };
  return {
    provider: "n8n",
    state,
    translate: (payload): TranslationOutcome => {
      const neutral = readNeutralPackage(payload);
      const report = detectIncompatibilities(neutral, N8N_SUPPORT);
      if (!report.compatible || state.scenario === "unsupported") return { ok: false, report: report.compatible ? { compatible: false, items: [{ kind: "node", subject: "forced", reason: "forced unsupported", remediation: "n/a" }] } : report };
      const hash = hashString(JSON.stringify(neutral));
      return { ok: true, workflow: { provider: "n8n", hash, name: neutral.workflowName, document: { auxion: true, nodes: neutral.nodes.length }, nodeCount: neutral.nodes.length, connectionCount: neutral.nodes.reduce((s, n) => s + n.next.length, 0) } };
    },
    validateConnection: async () => guard(() => ({ reachable: true, authenticated: true, providerVersion: "1.60.0", latencyMs: 12 })),
    discoverCapabilities: async () => guard(() => [...N8N_SUPPORT.actionKinds].map((op) => ({ operation: `action:${op}`, supported: true })).concat([{ operation: "workflow.create", supported: true }, { operation: "execution.retry", supported: true }])),
    deployWorkflow: async (input) => guard(() => { state.externalWorkflowHash = input.workflow.hash; state.externalActive = false; state.externalNodeCount = input.workflow.nodeCount; state.externalConnectionCount = input.workflow.connectionCount; return { externalWorkflowId: input.externalWorkflowId ?? `n8n_wf_${input.workflow.hash}`, externalWorkflowVersion: "1", active: false }; }),
    updateWorkflow: async (input) => guard(() => { state.externalWorkflowHash = input.workflow.hash; return { externalWorkflowId: input.externalWorkflowId ?? `n8n_wf_${input.workflow.hash}`, externalWorkflowVersion: "2", active: state.externalActive }; }),
    activateWorkflow: async (input) => guard(() => { state.externalActive = true; return { externalWorkflowId: input.externalWorkflowId ?? null, active: true }; }),
    deactivateWorkflow: async (input) => guard(() => { state.externalActive = false; return { externalWorkflowId: input.externalWorkflowId ?? null, active: false }; }),
    deleteWorkflow: async (input) => guard(() => { state.externalWorkflowHash = null; return { externalWorkflowId: input.externalWorkflowId ?? null, active: false }; }),
    getWorkflow: async (input) => guard(() => ({ externalWorkflowId: input.externalWorkflowId ?? "n8n_wf", name: "wf", active: state.externalActive, hash: state.externalWorkflowHash ?? "", nodeCount: state.externalNodeCount, connectionCount: state.externalConnectionCount })),
    listExecutions: async () => guard(() => ({ executions: state.execution ? [{ externalExecutionId: state.execution.id, externalWorkflowId: "n8n_wf", status: state.execution.status, startedAt: "t", stoppedAt: state.execution.status === "running" ? null : "t", durationMs: 100, triggerType: "webhook", failureCategory: state.execution.failure, errorSummary: state.execution.failure ? "failed" : "", lastNode: "a1" }] : [], nextCursor: null })),
    getExecution: async (input) => guard(() => ({ externalExecutionId: input.externalExecutionId ?? "exec", externalWorkflowId: "n8n_wf", status: state.execution?.status ?? "unknown", startedAt: "t", stoppedAt: "t", durationMs: 100, triggerType: "webhook", failureCategory: state.execution?.failure ?? null, errorSummary: "", lastNode: "a1" })),
    retryExecution: async (input) => guard(() => ({ externalWorkflowId: input.externalWorkflowId ?? null, active: state.externalActive })),
    stopExecution: async (input) => guard(() => ({ externalWorkflowId: input.externalWorkflowId ?? null, active: state.externalActive })),
    healthCheck: async () => guard(() => ({ level: "healthy" as const, providerVersion: "1.60.0", latencyMs: 9, detail: { ok: true } })),
  };
}
