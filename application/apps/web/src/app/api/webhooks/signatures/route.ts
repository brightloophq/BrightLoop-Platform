import { NextResponse, type NextRequest } from "next/server";
import { can } from "@brightloop/schema";
import type { Database } from "@brightloop/db";
import { selectSignatureProvider, signatureWebhookSecret } from "@/lib/signatures";
import { createServiceRoleClient } from "@/lib/supabase/service";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

/**
 * E-signature provider webhook. The vendor tells us a contract was signed or
 * countersigned; the `contract` machine stays authoritative and every move is
 * guarded (can() + the DB trigger) even though the write is service-role.
 *
 * Events handled:
 *   signed        → contract sent → signed_client (records client_signature)
 *   countersigned → signed_client → countersigned → active
 *
 * In mock mode signing happens in-app (the client RPC), so this route is for the
 * real provider and signed integration tests.
 */
async function move(supabase: ReturnType<typeof createServiceRoleClient>, contractId: string, from: string, to: ContractStatus, patch: Record<string, unknown> = {}) {
  if (!can("contract", from, to)) return { ok: false, error: `Illegal contract move ${from} → ${to}` };
  await supabase.from("transition_log").insert({
    machine: "contract", entity_type: "contracts", entity_id: contractId,
    from_state: from, to_state: to, actor_id: null, reason: "e-sign webhook", at: new Date().toISOString(),
  });
  const { error } = await supabase.from("contracts").update({ status: to, ...patch }).eq("id", contractId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function POST(request: NextRequest) {
  const secret = signatureWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-esign-signature") ?? request.headers.get("x-bl-signature") ?? "";

  const provider = selectSignatureProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { contractId?: string; event?: string; signatureName?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.contractId || !payload.event) {
    return NextResponse.json({ error: "Missing contractId or event" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: contract } = await supabase.from("contracts").select("status, client_id").eq("id", payload.contractId).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Unknown contract" }, { status: 404 });

  if (payload.event === "signed") {
    const r = await move(supabase, payload.contractId, contract.status, "signed_client", {
      client_signature: payload.signatureName ?? "signed", signed_at: new Date().toISOString(),
    });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
  }

  if (payload.event === "countersigned") {
    const r1 = await move(supabase, payload.contractId, contract.status, "countersigned", { countersignature: "Auxion" });
    if (!r1.ok) return NextResponse.json({ error: r1.error }, { status: 409 });
    const r2 = await move(supabase, payload.contractId, "countersigned", "active");
    if (!r2.ok) return NextResponse.json({ error: r2.error }, { status: 409 });
    await supabase.rpc("bl_activate_client", { p_client_id: contract.client_id });
    return NextResponse.json({ ok: true, activated: true });
  }

  return NextResponse.json({ ok: true, applied: false, note: `event ${payload.event} ignored` });
}
