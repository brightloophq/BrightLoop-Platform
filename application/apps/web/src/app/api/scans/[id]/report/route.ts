import { getScanReport } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** GET /api/scans/:id/report — the latest approved intelligence report (JSON). */
export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => getScanReport(ctx, (await params).id));
}
