"use server";

import { revalidatePath } from "next/cache";
import { assertCapability } from "@brightloop/domain";
import { PLACEHOLDER_MODULES } from "@brightloop/data";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/analytics";
import { performTransition } from "./admin/transition-service";

const MODULE_BY_ID = new Map(PLACEHOLDER_MODULES.map((m) => [m.id, m]));

/**
 * Quote engine actions (Sprint 5C).
 *
 * ADMIN build/edit writes go through the SESSION client — RLS admits them because
 * the admin is internal — and every STATUS change goes through performTransition
 * (guard + audit + DB trigger), never a raw status write. Item/meta edits are
 * data writes, not status moves.
 *
 * CLIENT accept/reject/revise/view never touch the quote directly: they call the
 * bl_client_quote_action RPC (SECURITY DEFINER, status-only, audited), the only
 * path RLS leaves open to a client. A client cannot see a draft quote at all
 * (the draft-quote gate), so these only ever apply to sent/viewed quotes.
 */

export interface QuoteResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function internal() {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  assertCapability(actor, "clients.update");
  const supabase = await createClient();
  const { data: me } = await supabase.from("users").select("id").eq("auth_user_id", actor.userId).maybeSingle();
  return { actor, supabase, meId: me?.id ?? null };
}

type CommercialItem = {
  id: string | null; label: string; description: string; quantity: number;
  unitAmount: number | null; pricingType: "one_time" | "recurring";
  recurrenceCadence: "weekly" | "monthly" | "quarterly" | "annual" | null;
  optional: boolean;
};

async function editCommercialQuote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  edit: (snapshot: { title: string; clientNote: string; currency: string; discount: number; validUntil: string | null; items: CommercialItem[] }) => void,
): Promise<string | null> {
  const [{ data: quote, error: quoteError }, { data: rows, error: itemError }] = await Promise.all([
    supabase.from("quotes").select("title,client_note,currency,discount,valid_until,updated_at").eq("id", quoteId).maybeSingle(),
    supabase.from("quote_items").select("id,label,description,quantity,unit_amount,pricing_type,recurrence_cadence,optional,sort").eq("quote_id", quoteId).order("sort"),
  ]);
  if (quoteError || itemError || !quote) return quoteError?.message ?? itemError?.message ?? "Quote not found";
  const snapshot = {
    title: quote.title, clientNote: quote.client_note, currency: quote.currency,
    discount: quote.discount, validUntil: quote.valid_until,
    items: (rows ?? []).map((item) => ({ id: item.id, label: item.label, description: item.description, quantity: item.quantity, unitAmount: item.unit_amount, pricingType: item.pricing_type, recurrenceCadence: item.recurrence_cadence, optional: item.optional })),
  };
  edit(snapshot);
  const { error } = await supabase.rpc("bl_save_quote_commercial", {
    p_quote_id: quoteId, p_expected_updated_at: quote.updated_at,
    p_title: snapshot.title, p_client_note: snapshot.clientNote,
    p_currency: snapshot.currency, p_discount: snapshot.discount,
    p_valid_until: snapshot.validUntil, p_items: snapshot.items,
  });
  return error?.message ?? null;
}

/* ---- admin: build ---------------------------------------------------------- */

