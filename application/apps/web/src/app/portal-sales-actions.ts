"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/analytics";
import { selectPaymentProvider } from "@/lib/payments";
import { settlePaymentSucceeded } from "@/lib/settle";

/**
 * Client portal sales actions (Sprint 6): review a proposal, sign a contract,
 * pay a deposit invoice.
 *
 * Proposal/contract status changes go ONLY through the SECURITY DEFINER RPCs —
 * the client never writes those rows directly. Payment creates a provider intent;
 * in mock mode the deterministic provider has no external webhook, so we settle
 * immediately through the same settlement path the real webhook uses.
 */

export interface PortalSalesResult {
  ok: boolean;
  error?: string;
  clientSecret?: string;
}

export async function proposalAction(proposalId: string, action: "view" | "accept" | "change", note?: string): Promise<PortalSalesResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "Not signed in" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bl_client_proposal_action", { p_proposal_id: proposalId, p_action: action, p_note: note ?? "" });
    if (error) return { ok: false, error: error.message };
    if (action === "accept") await emitEvent({ name: "proposal.accept", clientId: actor.clientId, role: actor.role, source: "server", props: { status: String(data) } });
    if (action === "change") await emitEvent({ name: "proposal.change_request", clientId: actor.clientId, role: actor.role, source: "server" });
    revalidatePath("/portal/proposals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function signContract(contractId: string, signature: string): Promise<PortalSalesResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "Not signed in" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("bl_client_contract_sign", { p_contract_id: contractId, p_signature: signature });
    if (error) return { ok: false, error: error.message };
    await emitEvent({ name: "contract.sign", clientId: actor.clientId, role: actor.role, source: "server" });
    revalidatePath("/portal/contracts");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function payInvoice(invoiceId: string): Promise<PortalSalesResult> {
  try {
    const actor = await getActor();
    if (!actor?.clientId) return { ok: false, error: "Not signed in" };
    const supabase = await createClient();

    // RLS ensures the client only reads their own, sent-or-later invoice.
    const { data: invoice } = await supabase.from("invoices").select("id, amount, status, client_id").eq("id", invoiceId).maybeSingle();
    if (!invoice) return { ok: false, error: "Invoice not found" };
    if (invoice.status === "paid") return { ok: true };

    const provider = selectPaymentProvider();
    const intent = await provider.createPaymentIntent({ invoiceId, amount: invoice.amount, currency: "usd", clientId: invoice.client_id });

    // Real provider: hand the client the clientSecret and wait for the webhook.
    // Mock provider: settle now (no external webhook exists to fire).
    if (provider.name === "mock") {
      const settled = await settlePaymentSucceeded({ invoiceId, amount: invoice.amount, last4: "4242", method: "card", providerRef: intent.providerRef });
      if (!settled.ok) return { ok: false, error: settled.error };
      await emitEvent({ name: "payment.succeed", clientId: actor.clientId, role: actor.role, source: "server", props: { invoiceId } });
      revalidatePath("/portal/invoices");
      revalidatePath("/portal");
      return { ok: true };
    }

    return { ok: true, clientSecret: intent.clientSecret };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
