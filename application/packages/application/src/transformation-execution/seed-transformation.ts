/* =============================================================================
 * seedTransformation use-case (Phase D · Sprint D1).
 *
 * The Phase C → D bridge as an application command: read a certified scan's
 * `proposal` (+ report) artifacts, run the PURE seeding projection, and persist
 * the workspace + initiatives + seed activities — idempotently. Re-seeding the
 * same proposal returns the existing workspace (matched by `seedChecksum`); it
 * never duplicates. Phase C artifacts are read-only and never mutated.
 * ========================================================================== */

import { proposalIntelligenceSnapshotSchema, type ProposalIntelligenceSnapshot } from "@brightloop/schema";
import { seedTransformationWorkspace } from "@brightloop/domain";
import { authorize, requireExecution, TRANSFORMATION_WRITE_CAP, type AppContext } from "../context.js";
import { ConflictError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toWorkspaceDetailDTO, type WorkspaceDetailDTO } from "./dto.js";

/**
 * Seed (or return the existing) Transformation Workspace for a certified scan.
 * Authorizes `transformation.write` against the scan's tenant, then bridges.
 */
export async function seedTransformation(ctx: AppContext, rawScanRunId: unknown): Promise<WorkspaceDetailDTO> {
  const scanRunId = requireId(rawScanRunId, "scanRunId");
  const run = unwrap(await ctx.services.runs.getRun(scanRunId));
  authorize(ctx.actor, TRANSFORMATION_WRITE_CAP, run.clientId);
  const exec = requireExecution(ctx);

  // Read the certified proposal (required) + report (optional). Read-only.
  const proposalArtifact = unwrap(await ctx.services.artifacts.latest(scanRunId, "proposal"));
  if (proposalArtifact === null) {
    throw new ConflictError("This scan has no proposal artifact to seed from");
  }
  const reportArtifact = unwrap(await ctx.services.artifacts.latest(scanRunId, "internal_intelligence_report"));
  const proposal: ProposalIntelligenceSnapshot = proposalIntelligenceSnapshotSchema.parse(proposalArtifact.envelope);

  // Pure, content-addressed projection. Generated ids are discarded on replay.
  const seed = seedTransformationWorkspace({
    scanRunId,
    clientId: run.clientId,
    proposal,
    proposalArtifactId: proposalArtifact.id,
    reportArtifactId: reportArtifact?.id ?? null,
    now: ctx.clock(),
    idFor: (prefix) => ctx.ids(prefix),
  });

  // Idempotency: an existing workspace for this exact seed short-circuits.
  const existing = unwrap(await exec.workspaces.getBySeed(scanRunId, seed.seedChecksum));
  if (existing !== null) {
    const initiatives = unwrap(await exec.initiatives.listByWorkspace(existing.id));
    const activities = unwrap(await exec.activities.listByWorkspace(existing.id));
    return toWorkspaceDetailDTO(existing, initiatives, activities);
  }

  // First seed: persist the workspace, initiatives, and append-only activities.
  const created = await exec.workspaces.create(seed.workspace);
  if (!created.ok) {
    // Lost a race to another seeder of the same proposal — return the winner.
    if (created.code === "unique_violation" || created.code === "conflict") {
      const winner = unwrap(await exec.workspaces.getBySeed(scanRunId, seed.seedChecksum));
      if (winner !== null) {
        const initiatives = unwrap(await exec.initiatives.listByWorkspace(winner.id));
        const activities = unwrap(await exec.activities.listByWorkspace(winner.id));
        return toWorkspaceDetailDTO(winner, initiatives, activities);
      }
    }
    unwrap(created); // surface any other failure as a canonical application error
  }

  const initiatives = unwrap(await exec.initiatives.createMany(seed.initiatives));
  for (const activity of seed.activities) {
    unwrap(await exec.activities.append(activity));
  }
  return toWorkspaceDetailDTO(seed.workspace, initiatives, seed.activities);
}
