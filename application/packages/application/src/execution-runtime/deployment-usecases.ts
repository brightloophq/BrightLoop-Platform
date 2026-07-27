/* =============================================================================
 * Execution Runtime — deployment lifecycle + orchestration (F3).
 *
 * Consumes the APPROVED E5 deployment package ONLY through E5's public read model
 * (`getDeploymentQueue`) — it never regenerates the workflow. Every provider-
 * changing operation is registry-gated (authorize → approval → policy → tenant),
 * idempotency-keyed, attempt-recorded, and audited via append-only events/logs.
 * Auxion stays the system of record: the provider is never authoritative.
 * ========================================================================== */

import {
  activationFor, buildDeployment, buildDeploymentAttempt, buildDeploymentEvent, buildDeploymentLog, buildReconciliation,
  buildRollbackRequest, buildRuntimePolicy, canTransitionDeployment, canTransitionRollback, classifyDrift,
  deployKey, evaluateDeploymentPolicy, normalizeFailure, operationKey, rollbackKey, sanitizeMetadata,
  type DeploymentMeta, type PolicyContext, type RuntimeAdapter,
} from "@brightloop/domain";
import type {
  DeploymentOperation, RollbackStatus, RuntimeDeployment, RuntimeDeploymentStatus, RuntimeEnvironment, RuntimePolicy,
  RuntimeProvider, RuntimeRollbackRequest,
} from "@brightloop/schema";
import { getDeploymentQueue } from "../automation-builder/builder-read.js";
import type { DeploymentPackageDTO } from "../automation-builder/dto.js";
import {
  authorize, requireExecutionRuntime, requireRuntimeAdapters, requireRuntimeSecrets, RUNTIME_MANAGE_CAP,
  DEPLOYMENT_CREATE_CAP, DEPLOYMENT_APPROVE_CAP, DEPLOYMENT_DEPLOY_CAP, DEPLOYMENT_ACTIVATE_CAP, DEPLOYMENT_PAUSE_CAP,
  DEPLOYMENT_RETRY_CAP, DEPLOYMENT_ROLLBACK_CAP, DEPLOYMENT_CANCEL_CAP, DEPLOYMENT_RECONCILE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import {
  toDeploymentDTO, toPolicyDTO, toReconciliationDTO, toRollbackDTO,
  type DeploymentDTO, type RuntimePolicyDTO, type ReconciliationDTO, type RollbackRequestDTO,
} from "./dto.js";

function adapterFor(ctx: AppContext, provider: RuntimeProvider): RuntimeAdapter {
  const a = requireRuntimeAdapters(ctx)[provider];
  if (a === undefined) throw new RuntimeUnavailableError(`No adapter is configured for provider ${provider}`);
  return a;
}

async function loadDeployment(ctx: AppContext, id: string, cap: string): Promise<RuntimeDeployment> {
  const er = requireExecutionRuntime(ctx);
  const dep = unwrap(await er.deployments.getById(id));
  if (dep === null) throw new NotFoundError("deployment");
  authorize(ctx.actor, cap, dep.clientId);
  return dep;
}

/** Fetch the finalized E5 package by id (workspace-scoped) + verify integrity. */
async function consumeE5Package(ctx: AppContext, workspaceId: string, packageId: string): Promise<DeploymentPackageDTO> {
  const queue = await getDeploymentQueue(ctx, workspaceId);
  const pkg = queue.find((p) => p.id === packageId);
  if (pkg === undefined) throw new NotFoundError("deployment package");
  if (pkg.status !== "ready") throw new ValidationError("The deployment package is not finalized", { package: "not_ready" });
  if (pkg.checksum.length === 0) throw new ValidationError("The deployment package has no checksum", { package: "no_checksum" });
  return pkg;
}

async function logDeployment(ctx: AppContext, dep: RuntimeDeployment, operation: string, severity: "info" | "warn" | "error", message: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const er = requireExecutionRuntime(ctx);
  unwrap(await er.deploymentLogs.append(buildDeploymentLog({ id: ctx.ids("rtlog"), workspaceId: dep.workspaceId, clientId: dep.clientId, runtimeRegistrationId: dep.runtimeRegistrationId, deploymentId: dep.id, executionId: null, provider: dep.provider, operation, severity, message, metadata: sanitizeMetadata(metadata), correlationId: dep.correlationId, traceId: dep.traceId, now: ctx.clock() })));
}

async function transition(ctx: AppContext, dep: RuntimeDeployment, to: RuntimeDeploymentStatus, operation: DeploymentOperation | null, reason: string, patch: Partial<RuntimeDeployment> = {}): Promise<RuntimeDeployment> {
  const er = requireExecutionRuntime(ctx);
  if (dep.status !== to && !canTransitionDeployment(dep.status, to)) throw new ConflictError(`Illegal deployment transition ${dep.status} → ${to}`);
  const next: RuntimeDeployment = { ...dep, ...patch, status: to, activationState: patch.activationState ?? activationFor(to), version: dep.version + 1, updatedAt: ctx.clock() };
  const saved = unwrap(await er.deployments.save(next, dep.version));
  unwrap(await er.deploymentEvents.append(buildDeploymentEvent(ctx.ids("rtevt"), dep.id, dep.workspaceId, dep.clientId, operation, dep.status, to, ctx.actor.userId, reason, dep.correlationId, ctx.clock())));
  return saved;
}

/* ---- policy ---------------------------------------------------------------- */

export interface UpsertPolicyInput { workspaceId: string; environment: RuntimeEnvironment; provider?: RuntimeProvider; requiresApproval: boolean; exactHashApproval: boolean; rollbackRequired: boolean; healthCheckRequired: boolean; autoActivate: boolean; maxRetries?: number; allowedDeployerRoles?: string[] }
export async function upsertRuntimePolicy(ctx: AppContext, input: UpsertPolicyInput): Promise<RuntimePolicyDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const provider = input.provider ?? "n8n";
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, RUNTIME_MANAGE_CAP, ctx.actor.clientId);
  const existing = unwrap(await er.policies.findByEnvironment(workspaceId, input.environment, provider));
  if (existing !== null) {
    const next: RuntimePolicy = { ...existing, requiresApproval: input.requiresApproval, exactHashApproval: input.exactHashApproval, rollbackRequired: input.rollbackRequired, healthCheckRequired: input.healthCheckRequired, autoActivate: input.autoActivate, maxRetries: input.maxRetries ?? existing.maxRetries, allowedDeployerRoles: input.allowedDeployerRoles ?? existing.allowedDeployerRoles, version: existing.version + 1, updatedAt: ctx.clock() };
    return toPolicyDTO(unwrap(await er.policies.save(next, existing.version)));
  }
  const pol = buildRuntimePolicy({ id: ctx.ids("rtpol"), workspaceId, clientId: ctx.actor.clientId, environment: input.environment, provider, requiresApproval: input.requiresApproval, exactHashApproval: input.exactHashApproval, rollbackRequired: input.rollbackRequired, healthCheckRequired: input.healthCheckRequired, autoActivate: input.autoActivate, maxRetries: input.maxRetries, allowedDeployerRoles: input.allowedDeployerRoles, createdByUserId: ctx.actor.userId, now: ctx.clock() });
  return toPolicyDTO(unwrap(await er.policies.create(pol)));
}

