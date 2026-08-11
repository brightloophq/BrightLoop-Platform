/* =============================================================================
 * Post-scan commercial workflow — durable kickoff + bounded, resumable drive.
 *
 * KICKOFF is separated from DRAINING (the live-preview defect was a single-shot
 * synchronous trigger inside the final core request):
 *
 *   • ensureCommercialWorkflowStarted — idempotent, server-authoritative. Enqueues
 *     the first commercial job iff not already present. Safe to call from ANY entry
 *     point (core completion, a completed-scan refresh, the continuation endpoint).
 *     A failure is surfaced by the coordinator (commercial.enqueue_failed), never
 *     swallowed. It NEVER drives stages — it returns fast.
 *
 *   • driveCommercialUntilWait — a bounded, time-boxed drive of the SAME durable
 *     queue (lease → stage → settle → enqueue-next), stopping well before the
 *     serverless limit. Resumable: each turn is one queue turn, so a refresh simply
 *     continues from the next queued job. It starts nothing the queue would not.
 *
 * The browser never enqueues; it only asks the server to take bounded turns.
 * ========================================================================== */

import { COMMERCIAL_STAGE_ORDER, type CommercialCoordinator, type CommercialStageResult, type RuntimeResult } from "@brightloop/domain";
import type { RuntimeQueueJob } from "@brightloop/schema";

/** A small ceiling above the stage count so one poll can drain the whole workflow. */
export const COMMERCIAL_MAX_TURNS = COMMERCIAL_STAGE_ORDER.length + 3;
/** Time box per continuation request — comfortably under the serverless limit. */
export const COMMERCIAL_MAX_MS = 6_000;

export interface CommercialRunTarget {
  runId: string;
  scanId: string;
  clientId: string | null;
  /** Admin-supplied competitor domains, carried on the job payload. */
  manualCompetitorDomains?: string[];
}

/**
 * Idempotent, durable kickoff. Returns the enqueue result so callers can tell
 * `created` (freshly started) from `replayed` (already started/advanced) from a
 * failure (`ok === false`). Does NOT drive stages.
 */
export async function ensureCommercialWorkflowStarted(
  commercial: CommercialCoordinator,
  target: CommercialRunTarget,
): Promise<RuntimeResult<RuntimeQueueJob>> {
  return commercial.ensureStarted({
    runId: target.runId,
    scanId: target.scanId,
    clientId: target.clientId,
    ...(target.manualCompetitorDomains ? { manualCompetitorDomains: target.manualCompetitorDomains } : {}),
  });
}

export interface CommercialDriveResult {
  turns: number;
  results: CommercialStageResult[];
  /** True when the last lease found nothing — the queue is idle right now. */
  idle: boolean;
}

/**
 * Drive the commercial queue in bounded turns until it is idle or the turn/time
 * bound is spent. Pure of any enqueue — call {@link ensureCommercialWorkflowStarted}
 * first. `now` is injected for deterministic tests.
 */
export async function driveCommercialUntilWait(
  commercial: CommercialCoordinator,
  owner: string,
  opts: { maxTurns?: number; maxMillis?: number; now?: () => number } = {},
): Promise<CommercialDriveResult> {
  const maxTurns = opts.maxTurns ?? COMMERCIAL_MAX_TURNS;
  const maxMillis = opts.maxMillis ?? COMMERCIAL_MAX_MS;
  const now = opts.now ?? (() => Date.now());
  const start = now();

  const results: CommercialStageResult[] = [];
  let turns = 0;
  let idle = false;
  for (; turns < maxTurns && now() - start < maxMillis; turns += 1) {
    const turn = await commercial.runCommercialOnce(owner);
    if (!turn.ok) break; // a stage failed — stop; the queue owns retry/dead-letter
    if (turn.value === null) {
      idle = true; // nothing leaseable right now
      break;
    }
    results.push(turn.value);
  }
  return { turns, results, idle };
}
