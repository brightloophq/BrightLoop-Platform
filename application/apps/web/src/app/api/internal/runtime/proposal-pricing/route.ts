import "server-only";

import { NextResponse } from "next/server";
import { hasCapability, isClientRole } from "@brightloop/schema";
import { setProposalPricing, isApplicationError } from "@brightloop/application";
import { getActor } from "@/lib/auth";
import { buildAppContext } from "@/lib/runtime-api";

/**
 * POST /api/internal/runtime/proposal-pricing — persist admin pricing for the
 * latest commercial proposal draft.
 *
 * ██ INTERNAL ONLY ██ — an authenticated internal actor holding the scan-write
 * capability (owner/admin/team_member). Client roles are denied here and by RLS.
 * The server validates the lines against real work items, computes the totals, and
 * supersedes the proposal version — pricing NEVER approves. The response is the
 * updated proposal DTO. Nothing is sent, published, or shared with the prospect.
 */

const PRICING_CAPABILITY = "transformation.scan.write";

function parseRunId(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const runId = (value as Record<string, unknown>)["runId"];
  return typeof runId === "string" && runId !== "" ? runId : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (actor === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  if (isClientRole(actor.role) || !hasCapability(actor.role, PRICING_CAPABILITY)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Insufficient capability to price a proposal" } }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const runId = parseRunId(body);
  if (runId === null || body === null) {
    return NextResponse.json({ error: { code: "validation", message: "runId is required" } }, { status: 422 });
  }

  const ctx = await buildAppContext();
  if (ctx === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }

  try {
    // The application use-case validates and derives everything from `pricing` — the
    // route trusts NONE of it (totals/pricedBy are server-computed).
    const proposal = await setProposalPricing(ctx, runId, body["pricing"]);
    return NextResponse.json(proposal, { status: 200 });
  } catch (error) {
    if (isApplicationError(error)) return NextResponse.json(error.toBody(), { status: error.status });
    return NextResponse.json({ error: { code: "internal", message: "An unexpected error occurred" } }, { status: 500 });
  }
}
