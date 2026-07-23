import { getScanArtifact } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/**
 * GET /api/scans/:id/artifacts/:kind — the latest structured artifact of an
 * allowlisted kind (Phase C · Sprint C4).
 *
 * Internal read for the Prospect Scanner. `null` (200) means the pipeline has
 * not produced that artifact yet — a legitimate empty state, not an error. An
 * unsupported kind is a 422; another tenant's run is a 404.
 */
export function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  return handle(async (ctx) => {
    const { id, kind } = await params;
    return getScanArtifact(ctx, id, kind);
  });
}
