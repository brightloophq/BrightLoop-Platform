import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Icon } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { SalesFlow, type FlowContract, type FlowInvoice } from "../SalesFlow";
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
    .select("id, status, total, deposit, line_items, client_id, clients(company)")
    .eq("id", id)
    .maybeSingle();
  if (!proposal) notFound();

  const [{ data: contract }, { data: invoice }] = await Promise.all([
    supabase.from("contracts").select("id, status, client_signature").eq("proposal_id", id).maybeSingle(),
    // deposit invoice for this client (one deposit per engagement)
    supabase.from("invoices").select("id, status, amount").eq("client_id", proposal.client_id).eq("type", "deposit").order("issued_at", { ascending: false, nullsFirst: true }).limit(1).maybeSingle(),
  ]);

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
            proposal={{ id: proposal.id, status: proposal.status, total: proposal.total, deposit: proposal.deposit, line_items: (proposal.line_items as { label: string; amount?: number }[] | null) ?? [] }}
            contract={(contract as FlowContract) ?? null}
            invoice={(invoice as FlowInvoice) ?? null}
          />
        </div>
      </div>
    </>
  );
}
