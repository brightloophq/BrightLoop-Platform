/* =============================================================================
 * Use-case: a scan's report (Phase C · Sprint C1).
 *
 * Returns the latest APPROVED internal intelligence report as structured JSON —
 * no rendering, no PDF, no HTML. "Approved" for a report means a VALID artifact
 * (validation is the report's gate); an unvalidated or invalid report is not
 * exposed, and a scan with no report yet is a 404.
 * ========================================================================== */

import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { ArtifactDTO } from "../dto.js";
import { toArtifactDTO } from "../dto.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

export async function getScanReport(ctx: AppContext, rawRunId: unknown): Promise<ArtifactDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);

  const latest = unwrap(await ctx.services.artifacts.latest(run.id, "internal_intelligence_report"));
  if (latest === null || latest.validationStatus !== "valid") {
    throw new NotFoundError("approved report");
  }
  return toArtifactDTO(latest);
}
