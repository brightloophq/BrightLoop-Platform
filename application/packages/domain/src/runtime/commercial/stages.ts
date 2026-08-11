/* =============================================================================
 * Post-scan commercial workflow — STAGE MODEL (PURE).
 *
 * The commercial pipeline is a SEPARATE scheduler that runs AFTER the core
 * 13-stage scan completes. It never reorders or re-enters the core pipeline; it
 * runs on the same durable queue primitives under its own job type, so all the
 * runtime guarantees (idempotent enqueue, backoff, dead-letter, lease) apply
 * unchanged.
 *
 * Stages are a plain ordered list, deliberately NOT a persisted enum: the queue's
 * `stage` column is free text and keys idempotency on (jobType, runId, stage), so
 * adding a stage needs no migration. Only `competitor_intelligence` is
 * implemented today; proposal / narrative / review append here as they land.
 * ========================================================================== */

/** The queue job type the whole commercial workflow runs under. */
export const COMMERCIAL_JOB_TYPE = "commercial_intelligence";

/**
 * The ordered commercial stages, run one per queue turn AFTER the core scan.
 * Order matters: competitor evidence and the proposal both feed the narrative.
 * The human REVIEW gate is deliberately NOT a stage — it is a human decision the
 * workflow terminates in front of (see the review route + package readiness), so
 * nothing is auto-approved or sent.
 */
export const COMMERCIAL_STAGE_ORDER = ["competitor_intelligence", "proposal_generation", "narrative_generation"] as const;
export type CommercialStage = (typeof COMMERCIAL_STAGE_ORDER)[number];

export function isCommercialStage(stage: string): stage is CommercialStage {
  return (COMMERCIAL_STAGE_ORDER as readonly string[]).includes(stage);
}

/** The stage after `stage`, or null when the commercial workflow is exhausted. */
export function nextCommercialStage(stage: CommercialStage): CommercialStage | null {
  const i = COMMERCIAL_STAGE_ORDER.indexOf(stage);
  return i >= 0 && i + 1 < COMMERCIAL_STAGE_ORDER.length ? COMMERCIAL_STAGE_ORDER[i + 1]! : null;
}

/** The commercial status vocabulary surfaced to the caller/UI (superset-safe). */
export type CommercialStageStatus = "ready" | "insufficient_evidence" | "failed";
