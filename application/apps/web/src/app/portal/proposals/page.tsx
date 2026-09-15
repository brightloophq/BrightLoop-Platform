import type { Metadata } from "next";
import { EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { ProposalReview, type PortalProposal } from "./ProposalReview";
import shell from "../../admin/admin.module.css";

export const metadata: Metadata = { title: "Proposals" };
export const dynamic = "force-dynamic";

/**
 * Client proposal review (handoff §07 / Sprint 6). RLS returns only this org's
 * proposals that have been SENT — a draft proposal is invisible here.
 */
export default async function PortalProposalsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, proposal_kind, proposal_number, title, currency, issued_at, valid_until, status, subtotal, total, deposit, line_items")
    .order("sent_at", { ascending: false });

  const proposals: PortalProposal[] = (data ?? []).map((p) => ({
    id: p.id, proposal_kind: p.proposal_kind, proposal_number: p.proposal_number, title: p.title, currency: p.currency, issued_at: p.issued_at, valid_until: p.valid_until, status: p.status, subtotal: p.subtotal, total: p.total, deposit: p.deposit,
    line_items: (p.line_items as PortalProposal["line_items"] | null) ?? [],
  }));

  return (
    <>
      <div className={shell.topbar}><h1 className={shell.topTitle}>Proposals</h1></div>
      <div className={shell.content}>
        {proposals.length === 0 ? (
          <EmptyState title="No proposals yet" body="When your strategist sends a proposal, it appears here to review and accept." />
        ) : (
          <ProposalReview proposals={proposals} />
        )}
      </div>
    </>
  );
}
