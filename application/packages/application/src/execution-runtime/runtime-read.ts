/* =============================================================================
 * Execution Runtime read models (Phase F · Sprint F3).
 *
 * Runtime registry/detail/health, deployment list/detail/timeline/attempts/logs,
 * execution list/detail/failures, drift + rollback history, ops dashboard, and the
 * production deployment queue. Load-then-authorize; DTOs ONLY; never a secret.
 * Bounded reads (paginated logs/executions) — no unbounded scans.
 * ========================================================================== */

import { authorize, requireExecutionRuntime, DEPLOYMENT_READ_CAP, EXECUTION_READ_CAP, EXECUTION_LOGS_CAP, RUNTIME_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toAttemptDTO, toCredentialStatusDTO, toDeploymentDTO, toEventDTO, toExecutionDTO, toExecutionFailureDTO, toHealthDTO,
  toLogDTO, toReconciliationDTO, toRollbackDTO, toRuntimeDTO,
  type DeploymentDTO, type DeploymentEventDTO, type DeploymentLogDTO, type ExecutionFailureDTO, type ReconciliationDTO,
  type RollbackRequestDTO, type RuntimeExecutionDTO, type RuntimeRegistrationDTO,
} from "./dto.js";

const desc = <T extends { createdAt: string }>(a: T, b: T) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/* ---- runtime registry ------------------------------------------------------ */

export async function listRuntimes(ctx: AppContext, rawWorkspaceId: unknown): Promise<RuntimeRegistrationDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, RUNTIME_READ_CAP, ctx.actor.clientId);
  return unwrap(await er.runtimes.listByWorkspace(workspaceId)).map(toRuntimeDTO);
}

export async function getRuntimeDetail(ctx: AppContext, rawRuntimeId: unknown): Promise<{ runtime: RuntimeRegistrationDTO; health: ReturnType<typeof toHealthDTO>[]; capabilities: { operation: string; supported: boolean }[]; credential: ReturnType<typeof toCredentialStatusDTO> | null }> {
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(requireId(rawRuntimeId, "runtimeId")));
  if (rt === null) throw new NotFoundError("runtime");
  authorize(ctx.actor, RUNTIME_READ_CAP, rt.clientId);
  const [health, caps, cred] = await Promise.all([
    er.healthSnapshots.listByRuntime(rt.id).then(unwrap),
    er.capabilitySnapshots.listByRuntime(rt.id).then(unwrap),
    rt.credentialReferenceId ? er.credentials.getById(rt.credentialReferenceId).then(unwrap) : Promise.resolve(null),
  ]);
  const latestCaps = [...caps].sort(desc)[0]?.capabilities ?? [];
  return { runtime: toRuntimeDTO(rt), health: [...health].sort(desc).slice(0, 30).map(toHealthDTO), capabilities: latestCaps, credential: cred ? toCredentialStatusDTO(cred) : null };
}

export async function getRuntimeHealth(ctx: AppContext, rawRuntimeId: unknown): Promise<ReturnType<typeof toHealthDTO>[]> {
  const er = requireExecutionRuntime(ctx);
  const rt = unwrap(await er.runtimes.getById(requireId(rawRuntimeId, "runtimeId")));
  if (rt === null) throw new NotFoundError("runtime");
  authorize(ctx.actor, RUNTIME_READ_CAP, rt.clientId);
  return [...unwrap(await er.healthSnapshots.listByRuntime(rt.id))].sort(desc).map(toHealthDTO);
}

/* ---- deployments ----------------------------------------------------------- */

export async function listDeployments(ctx: AppContext, rawWorkspaceId: unknown): Promise<DeploymentDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, DEPLOYMENT_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await er.deployments.listByWorkspace(workspaceId))].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(toDeploymentDTO);
}

async function loadDeploymentForRead(ctx: AppContext, id: string) {
  const er = requireExecutionRuntime(ctx);
  const dep = unwrap(await er.deployments.getById(id));
  if (dep === null) throw new NotFoundError("deployment");
  authorize(ctx.actor, DEPLOYMENT_READ_CAP, dep.clientId);
  return { er, dep };
}

export async function getDeploymentDetail(ctx: AppContext, rawDeploymentId: unknown): Promise<{ deployment: DeploymentDTO; timeline: DeploymentEventDTO[]; attempts: ReturnType<typeof toAttemptDTO>[]; reconciliations: ReconciliationDTO[] }> {
  const { er, dep } = await loadDeploymentForRead(ctx, requireId(rawDeploymentId, "deploymentId"));
  const [events, attempts, recon] = await Promise.all([
    er.deploymentEvents.listByDeployment(dep.id).then(unwrap),
    er.deploymentAttempts.listByDeployment(dep.id).then(unwrap),
    er.reconciliations.listByDeployment(dep.id).then(unwrap),
  ]);
  return { deployment: toDeploymentDTO(dep), timeline: [...events].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(toEventDTO), attempts: attempts.map(toAttemptDTO), reconciliations: [...recon].sort(desc).map(toReconciliationDTO) };
}

