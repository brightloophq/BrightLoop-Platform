/* =============================================================================
 * Use-case: a scan's timeline (Phase C · Sprint C1).
 *
 * Returns ordered runtime events, ALREADY transformed for UI rendering — never
 * raw runtime events. The runtime's `eventTimelineView` orders by sequence (not
 * timestamp), and the DTO strips everything but sequence/type/stage/time/detail.
 * ========================================================================== */

import { AGGREGATE, runtimeReadModels } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { SCAN_READ_CAP } from "../context.js";
import type { TimelineEntryDTO } from "../dto.js";
import { toTimelineDTO } from "../dto.js";
import { unwrap } from "../runtime-result.js";
import { loadAuthorizedRun } from "./shared.js";

export async function getScanTimeline(ctx: AppContext, rawRunId: unknown): Promise<TimelineEntryDTO[]> {
  const run = await loadAuthorizedRun(ctx, rawRunId, SCAN_READ_CAP);

  const events = unwrap(
    await ctx.services.events.list({ aggregateType: AGGREGATE.run, aggregateId: run.id }),
  );

  // Transform (sequence-ordered, internals stripped) THEN map to the wire shape.
  return runtimeReadModels.eventTimelineView(events).map(toTimelineDTO);
}
