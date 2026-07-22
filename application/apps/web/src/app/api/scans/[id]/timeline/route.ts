import { getScanTimeline } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** GET /api/scans/:id/timeline — ordered, UI-ready runtime events. */
export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => getScanTimeline(ctx, (await params).id));
}