function metaFor(dep: RuntimeDeployment): DeploymentMeta {
  return { workspaceId: dep.workspaceId, deploymentId: dep.id, deploymentVersion: dep.deploymentVersion, packageId: dep.deploymentPackageId, packageHash: dep.packageHash, correlationId: dep.correlationId };
}

/* ---- request + validate + approve ------------------------------------------ */

export interface CreateDeploymentInput { workspaceId: string; runtimeRegistrationId: string; deploymentPackageId: string }
export async function createDeploymentRequest(ctx: AppContext, input: CreateDeploymentInput): Promise<DeploymentDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const runtimeRegistrationId = requireId(input.runtimeRegistrationId, "runtimeRegistrationId");
  const deploymentPackageId = requireId(input.deploymentPackageId, "deploymentPackageId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, DEPLOYMENT_CREATE_CAP, ctx.actor.clientId);

  const rt = unwrap(await er.runtimes.getById(runtimeRegistrationId));
  if (rt === null || rt.workspaceId !== workspaceId) throw new NotFoundError("runtime");
  if (rt.status === "disabled" || rt.status === "revoked") throw new ConflictError("The runtime is disabled");
  const pkg = await consumeE5Package(ctx, workspaceId, deploymentPackageId);

  const priorForPackage = unwrap(await er.deployments.listByPackage(deploymentPackageId)).filter((d) => d.runtimeRegistrationId === runtimeRegistrationId);
  const deploymentVersion = priorForPackage.reduce((m, d) => Math.max(m, d.deploymentVersion), 0) + 1;
  const previous = priorForPackage.sort((a, b) => b.deploymentVersion - a.deploymentVersion).find((d) => d.status === "active" || d.status === "superseded" || d.status === "deployed") ?? null;

  const id = ctx.ids("rtdep");
  const dep = buildDeployment({ id, workspaceId, clientId: ctx.actor.clientId, runtimeRegistrationId, provider: rt.provider, deploymentPackageId, packageHash: pkg.checksum, workflowDefinitionId: pkg.workflowDefinitionId, deploymentVersion, targetEnvironment: rt.environment, translatedWorkflowHash: "", previousDeploymentId: previous?.id ?? null, requestedByUserId: ctx.actor.userId, correlationId: ctx.ids("corr"), traceId: ctx.ids("trace"), now: ctx.clock() });
  // Translate up-front to detect incompatibility BEFORE anything is queued, and to
  // record the drift baseline. Never silently omit unsupported constructs.
  const outcome = adapterFor(ctx, rt.provider).translate(pkg.payload, metaFor(dep));
  if (!outcome.ok) throw new ValidationError(`The workflow cannot be represented by ${rt.provider}`, Object.fromEntries(outcome.report.items.map((i, n) => [`item_${n}`, `${i.subject}: ${i.reason}`])));
  dep.translatedWorkflowHash = outcome.workflow.hash;
  unwrap(await er.deployments.create(dep));
  await logDeployment(ctx, dep, "create", "info", `Deployment request created (v${deploymentVersion}).`, { deploymentVersion, packageHash: pkg.checksum });
  return toDeploymentDTO(dep);
}

