import { getScanProposal } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** GET /api/scans/:id/proposal — the latest approved proposal artifact (JSON). */
export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => getScanProposal(ctx, (await params).id));
}
