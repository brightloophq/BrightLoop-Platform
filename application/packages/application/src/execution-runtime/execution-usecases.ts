/* =============================================================================
 * Execution Runtime — execution tracking, webhook ingestion, polling (F3).
 *
 * Runtime executions are tracked independently of deployments. Webhook ingestion
 * is idempotent (a receipt is persisted before processing; replays are dropped)
 * and NEVER trusts the payload for tenant identity — the workspace is resolved
 * from the registered runtime. Polling is a bounded, rerun-safe reconciliation
 * path for runtimes without suitable callbacks, suitable for an external scheduler.
 * ========================================================================== */

import {
  buildExecution, buildExecutionAttempt, buildExecutionFailure, canTransitionExecution, isExecutionTerminal,
  normalizeFailure, webhookKey, type RuntimeAdapter,
} from "@brightloop/domain";
import type { RuntimeDeployment, RuntimeExecution, RuntimeExecutionStatus, RuntimeFailureCategory, RuntimeRegistration } from "@brightloop/schema";
import {
  authorize, requireExecutionRuntime, requireRuntimeAdapters, requireRuntimeSecrets,
  EXECUTION_RETRY_CAP, EXECUTION_STOP_CAP, RUNTIME_HEALTH_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toExecutionDTO, type RuntimeExecutionDTO } from "./dto.js";

function adapterFor(ctx: AppContext, provider: RuntimeRegistration["provider"]): RuntimeAdapter {
  const a = requireRuntimeAdapters(ctx)[provider];
  if (a === undefined) throw new RuntimeUnavailableError(`No adapter is configured for provider ${provider}`);
  return a;
}
async function resolveConn(ctx: AppContext, rt: RuntimeRegistration): Promise<{ baseUrl: string; secret: string }> {
  const secrets = requireRuntimeSecrets(ctx);
  const er = requireExecutionRuntime(ctx);
  const baseUrl = await secrets.getSecret(rt.baseUrlRef);
  const cred = rt.credentialReferenceId ? unwrap(await er.credentials.getById(rt.credentialReferenceId)) : null;
  const secret = cred ? await secrets.getSecret(cred.secretRef) : null;
  if (baseUrl === null || secret === null) throw new ValidationError(normalizeFailure("secret_unavailable").userMessage);
  return { baseUrl, secret };
}

export interface ExecutionEventInput {
  runtimeRegistrationId: string; deploymentId: string; externalExecutionId: string; externalWorkflowId: string | null;
  status: RuntimeExecutionStatus; triggerType: string | null; durationMs?: number; failureCategory?: RuntimeFailureCategory | null;
  errorSummary?: string; lastNode?: string | null; startedAt?: string | null; stoppedAt?: string | null;
}

/** Upsert a normalized runtime execution (idempotent per external id) + append history. */
export async function recordExecutionEvent(ctx: AppContext, dep: RuntimeDeployment, input: ExecutionEventInput): Promise<RuntimeExecution> {
  const er = requireExecutionRuntime(ctx);
  const existing = unwrap(await er.executions.findByExternalId(input.runtimeRegistrationId, input.externalExecutionId));
  const now = ctx.clock();
  if (existing === null) {
    const exec = buildExecution({ id: ctx.ids("rtexec"), workspaceId: dep.workspaceId, clientId: dep.clientId, deploymentId: dep.id, runtimeRegistrationId: input.runtimeRegistrationId, externalExecutionId: input.externalExecutionId, externalWorkflowId: input.externalWorkflowId, status: input.status, triggerType: input.triggerType, correlationId: dep.correlationId, traceId: dep.traceId, now });
    const withData: RuntimeExecution = { ...exec, durationMs: input.durationMs ?? 0, failureCategory: input.failureCategory ?? null, errorSummary: (input.errorSummary ?? "").slice(0, 500), lastNode: input.lastNode ?? null, startedAt: input.startedAt ?? null, stoppedAt: input.stoppedAt ?? null };
    const created = unwrap(await er.executions.create(withData));
    unwrap(await er.executionAttempts.append(buildExecutionAttempt(ctx.ids("rteatt"), created.id, dep.id, dep.workspaceId, dep.clientId, 1, input.status, now)));
    if (input.status === "failed" && input.failureCategory) unwrap(await er.executionFailures.append(buildExecutionFailure(ctx.ids("rtefail"), created.id, dep.id, dep.workspaceId, dep.clientId, input.failureCategory, normalizeFailure(input.failureCategory).retryable, (input.errorSummary ?? "").slice(0, 500), null, input.lastNode ?? null, now)));
    return created;
  }
  // Only advance to a NEWER state (stale reconciliation never regresses a terminal one).
  if (isExecutionTerminal(existing.status) || (existing.status !== input.status && !canTransitionExecution(existing.status, input.status))) return existing;
  const next: RuntimeExecution = { ...existing, status: input.status, durationMs: input.durationMs ?? existing.durationMs, failureCategory: input.failureCategory ?? existing.failureCategory, errorSummary: (input.errorSummary ?? existing.errorSummary).slice(0, 500), lastNode: input.lastNode ?? existing.lastNode, stoppedAt: input.stoppedAt ?? existing.stoppedAt, version: existing.version + 1, updatedAt: now };
  const saved = unwrap(await er.executions.save(next, existing.version));
  if (input.status === "failed" && input.failureCategory) unwrap(await er.executionFailures.append(buildExecutionFailure(ctx.ids("rtefail"), saved.id, dep.id, dep.workspaceId, dep.clientId, input.failureCategory, normalizeFailure(input.failureCategory).retryable, (input.errorSummary ?? "").slice(0, 500), null, input.lastNode ?? null, now)));
  return saved;
}

