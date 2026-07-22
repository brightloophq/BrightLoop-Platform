import { getScanNarrative } from "@brightloop/application";
import { handle } from "@/lib/runtime-api";

/** GET /api/scans/:id/narrative?audience=… — the audience-specific approved narrative. */
export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const audience = new URL(req.url).searchParams.get("audience");
  return handle(async (ctx) => getScanNarrative(ctx, (await params).id, audience));
}
