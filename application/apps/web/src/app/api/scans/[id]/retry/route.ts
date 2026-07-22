import { retryScan } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** POST /api/scans/:id/retry — retry a failed stage, reusing runtime recovery. */
export function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => retryScan(ctx, (await params).id));
}
