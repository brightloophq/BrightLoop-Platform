/* =============================================================================
 * Use-case: a scan's proposal (Phase C · Sprint C1).
 *
 * Returns the latest APPROVED proposal artifact. A proposal is a commitment, not
 * a draft — so only an approved-and-onward status is ever exposed; a draft,
 * in-review, rejected, expired or withdrawn version is treated as "no approved
 * proposal" (404). A revision resets a version to draft, so if the latest is not
 * approved there is genuinely no current approved proposal to serve.
 * ========================================================================== */

import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { ArtifactDTO } from "../dto.js";
import { toProposalDTO } from "../dto.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

/** Proposal statuses that represent an approved, client-exposable commitment. */
const APPROVED_PROPOSAL = new Set<string>(["approved_for_send", "sent", "viewed", "accepted"]);

export async function getScanProposal(ctx: AppContext, rawRunId: unknown): Promise<ArtifactDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);

  const latest = unwrap(
    await ctx.services.proposals.latest(run.id),
    { not_found: () => new NotFoundError("approved proposal") },
  );
  if (!APPROVED_PROPOSAL.has(latest.status)) {
    throw new NotFoundError("approved proposal");
  }
  return toProposalDTO(latest);
}
