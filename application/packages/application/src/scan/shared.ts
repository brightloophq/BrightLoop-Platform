/* =============================================================================
 * Shared load-and-authorize (Phase C · Sprint C1).
 *
 * NOT a god-service — a single guarded lookup every scan use-case needs: parse
 * the id, load the run, then authorize against THAT run's tenant. Loading first
 * and authorizing on the loaded `clientId` is what prevents exposing another
 * tenant's run: a caller can never assert ownership of an id they don't own,
 * because ownership is checked against the row, not the request.
 * ========================================================================== */

import type { RuntimeRun } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { authorize } from "../context.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";

/**
 * Load a run by id and authorize the actor for `capability` against its tenant.
 *
 * A run the caller may not see resolves to `NotFoundError` (via `unwrap`), which
 * is also what a genuinely missing run returns — so existence is never leaked to
 * an unauthorized caller. Ownership is then enforced on the loaded `clientId`.
 */
export async function loadAuthorizedRun(ctx: AppContext, rawRunId: unknown, capability: string): Promise<RuntimeRun> {
  const runId = requireId(rawRunId, "runId");
  const run = unwrap(await ctx.services.runs.getRun(runId));
  authorize(ctx.actor, capability, run.clientId);
  return run;
}