/* ---- webhook ingestion (idempotent; workspace never trusted from payload) --- */

export interface IngestWebhookInput { runtimeRegistrationId: string; externalEventId: string; externalExecutionId: string; status: RuntimeExecutionStatus; deploymentId?: string | null; signatureValid: boolean; failureCategory?: RuntimeFailureCategory | null; triggerType?: string | null }
export async function ingestRuntimeWebhook(ctx: AppContext, input: IngestWebhookInput): Promise<{ status: "processed" | "duplicate" | "rejected" }> {
  const er = requireExecutionRuntime(ctx);
  const runtimeId = requireId(input.runtimeRegistrationId, "runtimeRegistrationId");
  // Resolve the workspace from the REGISTERED runtime — never the payload.
  const rt = unwrap(await er.runtimes.getById(runtimeId));
  if (rt === null) throw new NotFoundError("runtime");
  authorize(ctx.actor, RUNTIME_HEALTH_CAP, rt.clientId);
  if (rt.status === "disabled" || rt.status === "revoked") return { status: "rejected" };

  const key = webhookKey(rt.provider, runtimeId, requireId(input.externalEventId, "externalEventId"));
  const prior = unwrap(await er.webhookReceipts.findByIdempotencyKey(key));
  if (prior !== null) return { status: "duplicate" };
  const receipt = unwrap(await er.webhookReceipts.append({ id: ctx.ids("rtwh"), workspaceId: rt.workspaceId, clientId: rt.clientId, runtimeRegistrationId: runtimeId, provider: rt.provider, externalEventId: input.externalEventId, idempotencyKey: key, signatureValid: input.signatureValid, status: "received", receivedAt: ctx.clock(), processedAt: null, createdAt: ctx.clock() }));
  if (!input.signatureValid) { unwrap(await er.webhookReceipts.append({ ...receipt, id: ctx.ids("rtwh"), status: "rejected", processedAt: ctx.clock() })); return { status: "rejected" }; }

  // Find the deployment: explicit id, else the runtime's active deployment.
  const deployment = input.deploymentId
    ? unwrap(await er.deployments.getById(input.deploymentId))
    : unwrap(await er.deployments.listByWorkspace(rt.workspaceId)).find((d) => d.runtimeRegistrationId === runtimeId && d.status === "active") ?? null;
  if (deployment === null || deployment.workspaceId !== rt.workspaceId) return { status: "rejected" };

  await recordExecutionEvent(ctx, deployment, { runtimeRegistrationId: runtimeId, deploymentId: deployment.id, externalExecutionId: input.externalExecutionId, externalWorkflowId: deployment.externalWorkflowId, status: input.status, triggerType: input.triggerType ?? null, failureCategory: input.failureCategory ?? null });
  unwrap(await er.webhookReceipts.append({ ...receipt, id: ctx.ids("rtwh"), status: "processed", processedAt: ctx.clock() }));
  return { status: "processed" };
}

/* ---- polling reconciliation (bounded; rerun-safe; for an external scheduler) - */

