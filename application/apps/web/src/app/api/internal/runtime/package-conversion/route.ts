import "server-only";

import { NextResponse } from "next/server";
import { hasCapability } from "@brightloop/schema";
import { getProspectPackageReview, getScan } from "@brightloop/application";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildAppContext } from "@/lib/runtime-api";

const CAPABILITY = "transformation.approve";

function authorized(actor: Awaited<ReturnType<typeof getActor>>): actor is NonNullable<typeof actor> {
  return actor !== null && hasCapability(actor.role, CAPABILITY);
}

export async function GET(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  if (!authorized(actor)) return NextResponse.json({ error: { code: "forbidden", message: "Owner or admin authorization required" } }, { status: 403 });
  const runId = new URL(req.url).searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: { code: "validation", message: "runId is required" } }, { status: 422 });

  const ctx = await buildAppContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  try {
    const review = await getProspectPackageReview(ctx, runId);
    const scan = await getScan(ctx, runId);
    const supabase = await createClient();
    const { data, error } = await supabase.from("scanner_sales_conversions")
      .select("id, proposal_id, converted_at").eq("run_id", runId).maybeSingle();
    if (error) return NextResponse.json({ error: { code: "internal", message: "Conversion status could not be loaded" } }, { status: 500 });
    const hasClient = scan.clientId !== null;
    return NextResponse.json({ eligible: review.readiness.clientReady && hasClient,
      reason: hasClient ? review.readiness.reason : "Assign this scan to an existing client before conversion.",
      conversion: data ? { id: data.id, proposalId: data.proposal_id, convertedAt: data.converted_at } : null });
  } catch {
    return NextResponse.json({ error: { code: "not_found", message: "Scanner run is unavailable" } }, { status: 404 });
  }
}

export async function POST(_req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  if (!authorized(actor)) return NextResponse.json({ error: { code: "forbidden", message: "Owner or admin authorization required" } }, { status: 403 });
  // The old direct-to-proposal conversion conflicts with the canonical
  // quote-promotion lifecycle. Keep the route for stable callers, but fail
  // closed until a forward migration installs the quote-backed adapter.
  return NextResponse.json({ error: { code: "conflict", message: "Direct scanner conversion is retired. Use canonical quote promotion." } }, { status: 409 });
}
