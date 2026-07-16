import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

/** Admin contracts oversight. Drive signing/countersigning from the proposal hub. */
export default async function AdminContractsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("id, status, proposal_id, client_id, clients(company)")
    .order("id", { ascending: false });
  const rows = data ?? [];

  return (
    <>
      <div className={shell.topbar}><h1 className={shell.topTitle}>Contracts</h1></div>
      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Contracts</h2>
            <p className={styles.lede}>Statements of Work through signature, countersignature and activation.</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="check-circle" title="No contracts yet" body="A contract is created from an accepted proposal." />
        ) : (
          <div className={styles.rows}>
            {rows.map((c) => (
              <Card key={c.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Link href={`/admin/proposals/${c.proposal_id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                      {(c.clients as unknown as { company: string } | null)?.company ?? c.client_id}
                    </Link>
                    <Badge tone={c.status === "active" ? "success" : "neutral"} dot>{c.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
