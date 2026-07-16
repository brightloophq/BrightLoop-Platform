import { NextResponse, type NextRequest } from "next/server";
import { can } from "@brightloop/schema";
import type { TablesUpdate } from "@brightloop/db";
import { verifyHmacSignature } from "@/lib/webhook-signature";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * n8n status callback receiver (handoff §12).
 *
 * n8n calls this when a workflow run starts / succeeds / fails; it updates the
 * matching Automation row. This is a PUBLIC, unauthenticated URL, so the order
 * of defences is everything:
 *
 *   1. HMAC signature verified against the RAW body FIRST. No valid signature →
 *      401 and nothing else runs. Whoever finds the URL cannot forge a status.
 *   2. can() validates the move against the automation machine, so even a
 *      correctly-signed payload can't drive an illegal transition.
 *   3. The write uses the service-role client — because a webhook has no user
 *      session — but the DB transition trigger STILL fires, so service-role does
 *      not get to bypass the machine either. RLS is bypassed; the guard is not.
 *
 * The app owns the state; n8n only notifies. We reconcile and guard every move.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  if (!secret) {
    // Fail closed: with no secret we cannot verify, so we refuse rather than
    // trust an unverifiable payload.
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-bl-signature") ?? request.headers.get("x-signature") ?? "";

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    automationId?: string;
    to?: string;
    error?: string;
    runIncrement?: boolean;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { automationId, to } = payload;
  if (!automationId || !to) {
    return NextResponse.json({ error: "Missing automationId or to" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Load the CURRENT status — never trust a `from` in the payload.
  const { data: row, error: readErr } = await supabase
    .from("automations")
    .select("status, runs")
    .eq("id", automationId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });

  if (row.status === to) {
    return NextResponse.json({ ok: true, verified: true, applied: false, note: "no change" });
  }

  // Guard against the automation machine before writing.
  if (!can("automation", row.status, to)) {
    return NextResponse.json(
      { error: `Illegal automation transition: ${row.status} -> ${to}` },
      { status: 409 },
    );
  }

  const patch: TablesUpdate<"automations"> = {
    status: to as TablesUpdate<"automations">["status"],
    last_run_at: new Date().toISOString(),
  };
  if (to === "running" || payload.runIncrement) patch.runs = (row.runs ?? 0) + 1;
  if (to === "failed") patch.last_error = payload.error ?? "Workflow reported a failure";
  if (to === "active") patch.last_error = null;

  const { error: updErr } = await supabase
    .from("automations")
    .update(patch)
    .eq("id", automationId);

  if (updErr) {
    // The DB trigger backstops even service-role. A 23514 here means the payload
    // tried an illegal move that slipped past can() — i.e. schema drift.
    const status = updErr.code === "23514" ? 409 : 500;
    return NextResponse.json({ error: updErr.message }, { status });
  }

  return NextResponse.json({ ok: true, verified: true, applied: true, status: to });
}
