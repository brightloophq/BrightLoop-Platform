/* =============================================================================
 * Execution-management read models (Phase D · Sprint D3+D4).
 *
 * Read-only projections: per-initiative execution (reviews + tasks + readiness)
 * and the workspace execution summary (dependency graph + rollups). Load-then-
 * authorize; DTOs only.
 * ========================================================================== */

import { authorize, requireExecution, INITIATIVE_READ_CAP, TRANSFORMATION_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toDependencyDTO, toReviewDTO, toTaskDTO, type InitiativeExecutionDTO, type WorkspaceExecutionDTO } from "./dto.js";

function taskCounts(tasks: readonly { status: string }[]): { todo: number; in_progress: number; blocked: number; completed: number } {
  const counts = { todo: 0, in_progress: 0, blocked: 0, completed: 0 };
  for (const t of tasks) if (t.status in counts) counts[t.status as keyof typeof counts] += 1;
  return counts;
}

/** One initiative's execution read model: reviews, tasks, and execution readiness. */
export async function getInitiativeExecution(ctx: AppContext, rawInitiativeId: unknown): Promise<InitiativeExecutionDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, INITIATIVE_READ_CAP, initiative.clientId);

  const reviews = unwrap(await exec.reviews.listByInitiative(initiativeId));
  const tasks = unwrap(await exec.tasks.listByInitiative(initiativeId));
  const executionReady = reviews.some((r) => r.status === "approved");
  return {
    initiativeId,
    reviews: reviews.map(toReviewDTO),
    tasks: [...tasks].sort((a, b) => a.order - b.order).map(toTaskDTO),
    executionReady,
    taskCounts: taskCounts(tasks),
  };
}

/** The workspace-level execution summary: dependencies + tasks + readiness set. */
export async function getWorkspaceExecution(ctx: AppContext, rawWorkspaceId: unknown): Promise<WorkspaceExecutionDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const exec = requireExecution(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, TRANSFORMATION_READ_CAP, workspace.clientId);

  const dependencies = unwrap(await exec.dependencies.listByWorkspace(workspaceId));
  const reviews = unwrap(await exec.reviews.listByWorkspace(workspaceId));
  const tasks = unwrap(await exec.tasks.listByWorkspace(workspaceId));
  const executionReadyInitiativeIds = [...new Set(reviews.filter((r) => r.status === "approved").map((r) => r.initiativeId))].sort();
  return {
    workspaceId,
    dependencies: dependencies.map(toDependencyDTO),
    reviews: reviews.map(toReviewDTO),
    tasks: tasks.map(toTaskDTO),
    executionReadyInitiativeIds,
  };
}
