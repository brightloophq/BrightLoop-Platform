import "server-only";

import { NextResponse } from "next/server";
import { scannerPackagePromotionKey } from "@brightloop/domain";
import { hasCapability, isClientRole } from "@brightloop/schema";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface Body { runId: string }

function parseBody(value: unknown): Body | null {
  if (value === null || typeof value !== "object") return null;
  const runId = (value as Record<string, unknown>)["runId"];
  return typeof runId === "string" && runId.length > 0 ? { runId } : null;
}

/** Promote the currently approved scanner package under the caller's RLS session. */
export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (actor === null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (isClientRole(actor.role)
      || !hasCapability(actor.role, "transformation.approve")
      || !hasCapability(actor.role, "clients.update")) {
    return NextResponse.json({ error: "Insufficient capability to promote this package" }, { status: 403 });
  }
  const body = parseBody(await req.json().catch(() => null));
  if (body === null) return NextResponse.json({ error: "runId is required" }, { status: 422 });

  const supabase = await createClient();
  const { data: review, error: reviewError } = await supabase
    .from("runtime_events")
    .select("id, event_type, payload")
    .eq("aggregate_type", "intelligence_run")
    .eq("aggregate_id", body.runId)
    .in("event_type", ["runtime.review.approved", "runtime.review.revision_requested", "runtime.review.rejected"])
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reviewError || review === null || review.event_type !== "runtime.review.approved") {
    return NextResponse.json({ error: "The current package decision is not approved" }, { status: 409 });
  }
  const payload = review.payload !== null && typeof review.payload === "object" && !Array.isArray(review.payload)
    ? review.payload as Record<string, unknown>
    : {};
  const proposalVersionId = typeof payload["proposalVersionId"] === "string" ? payload["proposalVersionId"] : null;
  if (proposalVersionId === null || typeof payload["proposalChecksum"] !== "string") {
    return NextResponse.json({ error: "The approval does not pin a proposal version" }, { status: 409 });
  }

  const promotionKey = scannerPackagePromotionKey(body.runId, proposalVersionId, review.id);
  const quoteId = `qte_${crypto.randomUUID().replaceAll("-", "")}`;
  const { data, error } = await supabase.rpc("bl_promote_scanner_package", {
    p_run_id: body.runId,
    p_proposal_version_id: proposalVersionId,
    p_review_event_id: review.id,
    p_promotion_key: promotionKey,
    p_quote_id: quoteId,
  });
  if (error || data === null || data.length === 0) {
    return NextResponse.json({ error: "The package could not be promoted" }, { status: error?.code === "42501" ? 403 : 409 });
  }
  const result = data[0]!;
  return NextResponse.json({ quoteId: result.quote_id, outcome: result.outcome, itemCount: result.item_count });
}
