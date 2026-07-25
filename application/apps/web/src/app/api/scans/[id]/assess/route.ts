import { assessProspect } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/**
 * POST /api/scans/:id/assess — run the deterministic prospect assessment
 * (Phase C · Sprint C6).
 *
 * Internal, capability-gated (via `handle` → application authorization on the
 * loaded run). Carries the scan from its discovery manifest through evidence
 * normalization and the Prospect Intelligence Engine, persisting reviewable
 * artifacts. No provider call, no network beyond the runtime. Returns the
 * structured outcome (blocked / failed / completed_with_gaps / completed).
 */
export function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => assessProspect(ctx, (await params).id));
}
