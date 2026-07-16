import "server-only";

import { can } from "@brightloop/schema";
import { createServiceRoleClient } from "./supabase/service";

/**
 * Payment settlement — the single place where "money arrived" becomes app state.
 *
 * Called by BOTH the payment webhook (real provider truth) and, in mock mode,
 * directly by payInvoice (the deterministic mock has no external webhook to fire).
 * Either way the flow is identical and guarded:
 *   1. record the payment row (succeeded)
 *   2. walk the invoice to `paid` — but only via a LEGAL move (can() guard); the
 *      DB trigger is the backstop even for the service-role key
 *   3. attempt activation (member → client_active) — a no-op unless the contract
 *      is active AND the deposit is paid (enforced in bl_activate_client)
 *
 * Uses the service-role client because a webhook has no user session. RLS is
 * bypassed; the state machine is NOT — the guard and trigger still apply.
 */

export interface SettlementInput {
  invoiceId: string;
  amount: number; // cents
  last4?: string | null;
  method?: string | null;
  providerRef: string;
}

export interface SettlementResult {
  ok: boolean;
  error?: string;
  invoicePaid?: boolean;
  activated?: boolean;
}

function pid(): string {
  return `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function settlePaymentSucceeded(input: SettlementInput): Promise<SettlementResult> {
  const supabase = createServiceRoleClient();

  const { data: invoice, error: readErr } = await supabase
    .from("invoices")
    .select("id, status, client_id, type")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!invoice) return { ok: false, error: "Unknown invoice" };

  // 1. record the payment (idempotent-ish on providerRef would be ideal; kept simple)
  const { error: payErr } = await supabase.from("payments").insert({
    id: pid(),
    invoice_id: input.invoiceId,
    amount: input.amount,
    status: "succeeded",
    last4: input.last4 ?? null,
    method: input.method ?? "card",
    processed_at: new Date().toISOString(),
  });
  if (payErr) return { ok: false, error: payErr.message };

  // 2. invoice → paid, only if legal from its current state
  let invoicePaid = invoice.status === "paid";
  if (!invoicePaid) {
    if (!can("invoice", invoice.status, "paid")) {
      return { ok: false, error: `Illegal invoice move ${invoice.status} → paid` };
    }
    await supabase.from("transition_log").insert({
      machine: "invoice", entity_type: "invoices", entity_id: input.invoiceId,
      from_state: invoice.status, to_state: "paid", actor_id: null, reason: "payment succeeded", at: new Date().toISOString(),
    });
    const { error: updErr } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", input.invoiceId);
    if (updErr) return { ok: false, error: updErr.message };
    invoicePaid = true;
  }

  // 3. attempt activation (no-op unless contract active + deposit paid)
  const { data: activated } = await supabase.rpc("bl_activate_client", { p_client_id: invoice.client_id });

  return { ok: true, invoicePaid, activated: activated === true };
}
