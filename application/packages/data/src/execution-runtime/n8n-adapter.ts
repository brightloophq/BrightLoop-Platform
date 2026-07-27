/* =============================================================================
 * n8n runtime adapter + workflow translator (Phase F · Sprint F3).
 *
 * The ONLY place that speaks the n8n public REST API. It implements the domain
 * `RuntimeAdapter` port so the domain never imports an SDK. Every call is
 * timeout-bounded, normalizes provider errors into the stable taxonomy, detects
 * capability availability, and NEVER leaks response bodies / secrets (only a safe
 * `HTTP_<status>` code crosses the boundary). Translation is deterministic:
 * same package + same adapter version ⇒ same translated-workflow hash.
 * ========================================================================== */

import {
  detectIncompatibilities, hashString, readNeutralPackage,
  type ConnectionInput, type ConnectionValidationResult, type DeployWorkflowInput, type DeploymentMeta,
  type ListExecutionsInput, type OperationInput, type ProviderDeploymentResult, type ProviderExecutionPage,
  type ProviderExecutionSnapshot, type ProviderOperationResult, type ProviderResult, type ProviderWorkflowSnapshot,
  type RuntimeAdapter, type RuntimeCapabilityResult, type RuntimeHealthResult, type TranslatedWorkflow,
  type TranslationOutcome,
} from "@brightloop/domain";
import type { RuntimeExecutionStatus, RuntimeFailureCategory } from "@brightloop/schema";

const ADAPTER_VERSION = "n8n-adapter-1.0";
/** The n8n edition support matrix this adapter targets (public API v1). */
const SUPPORT = {
  triggerKinds: new Set(["manual", "schedule", "webhook", "crm_event", "form_submission", "payment", "email", "api_event"]),
  actionKinds: new Set(["send_email", "create_task", "update_crm", "http_request", "transform_data", "wait", "condition", "branch", "store_record", "notification", "webhook"]),
  variableTypes: new Set(["string", "number", "boolean", "json", "date"]),
  nodeKinds: new Set(["trigger", "action", "condition", "branch", "wait"]),
};

/* ---- deterministic translator (provider-specific) -------------------------- */

/** Convert the provider-NEUTRAL package into an n8n workflow document. Deterministic. */
export function translateToN8n(payload: Record<string, unknown>, meta: DeploymentMeta): TranslationOutcome {
  const neutral = readNeutralPackage(payload);
  const report = detectIncompatibilities(neutral, SUPPORT);
  if (!report.compatible) return { ok: false, report };

  const nodes = neutral.nodes.map((n, i) => ({
    id: `n8n_${n.key}`, name: n.key, type: mapNodeType(n.kind), typeVersion: 1,
    position: [220 * i, 0] as [number, number], parameters: {}, auxionRef: n.refId,
  }));
  const connections: Record<string, { main: { node: string; type: "main"; index: number }[][] }> = {};
  for (const n of neutral.nodes) {
    if (n.next.length === 0) continue;
    connections[`n8n_${n.key}`] = { main: [n.next.map((to) => ({ node: `n8n_${to}`, type: "main" as const, index: 0 }))] };
  }
  const connectionCount = neutral.nodes.reduce((s, n) => s + n.next.length, 0);
  // Auxion metadata (NO secrets) — Auxion remains the system of record.
  const document = {
    name: neutral.workflowName, active: false, nodes, connections,
    settings: { auxion: { workspaceId: meta.workspaceId, deploymentId: meta.deploymentId, deploymentVersion: meta.deploymentVersion, packageId: meta.packageId, packageHash: meta.packageHash, correlationId: meta.correlationId, adapterVersion: ADAPTER_VERSION } },
  };
  // The hash is computed over the CANONICAL structure only (order-stable), never metadata.
  const hash = hashString(`${ADAPTER_VERSION}|${JSON.stringify({ nodes: nodes.map((n) => [n.id, n.type]), connections })}`);
  const workflow: TranslatedWorkflow = { provider: "n8n", hash, name: neutral.workflowName, document, nodeCount: nodes.length, connectionCount };
  return { ok: true, workflow };
}

function mapNodeType(kind: string): string {
  switch (kind) {
    case "trigger": return "n8n-nodes-base.webhook";
    case "action": return "n8n-nodes-base.httpRequest";
    case "condition": return "n8n-nodes-base.if";
    case "branch": return "n8n-nodes-base.switch";
    case "wait": return "n8n-nodes-base.wait";
    default: return "n8n-nodes-base.noOp";
  }
}

/* ---- HTTP plumbing (timeout-bounded, secret-safe) -------------------------- */

interface HttpOutcome { status: number; ok: boolean; json: unknown; category: RuntimeFailureCategory | null }

