import "server-only";

import { NextResponse } from "next/server";
import { hasCapability } from "@brightloop/schema";
import { getProspectPackageReview, getScan } from "@brightloop/application";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildAppContext } from "@/lib/runtime-api";

const CAPABILITY = "transformation.approve";
const CONFLICT = "The package changed or is no longer client-ready. Reload and review the current versions.";

function authorized(actor: Awaited<ReturnType<typeof getActor>>): actor is NonNullable<typeof actor> {
  return actor !== null && hasCapability(actor.role, CAPABILITY);
}

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return NextResponse.json({ error: { code: "forbidden", message: "Owner or admin authorization required" } }, { status: 403 });
  if (error.code === "40001" || error.code === "23505") return NextResponse.json({ error: { code: "conflict", message: CONFLICT } }, { status: 409 });
  if (error.code === "22023") return NextResponse.json({ error: { code: "validation", message: "A valid run and idempotency key are required" } }, { status: 422 });
  return NextResponse.json({ error: { code: "internal", message: "Conversion could not be completed" } }, { status: 500 });
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

export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  if (!authorized(actor)) return NextResponse.json({ error: { code: "forbidden", message: "Owner or admin authorization required" } }, { status: 403 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const runId = body?.runId;
  const idempotencyKey = body?.idempotencyKey;
  if (typeof runId !== "string" || runId.length < 1 || runId.length > 64
    || typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    return NextResponse.json({ error: { code: "validation", message: "runId and a valid idempotencyKey are required" } }, { status: 422 });
  }
  const ctx = await buildAppContext();
  if (!ctx) return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  try {
    // Readiness is helpful feedback; the RPC independently repeats every check
    // under the run lock and never trusts browser-supplied bindings or client IDs.
    const review = await getProspectPackageReview(ctx, runId);
    const scan = await getScan(ctx, runId);
    if (!scan.clientId) {
      return NextResponse.json({ error: { code: "conflict", message: "Assign this scan to an existing client before conversion." } }, { status: 409 });
    }
    if (!review.readiness.clientReady) {
      return NextResponse.json({ error: { code: "conflict", message: review.readiness.reason } }, { status: 409 });
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bl_convert_scanner_package", {
      p_run_id: runId, p_idempotency_key: idempotencyKey,
    });
    if (error) return rpcError(error);
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: "conflict", message: CONFLICT } }, { status: 409 });
  }
}
