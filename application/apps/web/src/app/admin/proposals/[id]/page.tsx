import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Icon } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { SalesFlow, type FlowContract, type FlowInvoice, type FlowProposal, type ScannerDeliveryPreview, type ScannerRevisionContext } from "../SalesFlow";
import shell from "../../admin.module.css";

export const metadata: Metadata = { title: "Proposal" };
export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

/** Admin proposal hub — drive the whole sales loop from one screen. */
export default async function AdminProposalDetail({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, status, total, deposit, line_items, currency, discount_minor, valid_until, client_id, clients(company)")
    .eq("id", id)
    .maybeSingle();
  if (!proposal) notFound();

  const [{ data: contract }, { data: invoice }] = await Promise.all([
    supabase.from("contracts").select("id, status, client_signature").eq("proposal_id", id).maybeSingle(),
    // deposit invoice for this client (one deposit per engagement)
    supabase.from("invoices").select("id, status, amount").eq("client_id", proposal.client_id).eq("type", "deposit").order("issued_at", { ascending: false, nullsFirst: true }).limit(1).maybeSingle(),
  ]);
  const { data: contextData } = await supabase.rpc("bl_scanner_sales_revision_context", { p_proposal_id: id });
  const revisionContext = contextData && typeof contextData === "object" && !Array.isArray(contextData)
    ? contextData as unknown as ScannerRevisionContext : null;
  const isScannerConverted = revisionContext?.isScannerProposal === true;
  let delivery: ScannerDeliveryPreview | null = null;
  if (isScannerConverted) {
    const { data } = await supabase.rpc(revisionContext?.predecessorProposalId ? "bl_scanner_sales_revision_preview" : "bl_scanner_sales_delivery_preview", { p_proposal_id: id });
    if (data && typeof data === "object" && !Array.isArray(data)) delivery = data as unknown as ScannerDeliveryPreview;
  }
  let predecessor: FlowProposal | null = null;
  if (revisionContext?.predecessorProposalId) {
    const { data: prior } = await supabase.from("proposals")
      .select("id,status,total,deposit,currency,discount_minor,valid_until,line_items")
      .eq("id", revisionContext.predecessorProposalId).maybeSingle();
    if (prior) predecessor = { id: prior.id, status: prior.status, total: prior.total, deposit: prior.deposit,
      currency: prior.currency, discountMinor: prior.discount_minor, validUntil: prior.valid_until,
      line_items: (prior.line_items as FlowProposal["line_items"] | null) ?? [] };
  }

  const company = (proposal.clients as unknown as { company: string } | null)?.company ?? proposal.client_id;

  return (
    <>
      <div className={shell.topbar}><h1 className={shell.topTitle}>{company}</h1></div>
      <div className={shell.content}>
        <Link href="/admin/proposals" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: "var(--text-muted)", textDecoration: "none", fontSize: "var(--fs-sm)", marginBottom: "var(--space-5)" }}>
          <Icon name="arrow-left" size={14} /> All proposals
        </Link>
        <div style={{ maxWidth: 560 }}>
          <SalesFlow
            proposal={{ id: proposal.id, status: proposal.status, total: proposal.total, deposit: proposal.deposit,
              currency: proposal.currency, discountMinor: proposal.discount_minor, validUntil: proposal.valid_until,
              line_items: (proposal.line_items as { label: string; amount?: number; quantity?: number; unitAmountMinor?: number; pricingType?: string; cadence?: string | null }[] | null) ?? [] }}
            delivery={delivery}
            revisionContext={revisionContext}
            predecessor={predecessor}
            isScannerConverted={isScannerConverted}
            contract={(contract as FlowContract) ?? null}
            invoice={(invoice as FlowInvoice) ?? null}
          />
        </div>
      </div>
    </>
  );
}
