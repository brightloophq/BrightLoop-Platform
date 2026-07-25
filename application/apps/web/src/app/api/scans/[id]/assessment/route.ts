import { getScanAssessment } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/**
 * GET /api/scans/:id/assessment — the machine-derived prospect assessment
 * (Phase C · Sprint C6).
 *
 * Internal read, capability-gated. Returns the report / findings / recommendation
 * / evidence-bundle artifacts with their validation status and the mandatory
 * review flag. `present:false` means no assessment has been run yet.
 */
export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => getScanAssessment(ctx, (await params).id));
}
