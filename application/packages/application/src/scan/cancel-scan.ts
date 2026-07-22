/* =============================================================================
 * Use-case: cancel a scan (Phase C · Sprint C1).
 *
 * Only a non-terminal run is cancellable. The runtime enforces that too
 * (`cancelRun` replays an already-cancelled run and refuses a completed one);
 * this layer maps those outcomes to the canonical application errors so the
 * boundary never leaks a runtime code.
 * ========================================================================== */

import type { AppContext } from "../context.js";
import { SCAN_WRITE_CAP } from "../context.js";
import type { ScanDTO } from "../dto.js";
import { toScanDTO } from "../dto.js";
import { AlreadyCompletedError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

export async function cancelScan(ctx: AppContext, rawRunId: unknown): Promise<ScanDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_WRITE_CAP);

  const cancelled = unwrap(
    await ctx.services.coordinator.cancelRun(run.id),
    // a completed run cannot be cancelled — that is "already completed", not a
    // generic conflict; a cancel of an already-cancelled run replays as ok.
    { terminal_state: () => new AlreadyCompletedError("This scan has already completed and cannot be cancelled") },
  );

  return toScanDTO(cancelled);
}