export interface PollResult { runtimeRegistrationId: string; scanned: number; updated: number; stopped: boolean }
export async function pollRuntimeState(ctx: AppContext, rawRuntimeId: unknown, opts: { limit?: number; since?: string | null } = {}): Promise<PollResult> {
  const er = requireExecutionRuntime(ctx);
  const runtimeId = requireId(rawRuntimeId, "runtimeId");
  const rt = unwrap(await er.runtimes.getById(runtimeId));
  if (rt === null) throw new NotFoundError("runtime");
  authorize(ctx.actor, RUNTIME_HEALTH_CAP, rt.clientId);
  if (rt.status === "disabled" || rt.status === "revoked") return { runtimeRegistrationId: runtimeId, scanned: 0, updated: 0, stopped: true };

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200); // never unbounded
  const { baseUrl, secret } = await resolveConn(ctx, rt);
  const active = unwrap(await er.deployments.listByWorkspace(rt.workspaceId)).filter((d) => d.runtimeRegistrationId === runtimeId && (d.status === "active" || d.status === "deployed"));
  let scanned = 0, updated = 0;
  for (const dep of active) {
    const res = await adapterFor(ctx, rt.provider).listExecutions({ runtimeBaseUrl: baseUrl, secret, externalWorkflowId: dep.externalWorkflowId, cursor: null, since: opts.since ?? null, limit, timeoutMs: 20_000 });
    if (!res.ok) continue;
    for (const e of res.value.executions.slice(0, limit)) {
      scanned += 1;
      const before = unwrap(await er.executions.findByExternalId(runtimeId, e.externalExecutionId));
      await recordExecutionEvent(ctx, dep, { runtimeRegistrationId: runtimeId, deploymentId: dep.id, externalExecutionId: e.externalExecutionId, externalWorkflowId: e.externalWorkflowId, status: e.status, triggerType: e.triggerType, durationMs: e.durationMs, failureCategory: e.failureCategory, errorSummary: e.errorSummary, lastNode: e.lastNode, startedAt: e.startedAt, stoppedAt: e.stoppedAt });
      const after = unwrap(await er.executions.findByExternalId(runtimeId, e.externalExecutionId));
      if (before === null || before.status !== after?.status) updated += 1;
    }
  }
  return { runtimeRegistrationId: runtimeId, scanned, updated, stopped: false };
}

/* ---- execution controls ---------------------------------------------------- */

async function loadExecution(ctx: AppContext, id: string, cap: string) {
  const er = requireExecutionRuntime(ctx);
  const exec = unwrap(await er.executions.getById(id));
  if (exec === null) throw new NotFoundError("execution");
  authorize(ctx.actor, cap, exec.clientId);
  const rt = unwrap(await er.runtimes.getById(exec.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");
  return { er, exec, rt };
}

export async function retryRuntimeExecution(ctx: AppContext, rawExecutionId: unknown): Promise<RuntimeExecutionDTO> {
  const { er, exec, rt } = await loadExecution(ctx, requireId(rawExecutionId, "executionId"), EXECUTION_RETRY_CAP);
  if (exec.failureCategory && !normalizeFailure(exec.failureCategory).retryable) throw new ConflictError(`A ${exec.failureCategory} execution failure is not retryable`);
  const { baseUrl, secret } = await resolveConn(ctx, rt);
  const res = await adapterFor(ctx, rt.provider).retryExecution({ runtimeBaseUrl: baseUrl, secret, externalExecutionId: exec.externalExecutionId, timeoutMs: 20_000 });
  if (!res.ok) throw new ValidationError(normalizeFailure(res.category, res.code).userMessage);
  const next = unwrap(await er.executions.save({ ...exec, status: "queued", retryNumber: exec.retryNumber + 1, version: exec.version + 1, updatedAt: ctx.clock() }, exec.version));
  unwrap(await er.executionAttempts.append(buildExecutionAttempt(ctx.ids("rteatt"), exec.id, exec.deploymentId, exec.workspaceId, exec.clientId, exec.retryNumber + 2, "queued", ctx.clock())));
  return toExecutionDTO(next);
}

export async function stopRuntimeExecution(ctx: AppContext, rawExecutionId: unknown): Promise<RuntimeExecutionDTO> {
  const { er, exec, rt } = await loadExecution(ctx, requireId(rawExecutionId, "executionId"), EXECUTION_STOP_CAP);
  if (isExecutionTerminal(exec.status)) return toExecutionDTO(exec);
  const { baseUrl, secret } = await resolveConn(ctx, rt);
  const res = await adapterFor(ctx, rt.provider).stopExecution({ runtimeBaseUrl: baseUrl, secret, externalExecutionId: exec.externalExecutionId, timeoutMs: 20_000 });
  if (!res.ok) throw new ValidationError(normalizeFailure(res.category, res.code).userMessage);
  const next = unwrap(await er.executions.save({ ...exec, status: "cancelled", stoppedAt: ctx.clock(), version: exec.version + 1, updatedAt: ctx.clock() }, exec.version));
  return toExecutionDTO(next);
}
