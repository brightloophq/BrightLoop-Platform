import { NextResponse } from "next/server";
import { hasCapability, quoteCommercialSaveSchema } from "@brightloop/schema";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasCapability(actor.role, "clients.update")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = quoteCommercialSaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid commercial quote payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bl_save_quote_commercial", {
    p_quote_id: id,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_title: parsed.data.title,
    p_client_note: parsed.data.clientNote,
    p_currency: parsed.data.currency,
    p_discount: parsed.data.discount,
    p_valid_until: parsed.data.validUntil,
    p_items: parsed.data.items,
  });
  if (error) {
    const status = error.code === "40001" ? 409 : error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  const result = data?.[0];
  if (!result) return NextResponse.json({ error: "Quote save returned no result" }, { status: 500 });

  return NextResponse.json({
    quoteId: result.quote_id,
    updatedAt: result.updated_at,
    subtotal: result.subtotal,
    discount: result.discount,
    total: result.total,
    recurringTotal: result.recurring_total,
    recurringCadence: result.recurring_cadence,
    optionalOneTimeTotal: result.optional_one_time_total,
    optionalRecurringTotal: result.optional_recurring_total,
    pricingComplete: result.pricing_complete,
    itemCount: result.item_count,
    items: result.persisted_items,
  });
}
