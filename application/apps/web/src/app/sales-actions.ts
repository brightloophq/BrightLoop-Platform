"use server";

import { revalidatePath } from "next/cache";
import { assertCapability } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { selectSignatureProvider } from "@/lib/signatures";
import { performTransition } from "./admin/transition-service";
import { parseUsdMinorUnits } from "@/lib/sales-money";

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

export interface ScannerPublicationConfirmation {
  proposalId: string;
  clientId: string;
  recipientUserId: string;
  currency: string;
  totalMinor: number;
  validUntil: string;
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
    const deposit = parseUsdMinorUnits(String(formData.get("depositDollars") ?? "0"));
    if (deposit === null) return { ok: false, error: "Enter a USD deposit with at most two decimal places and within the supported range." };
    const { data: proposal, error: readError } = await supabase.from("proposals").select("currency").eq("id", proposalId).maybeSingle();
    if (readError || !proposal) return { ok: false, error: "Proposal could not be loaded." };
    if (proposal.currency !== "USD" && deposit > 0) return { ok: false, error: "Non-USD deposits are unavailable until invoice currency support is added." };
    const { error } = await supabase.from("proposals").update({ deposit }).eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/proposals/${proposalId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function sendProposal(proposalId: string): Promise<SalesResult> {
  // Converted scanner drafts require the explicit confirmation form and the
  // database publication RPC. This legacy transition is retained for ordinary
  // proposals; the database trigger independently rejects a bypass attempt.
  try {
    const { supabase } = await internal();
    const { data: conversion, error } = await supabase.from("scanner_sales_conversions")
      .select("id").eq("proposal_id", proposalId).maybeSingle();
    if (error) return { ok: false, error: "Could not verify proposal origin." };
    if (conversion) return { ok: false, error: "Use the confirmed portal publication action for scanner proposals." };
    const { data: proposal, error: proposalError } = await supabase.from("proposals").select("currency").eq("id", proposalId).maybeSingle();
    if (proposalError || !proposal) return { ok: false, error: "Proposal could not be loaded." };
    if (proposal.currency !== "USD") return { ok: false, error: "Only USD proposals can be published until invoice currency support is available." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
  const res = await performTransition({
    table: "proposals", machine: "proposal", entityId: proposalId, to: "sent",
    capability: CAP_SALES, patch: { sent_at: new Date().toISOString() },
  });
  if (res.ok) { revalidatePath("/admin/proposals", "layout"); revalidatePath("/portal/proposals"); }
  return res.ok ? { ok: true, id: proposalId } : { ok: false, error: res.error };
}

export async function publishScannerSalesProposal(input: ScannerPublicationConfirmation): Promise<SalesResult> {
  try {
    const { supabase } = await internal();
    if (!input.proposalId || !input.clientId || !input.recipientUserId || input.currency !== "USD"
      || !Number.isSafeInteger(input.totalMinor) || input.totalMinor < 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) {
      return { ok: false, error: "Review the current recipient and proposal terms before publishing." };
    }
    const { error } = await supabase.rpc("bl_publish_scanner_sales_proposal", {
      p_proposal_id: input.proposalId,
      p_expected_client_id: input.clientId,
      p_recipient_user_id: input.recipientUserId,
      p_expected_currency: input.currency,
      p_expected_total_minor: input.totalMinor,
      p_expected_valid_until: input.validUntil,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, error: "Owner or admin authorization is required to publish." };
      if (error.code === "40001") return { ok: false, error: error.message };
      if (error.code === "22023") return { ok: false, error: error.message };
      return { ok: false, error: "Publication could not be completed. Reload the proposal and try again." };
    }
    revalidatePath(`/admin/proposals/${input.proposalId}`);
    revalidatePath("/admin/proposals", "layout");
    revalidatePath("/portal/proposals");
    return { ok: true, id: input.proposalId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Publication failed" };
  }
}

export async function createScannerSalesRevision(predecessorProposalId: string): Promise<SalesResult> {
  try {
    const { supabase } = await internal();
    const { data, error } = await supabase.rpc("bl_create_scanner_sales_revision", {
      p_predecessor_proposal_id: predecessorProposalId,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, error: "Owner or admin authorization is required to prepare a revision." };
      if (error.code === "40001" || error.code === "55000" || error.code === "22023") return { ok: false, error: error.message };
      return { ok: false, error: "A private revision could not be prepared. Reload the proposal and try again." };
    }
    const proposalId = data && typeof data === "object" && "proposalId" in data ? String(data.proposalId) : "";
    if (!proposalId) return { ok: false, error: "The server did not return a revision proposal." };
    revalidatePath(`/admin/proposals/${predecessorProposalId}`);
    revalidatePath("/admin/proposals", "layout");
    return { ok: true, id: proposalId };
  } catch {
    return { ok: false, error: "A private revision could not be prepared." };
  }
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