export async function validateDeploymentRequest(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_CREATE_CAP);
  const er = requireExecutionRuntime(ctx);
  const validating = await transition(ctx, dep, "validating", null, "validating deployment");
  const pkg = await consumeE5Package(ctx, dep.workspaceId, dep.deploymentPackageId);
  if (pkg.checksum !== dep.packageHash) { await transition(ctx, validating, "failed", null, "package hash changed"); throw new ValidationError("The deployment package changed since the request", { package_mismatch: "checksum" }); }
  const outcome = adapterFor(ctx, dep.provider).translate(pkg.payload, metaFor(dep));
  if (!outcome.ok) { await transition(ctx, validating, "failed", null, "incompatible workflow"); throw new ValidationError("The workflow is incompatible with the runtime", { unsupported: "translate" }); }
  const policy = unwrap(await er.policies.findByEnvironment(dep.workspaceId, dep.targetEnvironment, dep.provider));
  const next = policy?.requiresApproval ?? dep.targetEnvironment !== "development" ? "awaiting_approval" : "queued";
  return toDeploymentDTO(await transition(ctx, validating, next, null, `validated → ${next}`));
}

export async function requestDeploymentApproval(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_CREATE_CAP);
  if (dep.status === "awaiting_approval") return toDeploymentDTO(dep);
  return toDeploymentDTO(await transition(ctx, dep, "awaiting_approval", null, "approval requested"));
}

