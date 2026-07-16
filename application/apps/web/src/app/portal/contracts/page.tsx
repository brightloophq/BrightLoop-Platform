import type { Metadata } from "next";
import { EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { ContractSign, type PortalContract } from "./ContractSign";
import shell from "../../admin/admin.module.css";

export const metadata: Metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

/** Client contract signing (Sprint 6). RLS hides `pending` contracts. */
export default async function PortalContractsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select("id, status, client_signature, sow_url");
  const contracts: PortalContract[] = (data ?? []) as PortalContract[];

  return (
    <>
      <div className={shell.topbar}><h1 className={shell.topTitle}>Contracts</h1></div>
      <div className={shell.content}>
        {contracts.length === 0 ? (
          <EmptyState icon="check-circle" title="No contracts yet" body="Once you accept a proposal, your Statement of Work appears here to sign." />
        ) : (
          <ContractSign contracts={contracts} />
        )}
      </div>
    </>
  );
}
