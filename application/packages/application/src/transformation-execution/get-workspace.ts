/* =============================================================================
 * getTransformationWorkspace / listTransformationWorkspaces (Phase D · D1).
 *
 * Read models for the workspace UI. Load first, then authorize against the loaded
 * workspace's tenant — a caller can never read a workspace they do not own. All
 * outputs are DTOs; no repository rows cross outward.
 * ========================================================================== */

import { authorize, requireExecution, TRANSFORMATION_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toWorkspaceDetailDTO, toWorkspaceSummaryDTO, type WorkspaceDetailDTO, type WorkspaceSummaryDTO } from "./dto.js";

/** Full read model for one workspace: summary + initiatives + progress + activity. */
export async function getTransformationWorkspace(ctx: AppContext, rawId: unknown): Promise<WorkspaceDetailDTO> {
  const id = requireId(rawId, "workspaceId");
  const exec = requireExecution(ctx);

  const workspace = unwrap(await exec.workspaces.getById(id));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, TRANSFORMATION_READ_CAP, workspace.clientId);

  const initiatives = unwrap(await exec.initiatives.listByWorkspace(workspace.id));
  const activities = unwrap(await exec.activities.listByWorkspace(workspace.id));
  return toWorkspaceDetailDTO(workspace, initiatives, activities);
}

/** The operator's workspaces (internal read). */
export async function listTransformationWorkspaces(ctx: AppContext): Promise<WorkspaceSummaryDTO[]> {
  authorize(ctx.actor, TRANSFORMATION_READ_CAP, null);
  const exec = requireExecution(ctx);
  const workspaces = unwrap(await exec.workspaces.listByClient(ctx.actor.clientId));
  // A bounded per-workspace initiative count keeps the list summary honest.
  const summaries: WorkspaceSummaryDTO[] = [];
  for (const w of workspaces) {
    const initiatives = unwrap(await exec.initiatives.listByWorkspace(w.id));
    summaries.push(toWorkspaceSummaryDTO(w, initiatives.length));
  }
  return summaries;
}
