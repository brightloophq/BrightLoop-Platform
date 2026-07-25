/* =============================================================================
 * Initiative lifecycle use-cases (Phase D · Sprint D2).
 *
 * plan / activate / complete / archive an initiative. Each: authorize
 * `initiative.write` against the loaded initiative's tenant → run the pure state
 * machine → persist under optimistic concurrency → append the append-only
 * activity → return the DTO. Idempotent and resume-safe: re-issuing a transition
 * that already landed is a no-op that re-asserts the (commandId-keyed) activity;
 * a concurrent transition loses on `version` and returns a 409.
 * ========================================================================== */

import { describeInitiativeTarget, transitionInitiative, type InitiativeLifecycleTarget } from "@brightloop/domain";
import type { Initiative, TransformationActivity } from "@brightloop/schema";
import { authorize, requireExecution, INITIATIVE_WRITE_CAP, type AppContext } from "../context.js";
import { ConflictError, NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toInitiativeDTO, type InitiativeDTO } from "./dto.js";

/** Build the append-only activity for a transition (commandId is content-addressed). */
function transitionActivity(ctx: AppContext, initiative: Initiative, to: InitiativeLifecycleTarget): TransformationActivity {
  const d = describeInitiativeTarget(to);
  return {
    id: ctx.ids("act"),
    workspaceId: initiative.workspaceId,
    clientId: initiative.clientId,
    type: d.activityType,
    subjectType: "initiative",
    subjectId: initiative.id,
    summary: `Initiative "${initiative.title}" ${d.verb}.`.slice(0, 400),
    // Deterministic per (initiative, target) → append is idempotent on replay/resume.
    commandId: `${initiative.id}:${to}`,
    at: ctx.clock(),
  };
}

async function transitionTo(ctx: AppContext, rawId: unknown, to: InitiativeLifecycleTarget): Promise<InitiativeDTO> {
  const id = requireId(rawId, "initiativeId");
  const exec = requireExecution(ctx);

  const current = unwrap(await exec.initiatives.getById(id));
  if (current === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, INITIATIVE_WRITE_CAP, current.clientId);

  // Idempotent / resume-safe: already at the target → re-assert the activity
  // (no-op if already appended) and return the current state; no version bump.
  if (current.executionStatus === to) {
    unwrap(await exec.activities.append(transitionActivity(ctx, current, to)));
    return toInitiativeDTO(current);
  }

  const outcome = transitionInitiative(current, to);
  if (!outcome.ok) {
    throw new ConflictError(`Cannot ${to} an initiative that is ${current.executionStatus}`);
  }
  const next = outcome.value.initiative;

  const saved = await exec.initiatives.save(next, current.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") {
      throw new ConflictError("The initiative changed concurrently; reload and retry");
    }
    unwrap(saved); // any other failure → canonical application error
  }
  unwrap(await exec.activities.append(transitionActivity(ctx, next, to)));
  return toInitiativeDTO(unwrap(saved));
}

/** seeded → planned. */
export const planInitiative = (ctx: AppContext, initiativeId: unknown): Promise<InitiativeDTO> => transitionTo(ctx, initiativeId, "planned");
/** planned → active. */
export const activateInitiative = (ctx: AppContext, initiativeId: unknown): Promise<InitiativeDTO> => transitionTo(ctx, initiativeId, "active");
/** active → completed. */
export const completeInitiative = (ctx: AppContext, initiativeId: unknown): Promise<InitiativeDTO> => transitionTo(ctx, initiativeId, "completed");
/** completed → archived. */
export const archiveInitiative = (ctx: AppContext, initiativeId: unknown): Promise<InitiativeDTO> => transitionTo(ctx, initiativeId, "archived");