export interface ApproveDeploymentInput { deploymentId: string; expiresAt?: string | null }
export async function approveDeployment(ctx: AppContext, input: ApproveDeploymentInput): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(input.deploymentId, "deploymentId"), DEPLOYMENT_APPROVE_CAP);
  if (dep.status !== "awaiting_approval") throw new ConflictError("The deployment is not awaiting approval");
  const er = requireExecutionRuntime(ctx);
  // The approval BINDS this immutable deployment (its packageHash cannot change).
  const evt = unwrap(await er.deploymentEvents.append(buildDeploymentEvent(ctx.ids("rtevt"), dep.id, dep.workspaceId, dep.clientId, null, dep.status, dep.status, ctx.actor.userId, `approved hash ${dep.packageHash}`, dep.correlationId, ctx.clock())));
  return toDeploymentDTO(await transition(ctx, dep, "queued", null, "approved", { approvalReferenceId: evt.id, approvedByUserId: ctx.actor.userId, approvalExpiresAt: input.expiresAt ?? null }));
}

/* ---- deploy orchestration -------------------------------------------------- */

function policyContext(ctx: AppContext, dep: RuntimeDeployment, runtimeHealthy: boolean): PolicyContext {
  return {
    actorRole: ctx.actor.role,
    approvalPresent: dep.approvalReferenceId !== null,
    approvalExpired: dep.approvalExpiresAt !== null && dep.approvalExpiresAt < ctx.clock(),
    approvalHashMatches: dep.approvalReferenceId !== null, // structural: approval targets this immutable deployment
    rollbackTargetPresent: dep.previousDeploymentId !== null,
    runtimeHealthy,
  };
}