export async function getDeploymentTimeline(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentEventDTO[]> {
  const { er, dep } = await loadDeploymentForRead(ctx, requireId(rawDeploymentId, "deploymentId"));
  return [...unwrap(await er.deploymentEvents.listByDeployment(dep.id))].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(toEventDTO);
}

export async function getDeploymentLogs(ctx: AppContext, rawDeploymentId: unknown): Promise<DeploymentLogDTO[]> {
  const er = requireExecutionRuntime(ctx);
  const dep = unwrap(await er.deployments.getById(requireId(rawDeploymentId, "deploymentId")));
  if (dep === null) throw new NotFoundError("deployment");
  authorize(ctx.actor, EXECUTION_LOGS_CAP, dep.clientId);
  return [...unwrap(await er.deploymentLogs.listByDeployment(dep.id))].sort(desc).map(toLogDTO);
}

export async function getDriftReport(ctx: AppContext, rawDeploymentId: unknown): Promise<ReconciliationDTO[]> {
  const { er, dep } = await loadDeploymentForRead(ctx, requireId(rawDeploymentId, "deploymentId"));
  return [...unwrap(await er.reconciliations.listByDeployment(dep.id))].sort(desc).map(toReconciliationDTO);
}

/* ---- executions ------------------------------------------------------------ */

export async function listRuntimeExecutions(ctx: AppContext, rawWorkspaceId: unknown): Promise<RuntimeExecutionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, EXECUTION_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await er.executions.listByWorkspace(workspaceId))].sort(desc).map(toExecutionDTO);
}

export async function getRuntimeExecutionDetail(ctx: AppContext, rawExecutionId: unknown): Promise<{ execution: RuntimeExecutionDTO; failures: ExecutionFailureDTO[]; attempts: number }> {
  const er = requireExecutionRuntime(ctx);
  const exec = unwrap(await er.executions.getById(requireId(rawExecutionId, "executionId")));
  if (exec === null) throw new NotFoundError("execution");
  authorize(ctx.actor, EXECUTION_READ_CAP, exec.clientId);
  const [failures, attempts] = await Promise.all([er.executionFailures.listByExecution(exec.id).then(unwrap), er.executionAttempts.listByExecution(exec.id).then(unwrap)]);
  return { execution: toExecutionDTO(exec), failures: [...failures].sort(desc).map(toExecutionFailureDTO), attempts: attempts.length };
}

export async function listExecutionFailures(ctx: AppContext, rawWorkspaceId: unknown): Promise<RuntimeExecutionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, EXECUTION_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await er.executions.listByWorkspace(workspaceId))].filter((e) => e.status === "failed").sort(desc).map(toExecutionDTO);
}

/* ---- rollback history + dashboards ----------------------------------------- */

export async function listRollbackHistory(ctx: AppContext, rawWorkspaceId: unknown): Promise<RollbackRequestDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, DEPLOYMENT_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await er.rollbacks.listByWorkspace(workspaceId))].sort(desc).map(toRollbackDTO);
}

export interface RuntimeOpsDashboard { runtimes: number; healthyRuntimes: number; activeDeployments: number; failedDeployments: number; awaitingApproval: number; runningExecutions: number; failedExecutions: number }
export async function getRuntimeOpsDashboard(ctx: AppContext, rawWorkspaceId: unknown): Promise<RuntimeOpsDashboard> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, RUNTIME_READ_CAP, ctx.actor.clientId);
  const [runtimes, deployments, executions] = await Promise.all([
    er.runtimes.listByWorkspace(workspaceId).then(unwrap),
    er.deployments.listByWorkspace(workspaceId).then(unwrap),
    er.executions.listByWorkspace(workspaceId).then(unwrap),
  ]);
  return {
    runtimes: runtimes.length,
    healthyRuntimes: runtimes.filter((r) => r.healthState === "healthy").length,
    activeDeployments: deployments.filter((d) => d.status === "active").length,
    failedDeployments: deployments.filter((d) => d.status === "failed").length,
    awaitingApproval: deployments.filter((d) => d.status === "awaiting_approval").length,
    runningExecutions: executions.filter((e) => e.status === "running").length,
    failedExecutions: executions.filter((e) => e.status === "failed").length,
  };
}

export async function getProductionDeploymentQueue(ctx: AppContext, rawWorkspaceId: unknown): Promise<DeploymentDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const er = requireExecutionRuntime(ctx);
  authorize(ctx.actor, DEPLOYMENT_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await er.deployments.listByWorkspace(workspaceId))]
    .filter((d) => d.targetEnvironment === "production" && (d.status === "awaiting_approval" || d.status === "queued" || d.status === "deploying"))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(toDeploymentDTO);
}
