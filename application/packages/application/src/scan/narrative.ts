/* =============================================================================
 * Use-case: a scan's narrative (Phase C · Sprint C1).
 *
 * Returns the AUDIENCE-SPECIFIC approved narrative artifact. Audience is a
 * required, validated parameter — a client must never be served the internal
 * operator narrative, and vice versa. Only the `approved` status is exposed;
 * a draft, validation_failed, review_required or superseded version is a 404.
 * ========================================================================== */

import { narrativeAudienceSchema } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { NarrativeDTO } from "../dto.js";
import { toNarrativeDTO } from "../dto.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

/** Validate the audience against the canonical narrative audiences. */
export function parseAudience(value: unknown): string {
  const parsed = narrativeAudienceSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError("'audience' is not a valid narrative audience", { audience: "invalid_value" });
  }
  return parsed.data;
}

export async function getScanNarrative(ctx: AppContext, rawRunId: unknown, rawAudience: unknown): Promise<NarrativeDTO> {
  const audience = parseAudience(rawAudience);
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);

  const latest = unwrap(
    await ctx.services.narratives.latest(run.id, audience),
    { not_found: () => new NotFoundError("approved narrative") },
  );
  if (latest.status !== "approved") {
    throw new NotFoundError("approved narrative");
  }
  return toNarrativeDTO(latest);
}
