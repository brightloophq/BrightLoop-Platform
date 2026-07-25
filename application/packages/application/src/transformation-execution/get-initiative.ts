/* =============================================================================
 * getInitiative read model (Phase D · Sprint D2).
 *
 * Read-only: an initiative's current state + version + its transition history
 * (the append-only activity filtered to this initiative). Load-then-authorize.
 * ========================================================================== */

import { authorize, requireExecution, INITIATIVE_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toActivitySummaryDTO, toInitiativeDTO, type InitiativeDetailDTO } from "./dto.js";

/** One initiative's current state/version + its append-only transition history. */
export async function getInitiative(ctx: AppContext, rawId: unknown): Promise<InitiativeDetailDTO> {
  const id = requireId(rawId, "initiativeId");
  const exec = requireExecution(ctx);

  const initiative = unwrap(await exec.initiatives.getById(id));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, INITIATIVE_READ_CAP, initiative.clientId);

  const activity = unwrap(await exec.activities.listByWorkspace(initiative.workspaceId));
  const history = activity
    .filter((a) => a.subjectType === "initiative" && a.subjectId === initiative.id)
    .map(toActivitySummaryDTO);
  return { initiative: toInitiativeDTO(initiative), history };
}