export async function createQuote(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase, meId } = await internal();
    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const clientId = String(formData.get("clientId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim() || "Proposal quote";
    if (!conversationId || !clientId) return { ok: false, error: "Missing conversation or client" };

    const quoteId = id("qte");
    const { error } = await supabase.from("quotes").insert({
      id: quoteId,
      conversation_id: conversationId,
      client_id: clientId,
      commercial_mode: "legacy_client_quote",
      title,
      status: "draft",
      created_by: meId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/conversations/${conversationId}`);
    return { ok: true, id: quoteId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Create a quote SEEDED from the prospect's configuration — one draft line item
 * per active module, priced from the internal catalog as a starting point the
 * strategist then edits. This lives entirely on the admin side (draft-quote gate),
 * so seeding from internal pricing never reaches the prospect.
 */
export async function createQuoteFromConfiguration(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase, meId } = await internal();
    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const clientId = String(formData.get("clientId") ?? "").trim();
    if (!conversationId || !clientId) return { ok: false, error: "Missing conversation or client" };

    const { data: conv } = await supabase.from("conversations").select("configuration_id").eq("id", conversationId).maybeSingle();
    const { data: config } = conv?.configuration_id
      ? await supabase.from("configurations").select("modules").eq("id", conv.configuration_id).maybeSingle()
      : { data: null };
    const moduleIds = ((config?.modules as string[] | null) ?? []).filter((mid) => MODULE_BY_ID.has(mid));

    const quoteId = id("qte");
    const { error } = await supabase.from("quotes").insert({
      id: quoteId, conversation_id: conversationId, client_id: clientId, commercial_mode: "legacy_client_quote", title: "Proposal quote", status: "draft", created_by: meId,
    });
    if (error) return { ok: false, error: error.message };

    if (moduleIds.length > 0) {
      const rows = moduleIds.map((mid, i) => {
        const m = MODULE_BY_ID.get(mid)!;
        const unit = Math.round(m.from * 100); // catalog `from` dollars → cents (internal starting point)
        return { id: id("qit"), quote_id: quoteId, label: m.name, description: "", module_id: mid, quantity: 1, unit_amount: unit, amount: unit, sort: i };
      });
      await supabase.from("quote_items").insert(rows);
      const saveError = await editCommercialQuote(supabase, quoteId, () => {});
      if (saveError) return { ok: false, error: saveError };
    }

    revalidatePath(`/admin/conversations/${conversationId}`);
    return { ok: true, id: quoteId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function addQuoteItem(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase } = await internal();
    const quoteId = String(formData.get("quoteId") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const quantity = Math.max(1, Math.trunc(Number(formData.get("quantity") ?? 1)));
    // UI collects dollars; store cents.
    const unitAmount = Math.max(0, Math.round(Number(formData.get("unitDollars") ?? 0) * 100));
    if (!quoteId || !label) return { ok: false, error: "Label is required" };

    const error = await editCommercialQuote(supabase, quoteId, (snapshot) => snapshot.items.push({
      id: null, label, description, quantity, unitAmount, pricingType: "one_time",
      recurrenceCadence: null, optional: false,
    }));
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeQuoteItem(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase } = await internal();
    const itemId = String(formData.get("itemId") ?? "").trim();
    const quoteId = String(formData.get("quoteId") ?? "").trim();
    const error = await editCommercialQuote(supabase, quoteId, (snapshot) => {
      snapshot.items = snapshot.items.filter((item) => item.id !== itemId);
    });
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateQuoteMeta(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase } = await internal();
    const quoteId = String(formData.get("quoteId") ?? "").trim();
    const error = await editCommercialQuote(supabase, quoteId, (snapshot) => {
      if (formData.has("title")) snapshot.title = String(formData.get("title") ?? "").trim() || "Proposal quote";
      if (formData.has("clientNote")) snapshot.clientNote = String(formData.get("clientNote") ?? "");
      if (formData.has("discountDollars")) snapshot.discount = Math.max(0, Math.round(Number(formData.get("discountDollars") ?? 0) * 100));
      if (formData.has("validUntil")) snapshot.validUntil = String(formData.get("validUntil") ?? "") || null;
    });
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Add an internal-only pricing rationale / revision snapshot. */
export async function addQuoteRevisionNote(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase, meId } = await internal();
    const quoteId = String(formData.get("quoteId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!quoteId || !note) return { ok: false, error: "Note is required" };
    const { count } = await supabase.from("quote_revisions").select("id", { count: "exact", head: true }).eq("quote_id", quoteId);
    const { error } = await supabase.from("quote_revisions").insert({
      id: id("qrv"),
      quote_id: quoteId,
      version: (count ?? 0) + 1,
      internal_note: note,
      author_id: meId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/* ---- admin: status moves (guarded) ---------------------------------------- */

async function moveQuote(quoteId: string, to: string, patch?: Record<string, unknown>): Promise<QuoteResult> {
  if (["sent", "viewed", "revision_requested", "revised", "accepted", "rejected", "expired"].includes(to)) {
    const { supabase } = await internal();
    const { data: quote, error } = await supabase.from("quotes").select("commercial_mode").eq("id", quoteId).maybeSingle();
    if (error || quote === null) return { ok: false, error: "Quote not found" };
    if (quote.commercial_mode === "proposal_only") return { ok: false, error: "Proposal-only quotes are internal and cannot enter client-facing states" };
  }
  const res = await performTransition({
    table: "quotes",
    machine: "quote",
    entityId: quoteId,
    to,
    capability: "clients.update",
    patch,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, id: quoteId };
}

export async function submitQuoteForReview(quoteId: string): Promise<QuoteResult> {
  const r = await moveQuote(quoteId, "internal_review");
  if (r.ok) revalidatePathForQuote(quoteId);
  return r;
}

export async function sendQuote(quoteId: string): Promise<QuoteResult> {
  const r = await moveQuote(quoteId, "sent", { sent_at: new Date().toISOString() });
  if (r.ok) revalidatePathForQuote(quoteId);
  return r;
}

export async function markQuoteRevised(quoteId: string): Promise<QuoteResult> {
  const r = await moveQuote(quoteId, "revised");
  if (r.ok) revalidatePathForQuote(quoteId);
  return r;
}

function revalidatePathForQuote(_quoteId: string) {
  // The admin workspace re-reads on navigation; broad revalidate keeps it simple.
  revalidatePath("/admin/conversations", "layout");
  revalidatePath("/portal/chat");
  revalidatePath(`/admin/quotes/${_quoteId}`);
}

/* ---- client: accept / reject / request revision / mark viewed -------------- */

export async function clientQuoteAction(quoteId: string, action: "view" | "accept" | "reject" | "revise"): Promise<QuoteResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "Not signed in" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bl_client_quote_action", { p_quote_id: quoteId, p_action: action });
    if (error) return { ok: false, error: error.message };

    const newStatus = String(data);
    if (action !== "view") {
      const nameMap = { accept: "quote.accepted", reject: "quote.rejected", revise: "quote.revision_requested" } as const;
      await emitEvent({ name: nameMap[action], clientId: actor.clientId, role: actor.role, source: "server", props: { status: newStatus } });
    }
    revalidatePath("/portal/chat");
    return { ok: true, id: quoteId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/* ---- admin: convert an accepted quote into a proposal ---------------------- */

export async function convertQuoteToProposal(quoteId: string): Promise<QuoteResult> {
  try {
    const { supabase } = await internal();
    const { data: quote } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (!quote) return { ok: false, error: "Quote not found" };
    if (quote.commercial_mode !== "legacy_client_quote" || quote.client_id === null) {
      return { ok: false, error: "Proposal-only quotes require the canonical proposal issuance flow" };
    }
    if (quote.status !== "accepted") return { ok: false, error: "Only an accepted quote can be converted" };

    const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort");
    const lineItems = (items ?? []).map((i) => ({ label: i.label, description: i.description, quantity: i.quantity, amount: i.amount }));

    const proposalId = id("prp");
    const { error: pErr } = await supabase.from("proposals").insert({
      id: proposalId,
      client_id: quote.client_id,
      status: "draft",
      line_items: lineItems,
      subtotal: quote.subtotal,
      total: quote.total,
      deposit: 0,
    });
    if (pErr) return { ok: false, error: pErr.message };

    // Mark the quote converted (guarded) and link the proposal.
    const moved = await moveQuote(quoteId, "converted", { proposal_id: proposalId });
    if (!moved.ok) {
      await supabase.from("proposals").delete().eq("id", proposalId); // roll back the orphan
      return { ok: false, error: moved.error };
    }
    revalidatePathForQuote(quoteId);
    return { ok: true, id: proposalId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
