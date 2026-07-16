"use server";

import { revalidatePath } from "next/cache";
import { assertCapability, quoteTotals } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/analytics";
import { performTransition } from "./admin/transition-service";

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

/** Recompute stored subtotal/total from the current line items + discount. */
async function recompute(supabase: Awaited<ReturnType<typeof createClient>>, quoteId: string) {
  const [{ data: items }, { data: q }] = await Promise.all([
    supabase.from("quote_items").select("quantity, unit_amount").eq("quote_id", quoteId),
    supabase.from("quotes").select("discount").eq("id", quoteId).maybeSingle(),
  ]);
  const totals = quoteTotals(
    (items ?? []).map((i) => ({ quantity: i.quantity, unitAmount: i.unit_amount })),
    q?.discount ?? 0,
  );
  await supabase.from("quotes").update({ subtotal: totals.subtotal, total: totals.total, updated_at: new Date().toISOString() }).eq("id", quoteId);
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

    const { error } = await supabase.from("quote_items").insert({
      id: id("qit"),
      quote_id: quoteId,
      label,
      description,
      module_id: String(formData.get("moduleId") ?? "") || null,
      quantity,
      unit_amount: unitAmount,
      amount: quantity * unitAmount,
      sort: Math.trunc(Number(formData.get("sort") ?? 0)),
    });
    if (error) return { ok: false, error: error.message };
    await recompute(supabase, quoteId);
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
    const { error } = await supabase.from("quote_items").delete().eq("id", itemId);
    if (error) return { ok: false, error: error.message };
    await recompute(supabase, quoteId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateQuoteMeta(formData: FormData): Promise<QuoteResult> {
  try {
    const { supabase } = await internal();
    const quoteId = String(formData.get("quoteId") ?? "").trim();
    const patch: Record<string, unknown> = {};
    if (formData.has("title")) patch.title = String(formData.get("title") ?? "").trim() || "Proposal quote";
    if (formData.has("clientNote")) patch.client_note = String(formData.get("clientNote") ?? "");
    if (formData.has("discountDollars")) patch.discount = Math.max(0, Math.round(Number(formData.get("discountDollars") ?? 0) * 100));
    if (formData.has("validUntil")) patch.valid_until = String(formData.get("validUntil") ?? "") || null;
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("quotes").update(patch).eq("id", quoteId);
    if (error) return { ok: false, error: error.message };
    await recompute(supabase, quoteId); // discount may have changed
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