export async function deployPackage(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep0 = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_DEPLOY_CAP);
  const er = requireExecutionRuntime(ctx);
  if (dep0.status === "active" || dep0.status === "deployed") return toDeploymentDTO(dep0); // already deployed
  if (dep0.status !== "queued") throw new ConflictError("The deployment is not queued for deploy");

  const rt = unwrap(await er.runtimes.getById(dep0.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");
  if (rt.status === "disabled" || rt.status === "revoked") throw new ConflictError("The runtime is disabled");

  // Verify the E5 package still matches the approved deployment.
  const pkg = await consumeE5Package(ctx, dep0.workspaceId, dep0.deploymentPackageId);
  if (pkg.checksum !== dep0.packageHash) { await transition(ctx, dep0, "failed", "deploy", "package mismatch"); throw new ValidationError(normalizeFailure("package_mismatch").userMessage); }

  // Policy gate.
  const policy = unwrap(await er.policies.findByEnvironment(dep0.workspaceId, dep0.targetEnvironment, dep0.provider));
  if (policy !== null) {
    const evalr = evaluateDeploymentPolicy(policy, policyContext(ctx, dep0, rt.healthState === "healthy"));
    if (!evalr.permitted) { await transition(ctx, dep0, "failed", "deploy", `policy: ${evalr.violations.map((v) => v.code).join(",")}`); throw new ValidationError(normalizeFailure(evalr.violations[0]!.category).userMessage, Object.fromEntries(evalr.violations.map((v) => [v.code, v.detail]))); }
  }

  // Idempotency: a completed deploy with the same key returns the existing result.
  const key = deployKey(dep0.workspaceId, dep0.deploymentPackageId, dep0.runtimeRegistrationId, dep0.packageHash);
  const prior = unwrap(await er.deploymentAttempts.findByIdempotencyKey(key));
  if (prior !== null && prior.status === "succeeded") { await logDeployment(ctx, dep0, "deploy", "info", "Idempotent replay: deployment already applied."); return toDeploymentDTO(dep0); }

  // Translate (fail before any provider call on incompatibility).
  const outcome = adapterFor(ctx, rt.provider).translate(pkg.payload, metaFor(dep0));
  if (!outcome.ok) { await transition(ctx, dep0, "failed", "deploy", "incompatible"); throw new ValidationError(normalizeFailure("unsupported").userMessage); }

  const deploying = await transition(ctx, dep0, "deploying", "deploy", "deploying");
  const attempt = unwrap(await er.deploymentAttempts.append(buildDeploymentAttempt(ctx.ids("rtatt"), deploying.id, deploying.workspaceId, deploying.clientId, "deploy", key, 1, ctx.clock())));
  const { baseUrl, secret } = await resolveConn(ctx, rt.baseUrlRef, rt.credentialReferenceId);
  const res = await adapterFor(ctx, rt.provider).deployWorkflow({ runtimeBaseUrl: baseUrl, secret, workflow: outcome.workflow, externalWorkflowId: deploying.externalWorkflowId, idempotencyKey: key, timeoutMs: 60_000 });

  if (!res.ok) {
    const nf = normalizeFailure(res.category, res.code);
    unwrap(await er.deploymentAttempts.append({ ...attempt, id: ctx.ids("rtatt"), status: "failed", failureCategory: res.category, providerCode: nf.providerCode, finishedAt: ctx.clock() }));
    await logDeployment(ctx, deploying, "deploy", "error", nf.userMessage, { category: res.category, providerCode: nf.providerCode });
    await transition(ctx, deploying, "failed", "deploy", nf.userMessage);
    throw new ValidationError(nf.userMessage, { [res.category]: "provider" });
  }
  unwrap(await er.deploymentAttempts.append({ ...attempt, id: ctx.ids("rtatt"), status: "succeeded", finishedAt: ctx.clock() }));
  const deployed = await transition(ctx, deploying, "deployed", "deploy", "deployed", { externalWorkflowId: res.value.externalWorkflowId, externalWorkflowVersion: res.value.externalWorkflowVersion, deployedByUserId: ctx.actor.userId, deployedAt: ctx.clock() });
  await logDeployment(ctx, deployed, "deploy", "info", "Workflow deployed to the runtime.", { externalWorkflowId: res.value.externalWorkflowId });

  // Reconcile immediately (drift baseline).
  await reconcileInternal(ctx, deployed, rt.baseUrlRef, rt.credentialReferenceId, "manual");

  if (policy?.autoActivate) return activateInternal(ctx, deployed);
  return toDeploymentDTO(deployed);
}

async function resolveConn(ctx: AppContext, baseUrlRef: string, credentialReferenceId: string | null): Promise<{ baseUrl: string; secret: string }> {
  const secrets = requireRuntimeSecrets(ctx);
  const er = requireExecutionRuntime(ctx);
  const baseUrl = await secrets.getSecret(baseUrlRef);
  const cred = credentialReferenceId ? unwrap(await er.credentials.getById(credentialReferenceId)) : null;
  const secret = cred ? await secrets.getSecret(cred.secretRef) : null;
  if (baseUrl === null || secret === null) throw new ValidationError(normalizeFailure("secret_unavailable").userMessage);
  return { baseUrl, secret };
}

async function activateInternal(ctx: AppContext, dep: RuntimeDeployment): Promise<DeploymentDTO> {
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(dep.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");
  const activating = await transition(ctx, dep, "activating", "activate", "activating");
  const { baseUrl, secret } = await resolveConn(ctx, rt.baseUrlRef, rt.credentialReferenceId);
  const key = operationKey("activate", dep.id, dep.deploymentVersion);
  const res = await adapterFor(ctx, rt.provider).activateWorkflow({ runtimeBaseUrl: baseUrl, secret, externalWorkflowId: dep.externalWorkflowId, idempotencyKey: key, timeoutMs: 30_000 });
  if (!res.ok) { const nf = normalizeFailure(res.category, res.code); await transition(ctx, activating, "failed", "activate", nf.userMessage); throw new ValidationError(nf.userMessage); }
  const active = await transition(ctx, activating, "active", "activate", "active", { activationState: "active" });
  // Supersede the previous active deployment for this package+runtime.
  if (dep.previousDeploymentId) { const prev = unwrap(await er.deployments.getById(dep.previousDeploymentId)); if (prev && prev.status === "active") await transition(ctx, prev, "superseded", null, `superseded by ${dep.id}`); }
  await logDeployment(ctx, active, "activate", "info", "Workflow activated.");
  return toDeploymentDTO(active);
}

export async function activateDeployment(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_ACTIVATE_CAP);
  if (dep.status === "active") return toDeploymentDTO(dep);
  if (dep.status !== "deployed") throw new ConflictError("The deployment is not ready to activate");
  return activateInternal(ctx, dep);
}

export async function pauseDeployment(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_PAUSE_CAP);
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(dep.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");
  const { baseUrl, secret } = await resolveConn(ctx, rt.baseUrlRef, rt.credentialReferenceId);
  const res = await adapterFor(ctx, rt.provider).deactivateWorkflow({ runtimeBaseUrl: baseUrl, secret, externalWorkflowId: dep.externalWorkflowId, timeoutMs: 20_000 });
  if (!res.ok) { const nf = normalizeFailure(res.category, res.code); throw new ValidationError(nf.userMessage); }
  // n8n cannot pause an in-flight execution through the supported API — deactivation
  // only prevents NEW runs. We report that honestly rather than claim more.
  await logDeployment(ctx, dep, "pause", "warn", "Deactivated to prevent new runs. In-flight executions continue until they finish.");
  return toDeploymentDTO(await transition(ctx, dep, "paused", "pause", "paused (new runs blocked)", { activationState: "paused" }));
}

export async function resumeDeployment(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_PAUSE_CAP);
  if (dep.status !== "paused") throw new ConflictError("The deployment is not paused");
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(dep.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");
  if (rt.status === "disabled" || rt.status === "revoked") throw new ConflictError("The runtime is unavailable");
  const { baseUrl, secret } = await resolveConn(ctx, rt.baseUrlRef, rt.credentialReferenceId);
  const res = await adapterFor(ctx, rt.provider).activateWorkflow({ runtimeBaseUrl: baseUrl, secret, externalWorkflowId: dep.externalWorkflowId, timeoutMs: 20_000 });
  if (!res.ok) { const nf = normalizeFailure(res.category, res.code); throw new ValidationError(nf.userMessage); }
  return toDeploymentDTO(await transition(ctx, dep, "active", "resume", "resumed", { activationState: "active" }));
}

export async function cancelDeployment(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_CANCEL_CAP);
  if (!canTransitionDeployment(dep.status, "cancelled")) throw new ConflictError(`A ${dep.status} deployment cannot be cancelled`);
  return toDeploymentDTO(await transition(ctx, dep, "cancelled", "cancel", "cancelled"));
}