async function call(baseUrl: string, path: string, secret: string, method: string, body: unknown, timeoutMs: number): Promise<HttpOutcome> {
  if (!/^https?:\/\//i.test(baseUrl)) return { status: 0, ok: false, json: null, category: "validation" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: { "X-N8N-API-KEY": secret, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, ok: res.ok, json, category: res.ok ? null : categoryForStatus(res.status) };
  } catch (e) {
    // AbortError ⇒ timeout; anything else ⇒ network. NEVER surface the raw error.
    const isAbort = e instanceof Error && e.name === "AbortError";
    return { status: 0, ok: false, json: null, category: isAbort ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function categoryForStatus(status: number): RuntimeFailureCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "unsupported";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";
  if (status === 429) return "throttled";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}
const fail = <T>(o: HttpOutcome): ProviderResult<T> => ({ ok: false, category: o.category ?? "unknown", code: o.status ? `HTTP_${o.status}` : null, message: "the n8n runtime rejected the request" });

function normalizeExecStatus(raw: unknown): RuntimeExecutionStatus {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s === "success" || s === "succeeded") return "succeeded";
  if (s === "error" || s === "failed" || s === "crashed") return "failed";
  if (s === "running") return "running";
  if (s === "waiting") return "waiting";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "new" || s === "queued") return "queued";
  return "unknown";
}

const asObj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : Array.isArray(asObj(v)["data"]) ? (asObj(v)["data"] as unknown[]) : []);

function toExecSnapshot(raw: unknown): ProviderExecutionSnapshot {
  const o = asObj(raw);
  const status = normalizeExecStatus(o["status"] ?? (o["finished"] === true ? "success" : "running"));
  return {
    externalExecutionId: String(o["id"] ?? ""), externalWorkflowId: o["workflowId"] ? String(o["workflowId"]) : null,
    status, startedAt: o["startedAt"] ? String(o["startedAt"]) : null, stoppedAt: o["stoppedAt"] ? String(o["stoppedAt"]) : null,
    durationMs: 0, triggerType: o["mode"] ? String(o["mode"]) : null,
    failureCategory: status === "failed" ? "execution_failed" : null, errorSummary: "", lastNode: o["lastNodeExecuted"] ? String(o["lastNodeExecuted"]) : null,
  };
}

/* ---- the adapter ----------------------------------------------------------- */

