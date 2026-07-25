/* =============================================================================
 * Use-case: assess a prospect (Phase C · Sprint C6).
 *
 * The controlled application-layer integration that carries a scan from
 * normalized discovery evidence through the deterministic intelligence engines
 * and persists reviewable artifacts:
 *
 *   discovery_manifest → evidence bundle → Prospect Intelligence
 *     → findings + recommendation_candidates + internal_intelligence_report
 *
 * It ORCHESTRATES; it re-implements no scoring. Evidence normalization, the
 * Evidence Engine and the Prospect Intelligence Engine do the work; this use-case
 * loads upstream artifacts, calls them in order, and persists typed outputs
 * through the existing `ArtifactService` (which owns checksums, lineage,
 * idempotency and events). Every artifact is `unvalidated` — human review of the
 * machine-derived assessment is mandatory.
 *
 * Determinism: all engine + evidence ids are derived from stable natural
 * identity, so an identical manifest yields identical envelopes and identical
 * checksums — a re-run REPLAYS rather than duplicates.
 * ========================================================================== */

import { runProspectIntelligence } from "@brightloop/domain";
import type { RuntimeArtifact } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { SCAN_WRITE_CAP } from "../context.js";
import { loadAuthorizedRun } from "../scan/shared.js";
import { normalizeDiscoveryToEvidence } from "./evidence-bridge.js";
import { toFindingsEnvelope, toInternalReportEnvelope, toRecommendationEnvelope } from "./report-adapter.js";

/** The controlled outcome of one assessment turn. */
export type AssessmentStatus = "blocked" | "failed" | "completed_with_gaps" | "completed";

export interface AssessmentArtifactIds {
  evidenceBundle: string | null;
  findings: string | null;
  recommendationCandidates: string | null;
  report: string | null;
}

export interface AssessmentOutcome {
  status: AssessmentStatus;
  runId: string;
  scanId: string;
  /** Which prerequisite is absent, when BLOCKED. */
  blockedReason: string | null;
  /** The failure category, when FAILED. */
  failureCategory: string | null;
  artifactIds: AssessmentArtifactIds;
  /** Lineage: each produced artifact id → the source artifact ids it derives from. */
  lineage: Record<string, string[]>;
  observedEvidence: number;
  unavailableEvidence: number;
  maturityOverall: number | null;
  readinessOverall: number | null;
  /** Always true — the assessment is machine-derived and must be reviewed. */
  reviewRequired: true;
  warnings: string[];
}

function blocked(runId: string, scanId: string, reason: string): AssessmentOutcome {
  return {
    status: "blocked", runId, scanId, blockedReason: reason, failureCategory: null,
    artifactIds: { evidenceBundle: null, findings: null, recommendationCandidates: null, report: null },
    lineage: {}, observedEvidence: 0, unavailableEvidence: 0, maturityOverall: null, readinessOverall: null,
    reviewRequired: true, warnings: [],
  };
}

/**
 * Run the deterministic assessment for a scan.
 *
 * Authorization is enforced against the LOADED run's tenant. A missing discovery
 * manifest is BLOCKED (not failed) — the prerequisite simply is not there yet. A
 * persistence error is FAILED. A run with no observed evidence still produces an
 * honest, empty assessment: COMPLETED_WITH_GAPS, never a fabricated zero.
 */
