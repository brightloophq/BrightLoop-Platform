/* =============================================================================
 * Use-case: list scans (Phase C · Sprint C1).
 *
 * Lists the caller's scans as DTOs, newest first. A client-scoped actor is
 * always narrowed to its own tenant regardless of any requested filter, so one
 * tenant can never enumerate another's runs even by asking. Internal actors may
 * filter by client; RLS remains the final boundary.
 * ========================================================================== */

import type { RuntimeRunStatus } from "@brightloop/schema";
import { isClientRole } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { authorize, SCAN_READ_CAP } from "../context.js";
import type { ScanDTO } from "../dto.js";
import { toScanDTO } from "../dto.js";
import { ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";

const RUNTIME_STATUSES = new Set<string>([
  "pending", "discovering", "ingesting_evidence", "assembling_graph", "planning_reasoning",
  "executing_reasoning", "validating_results", "synthesizing_findings", "building_recommendations",
  "preparing_report", "completed", "failed", "cancelled", "blocked",
]);

export interface ListScansQuery {
  clientId?: string | null;
  statuses?: readonly string[];
  limit?: number;
}

const MAX_LIMIT = 100;

export async function listScans(ctx: AppContext, query: ListScansQuery = {}): Promise<ScanDTO[]> {
  // A client actor is pinned to its own tenant; an internal actor uses the
  // requested filter (or all). Authorize against the effective tenant.
  const targetClientId = isClientRole(ctx.actor.role) ? ctx.actor.clientId : (query.clientId ?? null);
  authorize(ctx.actor, SCAN_READ_CAP, targetClientId);

  const statuses = parseStatuses(query.statuses);
  const limit = parseLimit(query.limit);

  const runs = unwrap(await ctx.services.runs.list({ clientId: targetClientId, statuses, limit }));
  return runs.map(toScanDTO);
}

function parseStatuses(statuses: readonly string[] | undefined): RuntimeRunStatus[] | undefined {
  if (statuses === undefined) return undefined;
  for (const s of statuses) {
    if (!RUNTIME_STATUSES.has(s)) throw new ValidationError(`unknown status '${s}'`, { statuses: "invalid_value" });
  }
  return statuses as RuntimeRunStatus[];
}

function parseLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`'limit' must be an integer between 1 and ${MAX_LIMIT}`, { limit: "out_of_range" });
  }
  return limit;
}
