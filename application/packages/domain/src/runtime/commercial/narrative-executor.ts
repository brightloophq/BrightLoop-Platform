/* =============================================================================
 * Commercial workflow — NARRATIVE stage executor.
 *
 * Loads the verified `internal_intelligence_report`, the latest commercial
 * proposal draft and (optionally) the C8 `competitor_snapshot`, composes a
 * client-facing narrative via the pure PRESENTATION assembler, and persists it as
 * an idempotent version in `narrative_versions` under audience `client`. Never
 * calls a model; introduces no new factual claim (every section traces to its
 * source artifacts).
 *
 * Idempotency: content-addressed. If the latest client narrative already carries
 * that checksum the stage is a no-op replay; otherwise a superseding version.
 * ========================================================================== */

import type { RuntimeQueueJob } from "@brightloop/schema";
import { assembleClientNarrative } from "../../scan-engine/client-narrative/index.js";
import { err, type RuntimeResult } from "../results.js";
import { RUNTIME_EVENTS } from "../services/support.js";
import type { CommercialStageDeps, CommercialStageResult } from "./types.js";

const CLIENT_AUDIENCE = "client";

export async function runNarrativeCommercialStage(deps: CommercialStageDeps, job: RuntimeQueueJob): Promise<RuntimeResult<CommercialStageResult>> {
  const { artifacts, proposals, narratives, events, ctx } = deps;
  const runId = job.runId;
  const scanId = job.scanId;
  if (runId === null || scanId === null) return err("check_violation", `commercial job ${job.id} has no runId/scanId`);

  const reportArt = await artifacts.latest(runId, "internal_intelligence_report");
  if (!reportArt.ok) return reportArt;
  if (reportArt.value === null) return err("not_found", "internal_intelligence_report missing — cannot compose a narrative");

  const competitorArt = await artifacts.latest(runId, "competitor_snapshot");
  if (!competitorArt.ok) return competitorArt;

  // The proposal draft is an input (recommendation section) — optional but expected
  // since the proposal stage runs before this one.
  const proposalVer = await proposals.latest(runId);
  if (!proposalVer.ok && proposalVer.code !== "not_found") return proposalVer;
  const proposalRow = proposalVer.ok ? proposalVer.value : null;

  const sourceArtifacts = [reportArt.value.id, ...(proposalRow ? [proposalRow.id] : []), ...(competitorArt.value ? [competitorArt.value.id] : [])];
  const { narrative } = assembleClientNarrative({
    scanId,
    clientId: job.clientId,
    reportEnvelope: reportArt.value.envelope,
    proposal: proposalRow ? proposalRow.envelope : null,
    competitorSnapshot: competitorArt.value ? competitorArt.value.envelope : null,
    reportArtifactId: reportArt.value.id,
    proposalArtifactId: proposalRow ? proposalRow.id : null,
    competitorArtifactId: competitorArt.value ? competitorArt.value.id : null,
    sourceArtifacts,
    now: ctx.clock(),
    id: ctx.ids("cnarr"),
  });

  const ready = narrative.status === "ready";
  const reviewStatus = ready ? "needs_review" : "insufficient_evidence";

  const prior = await narratives.latest(runId, CLIENT_AUDIENCE);
  if (!prior.ok && prior.code !== "not_found") return prior;
  const priorRow = prior.ok ? prior.value : null;

  let persisted: CommercialStageResult["persisted"];
  if (priorRow !== null && priorRow.checksum === narrative.checksum) {
    persisted = "replayed";
  } else {
    const version = priorRow === null ? 1 : priorRow.version + 1;
    const write = await narratives.save({
      runId,
      clientId: job.clientId,
      scanId,
      envelope: narrative as unknown as Record<string, unknown>,
      checksum: narrative.checksum,
      sourceArtifactIds: sourceArtifacts,
      version,
      audience: CLIENT_AUDIENCE,
      status: reviewStatus,
      supersedesId: priorRow?.id ?? null,
    });
    if (!write.ok) return write;
    persisted = priorRow === null ? "created" : "revised";
  }

  const status: CommercialStageResult["status"] = ready ? "ready" : "insufficient_evidence";
  await events.emit({
    eventType: RUNTIME_EVENTS.commercialNarrativeGenerated,
    aggregateType: "intelligence_run",
    aggregateId: runId,
    clientId: job.clientId,
    runId,
    scanId,
    stage: job.stage,
    payload: { status, persisted, reviewStatus, sections: narrative.sections.length },
  });

  return {
    ok: true,
    code: "found",
    value: { stage: "narrative_generation", status, persisted, counts: { sections: narrative.sections.length }, detail: { reviewStatus } },
  };
}