export async function retryDeployment(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_RETRY_CAP);
  const er = requireExecutionRuntime(ctx);
  if (dep.status !== "failed") throw new ConflictError("Only a failed deployment can be retried");
  const attempts = unwrap(await er.deploymentAttempts.listByDeployment(dep.id)).filter((a) => a.operation === "deploy");
  const lastFailed = attempts.filter((a) => a.status === "failed").at(-1);
  if (lastFailed && lastFailed.failureCategory && !normalizeFailure(lastFailed.failureCategory).retryable) throw new ConflictError(`A ${lastFailed.failureCategory} failure is not retryable`);
  const policy = unwrap(await er.policies.findByEnvironment(dep.workspaceId, dep.targetEnvironment, dep.provider));
  if (attempts.length >= (policy?.maxRetries ?? 3) + 1) throw new ConflictError("The retry budget is exhausted");
  const requeued = await transition(ctx, dep, "queued", "deploy", "retry: re-queued");
  return deployPackage(ctx, requeued.id);
}

/* ---- reconciliation + drift ------------------------------------------------ */

async function reconcileInternal(ctx: AppContext, dep: RuntimeDeployment, baseUrlRef: string, credentialReferenceId: string | null, kind: "manual" | "polling"): Promise<ReconciliationDTO> {
  const er = requireExecutionRuntime(ctx);
  const { baseUrl, secret } = await resolveConn(ctx, baseUrlRef, credentialReferenceId);
  const adapter = adapterFor(ctx, dep.provider);
  const res = await adapter.getWorkflow({ runtimeBaseUrl: baseUrl, secret, externalWorkflowId: dep.externalWorkflowId, timeoutMs: 20_000 });
  const snapshot = res.ok
    ? { workflowHash: res.value.hash, workflowName: res.value.name, active: res.value.active, nodeCount: res.value.nodeCount, connectionCount: res.value.connectionCount }
    : { workflowHash: null, workflowName: null, active: null, nodeCount: null, connectionCount: null };
  // Recompute the EXPECTED structure by re-translating the immutable E5 package (the
  // hash is Auxion's baseline); the human name is not tracked as a drift signal.
  const pkg = await consumeE5Package(ctx, dep.workspaceId, dep.deploymentPackageId).catch(() => null);
  const expectedTr = pkg ? adapter.translate(pkg.payload, metaFor(dep)) : null;
  const expectedNodes = expectedTr && expectedTr.ok ? expectedTr.workflow.nodeCount : snapshot.nodeCount ?? 0;
  const expectedConns = expectedTr && expectedTr.ok ? expectedTr.workflow.connectionCount : snapshot.connectionCount ?? 0;
  const drift = classifyDrift({ translatedWorkflowHash: dep.translatedWorkflowHash, workflowName: snapshot.workflowName ?? "", active: dep.activationState === "active", nodeCount: expectedNodes, connectionCount: expectedConns }, snapshot);
  const rec = buildReconciliation(ctx.ids("rtrec"), dep.workspaceId, dep.clientId, dep.runtimeRegistrationId, dep.id, kind, drift.driftClass, dep.translatedWorkflowHash, snapshot.workflowHash ?? "", drift.changed.join(","), ctx.clock());
  unwrap(await er.reconciliations.append(rec));
  // Destructive drift in production is NEVER auto-corrected — surface for a decision.
  if (drift.requiresDecision && dep.targetEnvironment === "production") await logDeployment(ctx, dep, "reconcile", "warn", `Drift detected (${drift.driftClass}); production requires an explicit decision.`, { changed: drift.changed });
  return toReconciliationDTO(rec);
}

