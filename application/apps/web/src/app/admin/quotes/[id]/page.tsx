import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationError, assertCapability } from "@brightloop/domain";
import { Alert, EmptyWorkspace, OperationalPanel, SectionHeader } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuoteCommercialWorkspace } from "./QuoteCommercialWorkspace";

export const dynamic = "force-dynamic";

export default async function QuoteWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSurface("admin");
  try {
    assertCapability(actor, "clients.update");
  } catch (error) {
    if (error instanceof AuthorizationError) return <EmptyWorkspace icon="lock" title="You don't have access to commercial quotes" body="Commercial scope and pricing require client-management authority." />;
    throw error;
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: quote, error } = await supabase.from("quotes").select("id,title,status,currency,subtotal,discount,total,recurring_total,recurring_cadence,optional_one_time_total,optional_recurring_total,client_note,valid_until,updated_at,commercial_mode,source_run_id,source_proposal_version_id,source_review_event_id,quote_items(id,label,description,quantity,unit_amount,amount,sort,pricing_type,recurrence_cadence,optional,source_work_item_id,source_evidence_refs)").eq("id", id).maybeSingle();
  if (error) return <OperationalPanel><Alert tone="danger" title="Quote unavailable">{error.message}</Alert></OperationalPanel>;
  if (!quote) notFound();

  const source = quote.source_proposal_version_id
    ? await supabase.from("proposal_versions").select("id,checksum,envelope").eq("id", quote.source_proposal_version_id).maybeSingle()
    : { data: null };
  const items = [...(quote.quote_items ?? [])].sort((a, b) => a.sort - b.sort);

  return (
    <div style={{ maxWidth: 1200, marginInline: "auto", padding: "var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
      <SectionHeader as="h1" size="page" index="01" kicker={<Link href={quote.source_run_id ? `/admin/prospect-scanner/${quote.source_run_id}` : "/admin"}>← {quote.source_run_id ? "Scanner package" : "Admin"}</Link>} title={quote.title} hint="Canonical internal commercial scope and quote-owned pricing." />
      <QuoteCommercialWorkspace quote={{ ...quote, quote_items: items }} sourceProposal={source.data} />
    </div>
  );
}
