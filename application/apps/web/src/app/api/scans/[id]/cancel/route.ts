import { cancelScan } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** POST /api/scans/:id/cancel — cancel a non-terminal scan. */
export function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => cancelScan(ctx, (await params).id));
}