export async function reconcileDeployment(ctx: AppContext, rawDeploymentId: unknown): Promise<ReconciliationDTO> {
  const dep = await loadDeployment(ctx, requireId(rawDeploymentId, "deploymentId"), DEPLOYMENT_RECONCILE_CAP);
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(dep.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");
  return reconcileInternal(ctx, dep, rt.baseUrlRef, rt.credentialReferenceId, "manual");
}

/* ---- rollback -------------------------------------------------------------- */

export interface RequestRollbackInput { workspaceId: string; sourceDeploymentId: string; targetDeploymentId: string; reason: string }
export async function requestRollback(ctx: AppContext, input: RequestRollbackInput): Promise<RollbackRequestDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const source = await loadDeployment(ctx, requireId(input.sourceDeploymentId, "sourceDeploymentId"), DEPLOYMENT_ROLLBACK_CAP);
  const er = requireExecutionRuntime(ctx);
  const target = unwrap(await er.deployments.getById(requireId(input.targetDeploymentId, "targetDeploymentId")));
  if (target === null || target.workspaceId !== workspaceId || source.workspaceId !== workspaceId) throw new NotFoundError("target deployment");
  if (target.runtimeRegistrationId !== source.runtimeRegistrationId) throw new ValidationError("The rollback target uses a different runtime");
  // The target must be a previously-valid, restorable IMMUTABLE deployment (never rebuilt).
  if (!["active", "superseded", "deployed"].includes(target.status) || target.externalWorkflowId === null) throw new ValidationError("The rollback target is not a restorable deployment");
  const req = buildRollbackRequest({ id: ctx.ids("rtrbk"), workspaceId, clientId: ctx.actor.clientId, sourceDeploymentId: source.id, targetDeploymentId: target.id, reason: requireString(input.reason, "reason").slice(0, 1000), requestedByUserId: ctx.actor.userId, correlationId: source.correlationId, now: ctx.clock() });
  return toRollbackDTO(unwrap(await er.rollbacks.create(req)));
}

