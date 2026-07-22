import { createScan, listScans, parseCreateScanRequest, type ListScansQuery } from "@brightloop/application";
import { handle, readJson } from "@/lib/runtime-api";

/** GET /api/scans — list the caller's scans (newest first). */
export function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const statuses = url.searchParams.getAll("status");
  const limitRaw = url.searchParams.get("limit");
  const query: ListScansQuery = {
    ...(clientId !== null ? { clientId } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(limitRaw !== null ? { limit: Number(limitRaw) } : {}),
  };
  return handle((ctx) => listScans(ctx, query));
}

/** POST /api/scans — create a scan (initialize a run + enqueue the first stage). */
export function POST(req: Request) {
  return handle(async (ctx) => createScan(ctx, parseCreateScanRequest(await readJson(req))), { status: 201 });
}
