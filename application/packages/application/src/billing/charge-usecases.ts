/* =============================================================================
 * Billing — payment settlement via the COMMERCE CONNECTOR (F5).
 *
 * Billing does NOT re-integrate Stripe. It locates the workspace's installed
 * Stripe/PayPal connector and settles through the certified `invokeConnector-
 * Capability` path — the same secret-safe, audited seam every connector uses.
 * If no payment connector is installed, settlement degrades gracefully (an
 * operator settles the invoice manually). No payment SDK is imported here.
 * ========================================================================== */

import type { ConnectorInstallation } from "@brightloop/schema";

import { requireIntegration, type AppContext } from "../context.js";
import { isApplicationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { invokeConnectorCapability } from "../integration/invoke-usecases.js";
import { toInvoiceDTO, type InvoiceDTO } from "./dto.js";
import { loadInvoice, loadSubscriptionByWorkspace } from "./shared.js";
import { recordInvoicePayment, recordPaymentFailure } from "./invoice-usecases.js";
import { BILLING_INVOICE_CAP } from "../context.js";

/** Connectors billing knows how to settle through (commerce family, api_key). */
const PAYMENT_CONNECTOR_IDS = ["stripe", "paypal"] as const;
const OPERABLE = new Set(["connected", "degraded"]);
/** The normalized commerce operation billing uses to capture a payment. */
const CAPTURE_CAPABILITY = "commerce.payments.capture";

/**
 * Find an installed, operable payment connector for a workspace (Stripe first).
 * Returns null when integration is not wired or none is installed — the caller
 * degrades gracefully. Never throws for the "not available" case.
 */
export async function resolveBillingPaymentConnector(
  ctx: AppContext,
  workspaceId: string,
): Promise<ConnectorInstallation | null> {
  let installations: ConnectorInstallation[];
  try {
    const repo = requireIntegration(ctx);
    installations = unwrap(await repo.installations.listByWorkspace(workspaceId));
  } catch {
    return null; // integration platform not wired in this context
  }
  for (const id of PAYMENT_CONNECTOR_IDS) {
    const match = installations.find(
      (i) => i.connectorId === id && OPERABLE.has(i.status) && i.enabledCapabilities.includes(CAPTURE_CAPABILITY),
    );
    if (match !== undefined) return match;
  }
  return null;
}

export interface SettlementResult {
  settled: boolean;
  reason: "settled" | "no_payment_connector" | "charge_failed";
  connectorId: string | null;
  invoice: InvoiceDTO;
}

/**
 * Settle an invoice through the workspace's payment connector. On success,
 * records the payment (invoice → paid, subscription recovered). On provider
 * failure, records a failed attempt (invoice → pending/failed, subscription →
 * past_due). With no connector installed, returns `no_payment_connector` and
 * leaves the invoice for manual/internal settlement.
 */
export async function settleInvoiceViaProvider(
  ctx: AppContext,
  input: { invoiceId: string },
): Promise<SettlementResult> {
  const invoice = await loadInvoice(ctx, requireId(input.invoiceId, "invoiceId"), BILLING_INVOICE_CAP);
  const connector = await resolveBillingPaymentConnector(ctx, invoice.workspaceId);

  if (connector === null) {
    return { settled: false, reason: "no_payment_connector", connectorId: null, invoice: toInvoiceDTO(invoice) };
  }

  try {
    // Reuse the certified connector invoke path — secrets + audit handled there.
    await invokeConnectorCapability(ctx, {
      installationId: connector.id,
      capabilityKey: CAPTURE_CAPABILITY,
      input: {
        amount: invoice.amountDueCents,
        currency: invoice.currency,
        reference: invoice.number,
        description: `Invoice ${invoice.number}`,
      },
    });
  } catch (err) {
    if (!isApplicationError(err)) throw err;
    const failed = await recordPaymentFailure(ctx, { invoiceId: invoice.id });
    return { settled: false, reason: "charge_failed", connectorId: connector.connectorId, invoice: failed };
  }

  const paid = await recordInvoicePayment(ctx, { invoiceId: invoice.id, amountCents: invoice.amountDueCents });
  return { settled: true, reason: "settled", connectorId: connector.connectorId, invoice: paid };
}

/** Does the workspace have a payment connector installed? (For UI affordances.) */
export async function hasPaymentConnector(ctx: AppContext, workspaceId: string): Promise<boolean> {
  return (await resolveBillingPaymentConnector(ctx, workspaceId)) !== null;
}

/** Convenience: settle the workspace's most recent open invoice, if any. */
export async function settleWorkspaceInvoice(
  ctx: AppContext,
  input: { workspaceId: string; invoiceId: string },
): Promise<SettlementResult> {
  const wid = requireId(input.workspaceId, "workspaceId");
  // Ensure the invoice belongs to a subscribed workspace before settling.
  await loadSubscriptionByWorkspace(ctx, wid, BILLING_INVOICE_CAP);
  return settleInvoiceViaProvider(ctx, { invoiceId: input.invoiceId });
}
