/* =============================================================================
 * Use-case: read a prospect's assessment (Phase C · Sprint C6).
 *
 * Returns the machine-derived assessment artifacts for a scan as a safe DTO,
 * regardless of validation status, WITH the review flag surfaced — so the
 * operator sees the assessment marked "review required" rather than it being
 * hidden behind the C1 "approved report" gate (which only exposes a `valid`
 * report). This never auto-approves: `reviewRequired` stays true.
 * ========================================================================== */

import type { RuntimeArtifactKind } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import { loadAuthorizedRun } from "../scan/shared.js";

export interface AssessmentArtifactDTO {
  id: string;
  kind: string;
  version: number;
  validationStatus: string;
  createdAt: string;
  sourceArtifactIds: string[];
  content: Record<string, unknown>;
}

export interface AssessmentDTO {
  runId: string;
  scanId: string;
  present: boolean;
  /** Always true when a report exists — the assessment is machine-derived. */
  reviewRequired: boolean;
  report: AssessmentArtifactDTO | null;
  findings: AssessmentArtifactDTO | null;
  recommendationCandidates: AssessmentArtifactDTO | null;
  evidenceBundle: AssessmentArtifactDTO | null;
}

async function latest(ctx: AppContext, runId: string, kind: RuntimeArtifactKind): Promise<AssessmentArtifactDTO | null> {
  const result = await ctx.services.artifacts.latest(runId, kind);
  if (!result.ok || result.value === null) return null;
  const a = result.value;
  return { id: a.id, kind: a.kind, version: a.version, validationStatus: a.validationStatus, createdAt: a.createdAt, sourceArtifactIds: a.sourceArtifactIds, content: a.envelope };
}

/** The full assessment for a scan, or a `present:false` shell when none exists. */
export async function getScanAssessment(ctx: AppContext, rawRunId: unknown): Promise<AssessmentDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);

  const [report, findings, recommendationCandidates, evidenceBundle] = await Promise.all([
    latest(ctx, run.id, "internal_intelligence_report"),
    latest(ctx, run.id, "findings"),
    latest(ctx, run.id, "recommendation_candidates"),
    latest(ctx, run.id, "evidence_bundle"),
  ]);

  return {
    runId: run.id,
    scanId: run.scanId,
    present: report !== null,
    reviewRequired: report !== null,
    report,
    findings,
    recommendationCandidates,
    evidenceBundle,
  };
}
