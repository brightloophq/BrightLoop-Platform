/* =============================================================================
 * Use-case: get one scan's status (Phase C · Sprint C1).
 *
 * Returns run status, current stage, progress %, timestamps, duration and a
 * summary. No evidence, no artifacts, no runtime internals — just the DTO.
 * ========================================================================== */

import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { ScanDTO } from "../dto.js";
import { toScanDTO } from "../dto.js";
import { loadAuthorizedRun } from "./shared.js";

export async function getScan(ctx: AppContext, rawRunId: unknown): Promise<ScanDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);
  return toScanDTO(run);
}
