import "server-only";

/* =============================================================================
 * Post-scan commercial workflow — server-side trigger + bounded drive.
 *
 * When the core 13-stage scan completes, the runtime enqueues the commercial
 * workflow (competitor → …) and drains it here, SERVER-SIDE, in a bounded loop —
 * NOT browser-driven. It leases through the SAME durable queue under the
 * `commercial_intelligence` job type, so idempotency, backoff and dead-letter all
 * apply. Enqueue is idempotent on (jobType, runId, stage), so a re-completion
 * (refresh/replay) never double-runs: a completed commercial job is not re-leased.
 *
 * The commercial stages are pure/deterministic (no model call today), so draining
 * them in-request is safe and fast. If a future stage needs an LLM it flows through
 * the same queue/budget as reasoning, not through this loop.
 * ========================================================================== */

import { COMMERCIAL_STAGE_ORDER, type CommercialCoordinator, type CommercialStageResult } from "@brightloop/domain";

/** A small ceiling above the stage count so one turn per stage always drains. */
export const COMMERCIAL_MAX_TURNS = COMMERCIAL_STAGE_ORDER.length + 3;

export interface CommercialRunTarget {
  runId: string;
  scanId: string;
  clientId: string | null;
  /** Admin-supplied competitor domains, carried on the job payload. */
  manualCompetitorDomains?: string[];
}

export interface CommercialDriveResult {
  turns: number;
  results: CommercialStageResult[];
}

/**
 * Enqueue the commercial workflow for a completed run and drive it to the point
 * where the commercial queue is idle (or the bound is hit). Bounded + idempotent;
 * safe to call on every "completed" poll.
 */
export async function triggerCommercialWorkflow(
  commercial: CommercialCoordinator,
  owner: string,
  target: CommercialRunTarget,
): Promise<CommercialDriveResult> {
  await commercial.enqueueForCompletedRun({
    runId: target.runId,
    scanId: target.scanId,
    clientId: target.clientId,
    ...(target.manualCompetitorDomains ? { manualCompetitorDomains: target.manualCompetitorDomains } : {}),
  });

  const results: CommercialStageResult[] = [];
  let turns = 0;
  for (; turns < COMMERCIAL_MAX_TURNS; turns += 1) {
    const turn = await commercial.runCommercialOnce(owner);
    if (!turn.ok || turn.value === null) break;
    results.push(turn.value);
  }
  return { turns, results };
}
