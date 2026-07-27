"use server";

/* =============================================================================
 * Execution Runtime server actions (Phase F · Sprint F3) — the ONLY write path.
 *
 * Authenticate → application service → revalidate. React never touches a
 * repository, adapter, or secret store: every runtime operation goes through
 * @brightloop/application, so authorization, the registry/policy gate, approval,
 * idempotency, tenancy, audit and the error taxonomy are exactly those the public
 * API enforces. Only a canonical ApplicationError message ever crosses back —
 * never a stack, SQLSTATE, provider body, or secret. Orchestration lives in the
 * use-cases, NOT here.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import {
  activateDeployment, approveDeployment, checkRuntimeHealth, deployPackage, executeRollback, isApplicationError,
  pauseDeployment, reconcileDeployment, requestDeploymentApproval, requestRollback, resumeDeployment, retryDeployment,
  validateDeploymentRequest, validateRuntimeConnection,
} from "@brightloop/application";
import { buildAppContext } from "@/lib/runtime-api";

export interface ActionResult { ok: boolean; error?: string }

const RUNTIME_PATHS = ["/workspace/runtimes", "/workspace/deployments", "/workspace/executions"];
function revalidate() { for (const p of RUNTIME_PATHS) revalidatePath(p); }
function fail(error: unknown, fallback: string): ActionResult { return { ok: false, error: isApplicationError(error) ? error.message : fallback }; }

async function run(fn: (ctx: NonNullable<Awaited<ReturnType<typeof buildAppContext>>>) => Promise<unknown>, fallback: string): Promise<ActionResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "Your session has expired. Please sign in again." };
    await fn(ctx);
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err, fallback);
  }
}

export async function validateRuntimeAction(runtimeId: string): Promise<ActionResult> { return run((ctx) => validateRuntimeConnection(ctx, runtimeId), "The runtime could not be validated."); }
export async function checkRuntimeHealthAction(runtimeId: string): Promise<ActionResult> { return run((ctx) => checkRuntimeHealth(ctx, runtimeId), "The runtime health check failed."); }
export async function validateDeploymentAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => validateDeploymentRequest(ctx, deploymentId), "The deployment could not be validated."); }
export async function requestApprovalAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => requestDeploymentApproval(ctx, deploymentId), "The approval could not be requested."); }
export async function approveDeploymentAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => approveDeployment(ctx, { deploymentId }), "The deployment could not be approved."); }
export async function deployAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => deployPackage(ctx, deploymentId), "The deployment failed."); }
export async function activateAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => activateDeployment(ctx, deploymentId), "The deployment could not be activated."); }
export async function pauseAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => pauseDeployment(ctx, deploymentId), "The deployment could not be paused."); }
export async function resumeAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => resumeDeployment(ctx, deploymentId), "The deployment could not be resumed."); }
export async function retryAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => retryDeployment(ctx, deploymentId), "The deployment could not be retried."); }
export async function reconcileAction(deploymentId: string): Promise<ActionResult> { return run((ctx) => reconcileDeployment(ctx, deploymentId), "The deployment could not be reconciled."); }

export async function rollbackAction(workspaceId: string, sourceDeploymentId: string, targetDeploymentId: string, reason: string): Promise<ActionResult> {
  return run(async (ctx) => {
    const req = await requestRollback(ctx, { workspaceId, sourceDeploymentId, targetDeploymentId, reason });
    await executeRollback(ctx, req.id);
  }, "The rollback could not be completed.");
}