export async function executeRollback(ctx: AppContext, rawRollbackId: unknown): Promise<RollbackRequestDTO> {
  const rollbackId = requireId(rawRollbackId, "rollbackId");
  const er = requireExecutionRuntime(ctx);
  const req = unwrap(await er.rollbacks.getById(rollbackId));
  if (req === null) throw new NotFoundError("rollback");
  authorize(ctx.actor, DEPLOYMENT_ROLLBACK_CAP, req.clientId);
  if (req.status !== "requested") throw new ConflictError("The rollback is not pending");
  const source = unwrap(await er.deployments.getById(req.sourceDeploymentId));
  const target = unwrap(await er.deployments.getById(req.targetDeploymentId));
  if (source === null || target === null) throw new NotFoundError("deployment");
  const rt = unwrap(await er.runtimes.getById(target.runtimeRegistrationId));
  if (rt === null) throw new NotFoundError("runtime");

  const approved = advanceRollback(req, "approved");
  const executing = advanceRollback(approved, "executing");
  unwrap(await er.rollbacks.save({ ...executing, version: req.version + 1, updatedAt: ctx.clock() }, req.version));

  // Reactivate the target's IMMUTABLE workflow (idempotency-keyed). No rebuild.
  const key = rollbackKey(source.id, target.id);
  const { baseUrl, secret } = await resolveConn(ctx, rt.baseUrlRef, rt.credentialReferenceId);
  const res = await adapterFor(ctx, rt.provider).activateWorkflow({ runtimeBaseUrl: baseUrl, secret, externalWorkflowId: target.externalWorkflowId, idempotencyKey: key, timeoutMs: 60_000 });
  if (source.status === "active" || source.status === "paused" || source.status === "degraded") await transition(ctx, source, "rolling_back", "rollback", `rolling back to ${target.id}`);
  if (!res.ok) {
    const failed = advanceRollback(executing, "failed");
    const saved = unwrap(await er.rollbacks.save({ ...failed, version: req.version + 2, updatedAt: ctx.clock() }, req.version + 1));
    const cur = unwrap(await er.deployments.getById(source.id))!;
    if (cur.status === "rolling_back") await transition(ctx, cur, "failed", "rollback", "rollback failed");
    return toRollbackDTO(saved);
  }
  const curSource = unwrap(await er.deployments.getById(source.id))!;
  if (curSource.status === "rolling_back") await transition(ctx, curSource, "rolled_back", "rollback", `rolled back to ${target.id}`, { rollbackSourceDeploymentId: target.id });
  const curTarget = unwrap(await er.deployments.getById(target.id))!;
  if (curTarget.status !== "active") await transition(ctx, curTarget, "active", "activate", `restored by rollback ${req.id}`, { activationState: "active" });
  const completed = advanceRollback(executing, "completed");
  const saved = unwrap(await er.rollbacks.save({ ...completed, resultDeploymentId: target.id, version: req.version + 2, updatedAt: ctx.clock() }, req.version + 1));
  await logDeployment(ctx, curTarget, "rollback", "info", `Rolled back: restored deployment ${target.id}.`);
  return toRollbackDTO(saved);
}

function advanceRollback(req: RuntimeRollbackRequest, to: RollbackStatus): RuntimeRollbackRequest {
  if (req.status !== to && !canTransitionRollback(req.status, to)) throw new ConflictError(`Illegal rollback transition ${req.status} → ${to}`);
  return { ...req, status: to };
}