export async function assessProspect(ctx: AppContext, rawRunId: unknown): Promise<AssessmentOutcome> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_WRITE_CAP);
  const now = ctx.clock();
  const scanId = run.scanId;

  // Deterministic ids: stable across re-runs, so envelopes + checksums are stable.
  const evId = (suffix: string) => `ev:${scanId}:${suffix}`;
  const engId = (prefix: string, index: number) => `${prefix}:${scanId}:${index}`;

  // 1 · prerequisite: a discovery manifest must exist.
  const manifest = await ctx.services.artifacts.latest(run.id, "discovery_manifest");
  if (!manifest.ok) return { ...blocked(run.id, scanId, "discovery_manifest_unreadable"), status: "failed", failureCategory: `artifact_read:${manifest.code}`, blockedReason: null };
  if (manifest.value === null) return blocked(run.id, scanId, "discovery_manifest_missing");

  // 2 · normalize crawled pages into engine evidence (observed signals only).
  const bridge = normalizeDiscoveryToEvidence(manifest.value.envelope, scanId, now, evId);

  const warnings: string[] = [];
  if (bridge.observedCount === 0) warnings.push("No page was successfully fetched; the assessment is reported with gaps rather than scored zero.");
  if (bridge.unavailableCount > 0) warnings.push(`${bridge.unavailableCount} page(s) were unavailable and contribute no signal.`);

  // 3 · persist the evidence bundle (lineage → manifest).
  const bundle = await ctx.services.artifacts.persist({
    runId: run.id, clientId: run.clientId, scanId, kind: "evidence_bundle",
    envelope: { scanId, items: bridge.items },
    sourceArtifactIds: [manifest.value.id],
    validationStatus: "valid", // deterministic, mechanically validated evidence
  });
  if (!bundle.ok) return { ...blocked(run.id, scanId, ""), status: "failed", failureCategory: `persist_evidence_bundle:${bundle.code}`, blockedReason: null, warnings };

  // 4 · run the Prospect Intelligence Engine (pure, deterministic, no provider).
  const assessment = runProspectIntelligence({ scanId, evidence: bridge.items, sourceArtifactIds: [bundle.value.id], idFor: engId, now });

  // 5 · persist the derived artifacts (lineage → evidence bundle). Unvalidated:
  // the assessment is machine-derived and awaits human review.
  const derived: Array<{ key: keyof AssessmentArtifactIds; kind: "findings" | "recommendation_candidates" | "internal_intelligence_report"; envelope: Record<string, unknown> }> = [
    { key: "findings", kind: "findings", envelope: toFindingsEnvelope(assessment) },
    { key: "recommendationCandidates", kind: "recommendation_candidates", envelope: toRecommendationEnvelope(assessment) },
    { key: "report", kind: "internal_intelligence_report", envelope: toInternalReportEnvelope(assessment) },
  ];

  const artifactIds: AssessmentArtifactIds = { evidenceBundle: bundle.value.id, findings: null, recommendationCandidates: null, report: null };
  const lineage: Record<string, string[]> = { [bundle.value.id]: [manifest.value.id] };

  for (const d of derived) {
    const persisted = await persistDerived(ctx, run, scanId, d.kind, d.envelope, bundle.value.id);
    if (!persisted.ok) {
      return { ...blocked(run.id, scanId, ""), status: "failed", failureCategory: `persist_${d.kind}:${persisted.code}`, blockedReason: null, artifactIds, lineage, warnings };
    }
    artifactIds[d.key] = persisted.value.id;
    lineage[persisted.value.id] = [bundle.value.id];
  }

  const hasGaps = bridge.observedCount === 0 || assessment.maturity.overall === null;

  return {
    status: hasGaps ? "completed_with_gaps" : "completed",
    runId: run.id,
    scanId,
    blockedReason: null,
    failureCategory: null,
    artifactIds,
    lineage,
    observedEvidence: bridge.observedCount,
    unavailableEvidence: bridge.unavailableCount,
    maturityOverall: assessment.maturity.overall,
    readinessOverall: assessment.readiness.overall,
    reviewRequired: true,
    warnings: [...warnings, ...assessment.limitations].filter((v, i, a) => a.indexOf(v) === i).slice(0, 20),
  };
}

async function persistDerived(
  ctx: AppContext,
  run: { id: string; clientId: string | null },
  scanId: string,
  kind: "findings" | "recommendation_candidates" | "internal_intelligence_report",
  envelope: Record<string, unknown>,
  bundleId: string,
): ReturnType<AppContext["services"]["artifacts"]["persist"]> {
  return ctx.services.artifacts.persist({
    runId: run.id, clientId: run.clientId, scanId, kind, envelope,
    sourceArtifactIds: [bundleId],
    validationStatus: "unvalidated", // machine-derived; review required
  });
}

/** Read the persisted assessment report for a run, if one exists (any version). */
export async function latestAssessmentReport(ctx: AppContext, run: { id: string }): Promise<RuntimeArtifact | null> {
  const latest = await ctx.services.artifacts.latest(run.id, "internal_intelligence_report");
  return latest.ok ? latest.value : null;
}
