"use server";

import { revalidatePath } from "next/cache";
import { assertCapability } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { selectSignatureProvider } from "@/lib/signatures";
import { performTransition } from "./admin/transition-service";

/**
 * Admin sales actions (Sprint 6) — proposal → contract → deposit invoice.
 *
 * Every STATUS move goes through the guarded performTransition (capability +
 * can() guard + audit + DB trigger). Row creation and field edits are ordinary
 * internal writes (RLS admits internal roles). The e-sign provider is called
 * where a real vendor would create/countersign an envelope; in mock mode signing
 * completes in-app via the client RPC.
 */

export interface SalesResult {
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
  return { actor, supabase };
}

const CAP_SALES = "clients.update"; // owner/admin, not team_member
const CAP_FINANCE = "finance.update"; // owner/admin

/* ---- proposals ------------------------------------------------------------- */

export async function setProposalDeposit(formData: FormData): Promise<SalesResult> {
  try {
    const { supabase } = await internal();
    const proposalId = String(formData.get("proposalId") ?? "").trim();
    const deposit = Math.max(0, Math.round(Number(formData.get("depositDollars") ?? 0) * 100));
    const { error } = await supabase.from("proposals").update({ deposit }).eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/proposals/${proposalId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function sendProposal(proposalId: string): Promise<SalesResult> {
  const res = await performTransition({
    table: "proposals", machine: "proposal", entityId: proposalId, to: "sent",
    capability: CAP_SALES, patch: { sent_at: new Date().toISOString() },
  });
  if (res.ok) { revalidatePath("/admin/proposals", "layout"); revalidatePath("/portal/proposals"); }
  return res.ok ? { ok: true, id: proposalId } : { ok: false, error: res.error };
}

/* ---- contracts ------------------------------------------------------------- */

export async function createContractForProposal(proposalId: string): Promise<SalesResult> {
  try {
    const { supabase } = await internal();
    const { data: proposal } = await supabase.from("proposals").select("id, client_id, status").eq("id", proposalId).maybeSingle();
    if (!proposal) return { ok: false, error: "Proposal not found" };
    if (proposal.status !== "accepted") return { ok: false, error: "Only an accepted proposal becomes a contract" };

    // One contract per proposal.
    const { data: existing } = await supabase.from("contracts").select("id").eq("proposal_id", proposalId).maybeSingle();
    if (existing) return { ok: true, id: existing.id };

    const contractId = id("con");
    const { error } = await supabase.from("contracts").insert({
      id: contractId, client_id: proposal.client_id, proposal_id: proposalId,
      status: "pending", sow_url: `/contracts/${contractId}/sow`,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/contracts", "layout");
    return { ok: true, id: contractId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function sendContract(contractId: string): Promise<SalesResult> {
  try {
    const { supabase } = await internal();
    const { data: contract } = await supabase.from("contracts").select("id, client_id, sow_url").eq("id", contractId).maybeSingle();
    if (!contract) return { ok: false, error: "Contract not found" };

    // Create the e-sign envelope (mock unless a provider is configured).
    const provider = selectSignatureProvider();
    await provider.send({ contractId, clientId: contract.client_id, signerEmail: "", signerName: "", sowUrl: contract.sow_url ?? "" });

    const res = await performTransition({ table: "contracts", machine: "contract", entityId: contractId, to: "sent", capability: CAP_SALES });
    if (res.ok) { revalidatePath("/admin/contracts", "layout"); revalidatePath("/portal/contracts"); }
    return res.ok ? { ok: true, id: contractId } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function countersignContract(contractId: string): Promise<SalesResult> {
  try {
    const { supabase } = await internal();
    const provider = selectSignatureProvider();
    await provider.countersign(contractId);

    // signed_client → countersigned → active (two legal moves).
    const step1 = await performTransition({
      table: "contracts", machine: "contract", entityId: contractId, to: "countersigned",
      capability: CAP_SALES, patch: { countersignature: "Auxion" },
    });
    if (!step1.ok) return { ok: false, error: step1.error };
    const step2 = await performTransition({ table: "contracts", machine: "contract", entityId: contractId, to: "active", capability: CAP_SALES });
    if (!step2.ok) return { ok: false, error: step2.error };

    // Activation may now be eligible if the deposit is already paid.
    const { data: contract } = await supabase.from("contracts").select("client_id").eq("id", contractId).maybeSingle();
    if (contract) await supabase.rpc("bl_activate_client", { p_client_id: contract.client_id });

    revalidatePath("/admin/contracts", "layout");
    revalidatePath("/portal/contracts");
    return { ok: true, id: contractId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/* ---- deposit invoice ------------------------------------------------------- */

export async function createDepositInvoice(proposalId: string): Promise<SalesResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "Not signed in" };
    assertCapability(actor, CAP_FINANCE);
    const supabase = await createClient();

    const { data: proposal } = await supabase.from("proposals").select("client_id, deposit").eq("id", proposalId).maybeSingle();
    if (!proposal) return { ok: false, error: "Proposal not found" };
    if (!proposal.deposit || proposal.deposit <= 0) return { ok: false, error: "Set a deposit on the proposal first" };

    const invoiceId = id("inv");
    const { error } = await supabase.from("invoices").insert({
      id: invoiceId, client_id: proposal.client_id, amount: proposal.deposit, type: "deposit", status: "draft",
      due_date: null,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/invoices", "layout");
    return { ok: true, id: invoiceId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function sendInvoice(invoiceId: string): Promise<SalesResult> {
  const res = await performTransition({
    table: "invoices", machine: "invoice", entityId: invoiceId, to: "sent",
    capability: CAP_FINANCE, patch: { issued_at: new Date().toISOString() },
  });
  if (res.ok) { revalidatePath("/admin/invoices", "layout"); revalidatePath("/portal/invoices"); }
  return res.ok ? { ok: true, id: invoiceId } : { ok: false, error: res.error };
}
