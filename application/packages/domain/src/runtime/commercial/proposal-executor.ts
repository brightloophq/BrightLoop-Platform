/* =============================================================================
 * Commercial workflow — PROPOSAL stage executor.
 *
 * Loads the verified `internal_intelligence_report`, the C9 `proposal` snapshot
 * and (optionally) the C8 `competitor_snapshot`, composes a client-ready proposal
 * DRAFT via the pure assembler, and persists it as an idempotent version in
 * `proposal_versions`. Never calls a model; never invents pricing.
 *
 * Idempotency: the draft is content-addressed. If the latest version already
 * carries that checksum the stage is a no-op replay — refresh/retry never writes a
 * duplicate. A genuinely new draft is a superseding version (n+1), never a rewrite.
 * ========================================================================== */

import type { RuntimeQueueJob } from "@brightloop/schema";
import { assembleCommercialProposal } from "../../scan-engine/commercial-proposal/index.js";
import { err, type RuntimeResult } from "../results.js";
import { RUNTIME_EVENTS } from "../services/support.js";
import type { CommercialStageDeps, CommercialStageResult } from "./types.js";

export async function runProposalCommercialStage(deps: CommercialStageDeps, job: RuntimeQueueJob): Promise<RuntimeResult<CommercialStageResult>> {
  const { artifacts, proposals, events, ctx } = deps;
  const runId = job.runId;
  const scanId = job.scanId;
  if (runId === null || scanId === null) return err("check_violation", `commercial job ${job.id} has no runId/scanId`);

  const reportArt = await artifacts.latest(runId, "internal_intelligence_report");
  if (!reportArt.ok) return reportArt;
  if (reportArt.value === null) return err("not_found", "internal_intelligence_report missing — cannot draft a proposal");

  const snapArt = await artifacts.latest(runId, "proposal");
  if (!snapArt.ok) return snapArt;
  if (snapArt.value === null) return err("not_found", "proposal intelligence snapshot missing — cannot draft a proposal");

  const competitorArt = await artifacts.latest(runId, "competitor_snapshot");
  if (!competitorArt.ok) return competitorArt;

  const sourceArtifacts = [reportArt.value.id, snapArt.value.id, ...(competitorArt.value ? [competitorArt.value.id] : [])];
  const { proposal } = assembleCommercialProposal({
    scanId,
    clientId: job.clientId,
    proposalSnapshot: snapArt.value.envelope,
    reportEnvelope: reportArt.value.envelope,
    competitorSnapshot: competitorArt.value ? competitorArt.value.envelope : null,
    sourceArtifacts,
    now: ctx.clock(),
    id: ctx.ids("cprop"),
  });

  const draftReady = proposal.status === "draft_ready";
  const reviewStatus = draftReady ? "needs_review" : "insufficient_evidence";

  // Idempotent persist to proposal_versions (content-addressed checksum).
  const prior = await proposals.latest(runId);
  if (!prior.ok && prior.code !== "not_found") return prior;
  const priorRow = prior.ok ? prior.value : null;

  let persisted: CommercialStageResult["persisted"];
  if (priorRow !== null && priorRow.checksum === proposal.checksum) {
    persisted = "replayed";
  } else {
    const version = priorRow === null ? 1 : priorRow.version + 1;
    const write = await proposals.save({
      runId,
      clientId: job.clientId,
      scanId,
      envelope: proposal as unknown as Record<string, unknown>,
      checksum: proposal.checksum,
      sourceArtifactIds: sourceArtifacts,
      version,
      status: reviewStatus,
      supersedesId: priorRow?.id ?? null,
    });
    if (!write.ok) return write;
    persisted = priorRow === null ? "created" : "revised";
  }

  const needsPricing = proposal.commercialState === "needs_pricing";
  const status: CommercialStageResult["status"] = draftReady ? "ready" : "insufficient_evidence";

  await events.emit({
    eventType: RUNTIME_EVENTS.commercialProposalGenerated,
    aggregateType: "intelligence_run",
    aggregateId: runId,
    clientId: job.clientId,
    runId,
    scanId,
    stage: job.stage,
    payload: { status, persisted, needsPricing, commercialState: proposal.commercialState, workItems: proposal.recommendedWork.length },
  });

  return {
    ok: true,
    code: "found",
    value: {
      stage: "proposal_generation",
      status,
      persisted,
      counts: { recommendedWork: proposal.recommendedWork.length, keyIssues: proposal.keyIssues.length, opportunities: proposal.opportunities.length },
      detail: { needsPricing, commercialState: proposal.commercialState, reviewStatus },
    },
  };
}
