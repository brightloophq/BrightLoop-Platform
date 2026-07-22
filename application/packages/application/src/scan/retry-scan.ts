/* =============================================================================
 * Use-case: retry a scan's failed stage (Phase C · Sprint C1).
 *
 * Reuses runtime recovery: the coordinator resets the failed stage's job to
 * eligible and re-drives from the last valid checkpoint, so already-completed
 * stages are skipped, never re-run.
 *
 * A terminal run (completed / cancelled / deadline-failed) is not resumable —
 * that surfaces as the specific canonical error, not a generic conflict. When
 * there is no failed stage to retry, the answer is `RetryUnavailable`.
 * ========================================================================== */

import type { AppContext } from "../context.js";
import { SCAN_WRITE_CAP } from "../context.js";
import type { ScanDTO } from "../dto.js";
import { toScanDTO } from "../dto.js";
import { AlreadyCompletedError, CancelledError, RetryUnavailableError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

export async function retryScan(ctx: AppContext, rawRunId: unknown): Promise<ScanDTO> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_WRITE_CAP);

  // Map the terminal cases to their specific meanings BEFORE calling the runtime,
  // so the error names the real reason rather than "conflict".
  if (run.status === "completed") throw new AlreadyCompletedError();
  if (run.status === "cancelled" || run.cancelled) throw new CancelledError();
  if (run.status === "failed") {
    // A deadline-failed run is terminal and cannot resume — a new scan is required.
    throw new RetryUnavailableError("This scan failed terminally and cannot be retried; start a new scan");
  }

  // The runtime requeues the failed stage; `not_found` means nothing to retry.
  unwrap(await ctx.services.coordinator.retryRun(run.id), {
    terminal_state: () => new RetryUnavailableError(),
    not_found: () => new RetryUnavailableError(),
    no_job_available: () => new RetryUnavailableError(),
  });

  // Return the run's fresh status after the requeue.
  const refreshed = unwrap(await ctx.services.runs.getRun(run.id));
  return toScanDTO(refreshed);
}
