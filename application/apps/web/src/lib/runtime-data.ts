import "server-only";

/**
 * Execution Runtime — server data access (Phase F · Sprint F3).
 *
 * The ONLY place the runtime UI reaches data, through the same seam as every other
 * surface: `buildAppContext()` → existing Execution Runtime read models. No
 * business logic, no queries — RLS scopes everything to the caller's own org
 * (`null` = unauthenticated). Secrets never appear (the read models are DTO-only).
 */

import { buildAppContext } from "./runtime-api";
import { resolveWorkspaces } from "./workspace-data";
import {
  getDeploymentDetail, getDeploymentLogs, getRuntimeDetail, getRuntimeExecutionDetail, getRuntimeOpsDashboard,
  listDeployments, listRollbackHistory, listRuntimeExecutions, listRuntimes,
  type DeploymentDTO, type DeploymentLogDTO, type RollbackRequestDTO, type RuntimeExecutionDTO, type RuntimeOpsDashboard,
  type RuntimeRegistrationDTO,
} from "@brightloop/application";

async function wid(): Promise<string | null> {
  return (await resolveWorkspaces())[0]?.id ?? null;
}

export interface RuntimeOverview {
  ops: RuntimeOpsDashboard;
  runtimes: RuntimeRegistrationDTO[];
  deployments: DeploymentDTO[];
  executions: RuntimeExecutionDTO[];
  rollbacks: RollbackRequestDTO[];
}

export async function loadRuntimeOverview(): Promise<RuntimeOverview | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaceId = await wid();
  if (workspaceId === null) return { ops: emptyOps(), runtimes: [], deployments: [], executions: [], rollbacks: [] };
  const [ops, runtimes, deployments, executions, rollbacks] = await Promise.all([
    getRuntimeOpsDashboard(ctx, workspaceId), listRuntimes(ctx, workspaceId), listDeployments(ctx, workspaceId),
    listRuntimeExecutions(ctx, workspaceId), listRollbackHistory(ctx, workspaceId),
  ]);
  return { ops, runtimes, deployments, executions, rollbacks };
}

export async function loadRuntimes(): Promise<{ runtimes: RuntimeRegistrationDTO[]; ops: RuntimeOpsDashboard } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaceId = await wid();
  if (workspaceId === null) return { runtimes: [], ops: emptyOps() };
  const [runtimes, ops] = await Promise.all([listRuntimes(ctx, workspaceId), getRuntimeOpsDashboard(ctx, workspaceId)]);
  return { runtimes, ops };
}

export async function loadRuntimeDetail(runtimeId: string): Promise<Awaited<ReturnType<typeof getRuntimeDetail>> | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try { return await getRuntimeDetail(ctx, runtimeId); } catch { return null; }
}

export async function loadDeployments(): Promise<{ deployments: DeploymentDTO[]; ops: RuntimeOpsDashboard } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaceId = await wid();
  if (workspaceId === null) return { deployments: [], ops: emptyOps() };
  const [deployments, ops] = await Promise.all([listDeployments(ctx, workspaceId), getRuntimeOpsDashboard(ctx, workspaceId)]);
  return { deployments, ops };
}

export interface DeploymentDetailData {
  detail: Awaited<ReturnType<typeof getDeploymentDetail>>;
  logs: DeploymentLogDTO[];
}
export async function loadDeploymentDetail(deploymentId: string): Promise<DeploymentDetailData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try {
    const [detail, logs] = await Promise.all([getDeploymentDetail(ctx, deploymentId), getDeploymentLogs(ctx, deploymentId).catch(() => [])]);
    return { detail, logs };
  } catch { return null; }
}

export async function loadExecutions(): Promise<{ executions: RuntimeExecutionDTO[] } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaceId = await wid();
  return { executions: workspaceId === null ? [] : await listRuntimeExecutions(ctx, workspaceId) };
}

export async function loadExecutionDetail(executionId: string): Promise<Awaited<ReturnType<typeof getRuntimeExecutionDetail>> | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try { return await getRuntimeExecutionDetail(ctx, executionId); } catch { return null; }
}

function emptyOps(): RuntimeOpsDashboard {
  return { runtimes: 0, healthyRuntimes: 0, activeDeployments: 0, failedDeployments: 0, awaitingApproval: 0, runningExecutions: 0, failedExecutions: 0 };
}