export function createN8nRuntimeAdapter(): RuntimeAdapter {
  return {
    provider: "n8n",
    translate: (payload, meta) => translateToN8n(payload, meta),

    async validateConnection(input: ConnectionInput): Promise<ProviderResult<ConnectionValidationResult>> {
      const started = Date.now();
      const o = await call(input.baseUrl, "/api/v1/workflows?limit=1", input.secret, "GET", undefined, 15_000);
      if (!o.ok) return o.category === "authentication" ? { ok: true, value: { reachable: true, authenticated: false, providerVersion: null, latencyMs: Date.now() - started } } : fail(o);
      return { ok: true, value: { reachable: true, authenticated: true, providerVersion: null, latencyMs: Date.now() - started } };
    },

    async discoverCapabilities(input: ConnectionInput): Promise<ProviderResult<RuntimeCapabilityResult[]>> {
      const o = await call(input.baseUrl, "/api/v1/workflows?limit=1", input.secret, "GET", undefined, 15_000);
      if (!o.ok) return fail(o);
      // The public API v1 exposes workflow CRUD + executions; retry/stop vary by edition.
      const ops: RuntimeCapabilityResult[] = [
        { operation: "workflow.create", supported: true }, { operation: "workflow.update", supported: true },
        { operation: "workflow.activate", supported: true }, { operation: "workflow.deactivate", supported: true },
        { operation: "workflow.delete", supported: true }, { operation: "execution.list", supported: true },
        { operation: "execution.get", supported: true }, { operation: "execution.stop", supported: true },
        { operation: "execution.retry", supported: false },
      ];
      return { ok: true, value: ops };
    },

    async deployWorkflow(input: DeployWorkflowInput): Promise<ProviderResult<ProviderDeploymentResult>> {
      const o = await call(input.runtimeBaseUrl, "/api/v1/workflows", input.secret, "POST", input.workflow.document, input.timeoutMs);
      if (!o.ok) return fail(o);
      const id = String(asObj(o.json)["id"] ?? asObj(asObj(o.json)["data"])["id"] ?? "");
      return { ok: true, value: { externalWorkflowId: id, externalWorkflowVersion: null, active: false } };
    },
    async updateWorkflow(input: DeployWorkflowInput): Promise<ProviderResult<ProviderDeploymentResult>> {
      const id = input.externalWorkflowId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/workflows/${encodeURIComponent(id)}`, input.secret, "PUT", input.workflow.document, input.timeoutMs);
      if (!o.ok) return fail(o);
      return { ok: true, value: { externalWorkflowId: id, externalWorkflowVersion: null, active: false } };
    },
    async activateWorkflow(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>> {
      const id = input.externalWorkflowId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/workflows/${encodeURIComponent(id)}/activate`, input.secret, "POST", {}, input.timeoutMs);
      if (!o.ok) return fail(o);
      return { ok: true, value: { externalWorkflowId: id, active: true } };
    },
    async deactivateWorkflow(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>> {
      const id = input.externalWorkflowId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/workflows/${encodeURIComponent(id)}/deactivate`, input.secret, "POST", {}, input.timeoutMs);
      if (!o.ok) return fail(o);
      return { ok: true, value: { externalWorkflowId: id, active: false } };
    },
    async deleteWorkflow(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>> {
      const id = input.externalWorkflowId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/workflows/${encodeURIComponent(id)}`, input.secret, "DELETE", undefined, input.timeoutMs);
      if (!o.ok) return fail(o);
      return { ok: true, value: { externalWorkflowId: id, active: false } };
    },
    async getWorkflow(input: OperationInput): Promise<ProviderResult<ProviderWorkflowSnapshot>> {
      const id = input.externalWorkflowId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/workflows/${encodeURIComponent(id)}`, input.secret, "GET", undefined, input.timeoutMs);
      if (!o.ok) return fail(o);
      const wf = asObj(asObj(o.json)["data"] ?? o.json);
      const nodes = Array.isArray(wf["nodes"]) ? (wf["nodes"] as unknown[]) : [];
      const conns = asObj(wf["connections"]);
      const connectionCount = Object.values(conns).reduce((s: number, c) => s + (Array.isArray(asObj(c)["main"]) ? (asObj(c)["main"] as unknown[]).flat().length : 0), 0);
      const hash = hashString(`${ADAPTER_VERSION}|${JSON.stringify({ nodes: nodes.map((n) => [`n8n_${asObj(n)["name"]}`, String(asObj(n)["type"])]), connections: conns })}`);
      return { ok: true, value: { externalWorkflowId: id, name: String(wf["name"] ?? ""), active: wf["active"] === true, hash, nodeCount: nodes.length, connectionCount } };
    },
    async listExecutions(input: ListExecutionsInput): Promise<ProviderResult<ProviderExecutionPage>> {
      const params = new URLSearchParams({ limit: String(Math.min(Math.max(input.limit, 1), 200)) });
      if (input.externalWorkflowId) params.set("workflowId", input.externalWorkflowId);
      if (input.cursor) params.set("cursor", input.cursor);
      const o = await call(input.runtimeBaseUrl, `/api/v1/executions?${params.toString()}`, input.secret, "GET", undefined, input.timeoutMs);
      if (!o.ok) return fail(o);
      const body = asObj(o.json);
      return { ok: true, value: { executions: asArr(o.json).map(toExecSnapshot), nextCursor: body["nextCursor"] ? String(body["nextCursor"]) : null } };
    },
    async getExecution(input: OperationInput): Promise<ProviderResult<ProviderExecutionSnapshot>> {
      const id = input.externalExecutionId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/executions/${encodeURIComponent(id)}`, input.secret, "GET", undefined, input.timeoutMs);
      if (!o.ok) return fail(o);
      return { ok: true, value: toExecSnapshot(asObj(o.json)["data"] ?? o.json) };
    },
    async retryExecution(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>> {
      const id = input.externalExecutionId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/executions/${encodeURIComponent(id)}/retry`, input.secret, "POST", {}, input.timeoutMs);
      if (!o.ok) return o.status === 404 ? { ok: false, category: "unsupported", code: "HTTP_404", message: "this n8n edition does not support execution retry" } : fail(o);
      return { ok: true, value: { externalWorkflowId: null, active: true } };
    },
    async stopExecution(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>> {
      const id = input.externalExecutionId ?? "";
      const o = await call(input.runtimeBaseUrl, `/api/v1/executions/${encodeURIComponent(id)}/stop`, input.secret, "POST", {}, input.timeoutMs);
      if (!o.ok) return fail(o);
      return { ok: true, value: { externalWorkflowId: null, active: false } };
    },
    async healthCheck(input: ConnectionInput): Promise<ProviderResult<RuntimeHealthResult>> {
      const started = Date.now();
      const o = await call(input.baseUrl, "/api/v1/workflows?limit=1", input.secret, "GET", undefined, 15_000);
      const latencyMs = Date.now() - started;
      if (o.ok) return { ok: true, value: { level: "healthy", providerVersion: null, latencyMs, detail: { reachable: true } } };
      if (o.category === "authentication") return { ok: true, value: { level: "unauthorized", providerVersion: null, latencyMs, detail: { reachable: true } } };
      if (o.category === "provider_unavailable" || o.category === "network" || o.category === "timeout") return { ok: true, value: { level: "unavailable", providerVersion: null, latencyMs, detail: {} } };
      return { ok: true, value: { level: "degraded", providerVersion: null, latencyMs, detail: {} } };
    },
  };
}
