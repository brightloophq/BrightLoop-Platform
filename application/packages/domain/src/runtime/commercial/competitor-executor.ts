/* =============================================================================
 * Commercial workflow — COMPETITOR stage executor.
 *
 * Reads the persisted `discovery_manifest` + `evidence_bundle`, runs the pure,
 * evidence-only Competitor Discovery producer, and persists the resulting
 * `competitor_snapshot` as an idempotent REVISION of the C8 snapshot the core
 * scan already produced. Never fetches, never searches, never calls a model.
 *
 * Idempotency: the snapshot is content-addressed (its own checksum). If the
 * latest snapshot already carries that checksum the stage is a no-op replay — a
 * refresh or a retry never produces a duplicate artifact.
 * ========================================================================== */

import { evidenceBundleSchema, type RuntimeQueueJob } from "@brightloop/schema";
import { runCompetitorDiscovery } from "../../scan-engine/competitor-discovery/index.js";
import { normalizeDomain } from "../../scan-engine/competitor-intelligence/candidate.js";
import { err, type RuntimeResult } from "../results.js";
import { RUNTIME_EVENTS } from "../services/support.js";
import type { CommercialStageStatus } from "./stages.js";
import type { CommercialStageDeps, CommercialStageResult } from "./types.js";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Derive the prospect's own domain from the persisted discovery manifest. Pure. */
function prospectDomainFrom(manifestEnvelope: Record<string, unknown>): string {
  const pages = Array.isArray(manifestEnvelope["pages"]) ? (manifestEnvelope["pages"] as Array<Record<string, unknown>>) : [];
  const ok = pages.filter((p) => str(p["outcome"]) === "ok");
  const home = ok.find((p) => str(p["kind"]) === "homepage") ?? ok[0] ?? pages[0];
  const url = home ? str(home["finalUrl"]) || str(home["requestedUrl"]) : "";
  return url === "" ? "" : normalizeDomain(url);
}

function manualDomainsFrom(job: RuntimeQueueJob): string[] {
  const raw = job.payload?.["manualCompetitorDomains"];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/**
 * Run the competitor stage for one commercial job. Loads the required artifacts,
 * runs the producer, and persists an idempotent competitor_snapshot revision.
 * Returns `blocked`-style errors as `RuntimeResult` failures so the coordinator
 * can retry via the queue (a missing prerequisite is recoverable, not fatal).
 */
export async function runCompetitorCommercialStage(deps: CommercialStageDeps, job: RuntimeQueueJob): Promise<RuntimeResult<CommercialStageResult>> {
  const { artifacts, events, ctx } = deps;
  const runId = job.runId;
  const scanId = job.scanId;
  if (runId === null || scanId === null) return err("check_violation", `commercial job ${job.id} has no runId/scanId`);

  const manifest = await artifacts.latest(runId, "discovery_manifest");
  if (!manifest.ok) return manifest;
  if (manifest.value === null) return err("not_found", "discovery_manifest missing — cannot discover competitors");

  const bundleArtifact = await artifacts.latest(runId, "evidence_bundle");
  if (!bundleArtifact.ok) return bundleArtifact;
  if (bundleArtifact.value === null) return err("not_found", "evidence_bundle missing — cannot discover competitors");

  const priorSnap = await artifacts.latest(runId, "competitor_snapshot");
  if (!priorSnap.ok) return priorSnap;

  const bundle = evidenceBundleSchema.parse(bundleArtifact.value.envelope);
  const prospectDomain = prospectDomainFrom(manifest.value.envelope);

  const result = runCompetitorDiscovery({
    scanId,
    clientId: job.clientId,
    prospectDomain,
    manifestEnvelope: manifest.value.envelope,
    evidenceBundle: bundle.items,
    manualCompetitorDomains: manualDomainsFrom(job),
    excludedDomains: [],
    sourceArtifactIds: [bundleArtifact.value.id, manifest.value.id],
    now: ctx.clock(),
    idFor: (prefix) => `${prefix}:${scanId}`,
  });

  const envelope = result.snapshot as unknown as Record<string, unknown>;
  const prior = priorSnap.value;
  const resultAvailable = result.snapshot.status === "available";
  const priorAvailable = prior !== null && String((prior.envelope as Record<string, unknown>)["status"]) === "available";

  let persisted: CommercialStageResult["persisted"];
  if (prior !== null && prior.checksum === result.snapshot.checksum) {
    // Identical content already persisted — refresh/retry-safe no-op.
    persisted = "replayed";
  } else if (!resultAvailable && !priorAvailable) {
    // Discovery verified nothing new; the existing unavailable snapshot already
    // says so. Record the outcome via the event only — no meaningless version
    // churn. ("commercial ran" is signalled by the event + the completed job.)
    persisted = "replayed";
  } else {
    const version = prior === null ? 1 : prior.version + 1;
    const lineage = prior === null
      ? [bundleArtifact.value.id, manifest.value.id]
      : [...prior.sourceArtifactIds, prior.id, bundleArtifact.value.id, manifest.value.id];
    const write = await artifacts.persist({
      runId,
      clientId: job.clientId,
      scanId,
      kind: "competitor_snapshot",
      envelope,
      version,
      sourceArtifactIds: [...new Set(lineage)],
      checksum: result.snapshot.checksum,
    });
    if (!write.ok) return write;
    persisted = prior === null ? "created" : "revised";
  }

  const status: CommercialStageStatus = result.snapshot.status === "available" ? "ready" : "insufficient_evidence";
  await events.emit({
    eventType: RUNTIME_EVENTS.commercialCompetitorDiscovered,
    aggregateType: "intelligence_run",
    aggregateId: runId,
    clientId: job.clientId,
    runId,
    scanId,
    stage: job.stage,
    payload: { status, persisted, ...result.counts },
  });

  return { ok: true, code: "found", value: { stage: "competitor_intelligence", status, persisted, counts: result.counts } };
}
