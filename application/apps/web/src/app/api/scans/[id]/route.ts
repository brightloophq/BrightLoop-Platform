import { getScan } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** GET /api/scans/:id — one scan's status. */
export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => getScan(ctx, (await params).id));
}
