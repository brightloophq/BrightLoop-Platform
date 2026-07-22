/* =============================================================================
 * Use-case: create a scan (Phase C · Sprint C1).
 *
 * Validate → authorize (capability + ownership) → initialize the runtime run and
 * enqueue its first stage → return a DTO. One use-case, one file.
 *
 * The browser never learns that "create a scan" means "initialize a run and
 * enqueue a job" — that is the coordinator's business, invoked here.
 * ========================================================================== */

import type { AppContext } from "../context.js";
import { authorize, SCAN_WRITE_CAP } from "../context.js";
import type { CreateScanRequest, ScanDTO } from "../dto.js";
import { toScanDTO } from "../dto.js";
import { unwrap } from "../runtime-result.js";
import { optionalIso, optionalRecord, requireIdLike, requireObject } from "../validate.js";

/** Validate a raw request body into a typed `CreateScanRequest`. */
export function parseCreateScanRequest(body: unknown): CreateScanRequest {
  const obj = requireObject(body);
  return {
    clientId: requireIdLike(obj["clientId"], "clientId"),
    metadata: optionalRecord(obj["metadata"], "metadata"),
    deadline: optionalIso(obj["deadline"], "deadline"),
  };
}

export async function createScan(ctx: AppContext, input: CreateScanRequest): Promise<ScanDTO> {
  authorize(ctx.actor, SCAN_WRITE_CAP, input.clientId);

  // A scan IS a run; the runtime keys the run on this scan id, so a duplicate
  // create for the same generated id replays rather than forking. We mint a fresh
  // scan id per create — each create is a new scan of the target.
  const scanId = ctx.ids("scan");

  const created = unwrap(
    await ctx.services.coordinator.initializeRun({
      clientId: input.clientId,
      scanId,
      metadata: input.metadata ?? {},
      deadline: input.deadline ?? null,
    }),
  );

  return toScanDTO(created.run);
}
