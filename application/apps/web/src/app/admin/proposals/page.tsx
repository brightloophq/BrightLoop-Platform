import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Proposals" };
export const dynamic = "force-dynamic";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

/** Admin proposals list — the sales pipeline. Every proposal, any status. */
export default async function AdminProposalsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, status, total, client_id, clients(company)")
    .order("sent_at", { ascending: false, nullsFirst: true });
  const rows = data ?? [];

  return (
    <>
      <div className={shell.topbar}><h1 className={shell.topTitle}>Proposals</h1></div>
      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Sales pipeline</h2>
            <p className={styles.lede}>Proposals from discovery through signature and deposit.</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="search" title="No proposals yet" body="Accept a quote in a discovery conversation to create one." />
        ) : (
          <div className={styles.rows}>
            {rows.map((p) => (
              <Card key={p.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Link href={`/admin/proposals/${p.id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                      {(p.clients as unknown as { company: string } | null)?.company ?? p.client_id}
                    </Link>
                    <Badge tone="neutral" dot>{p.status.replace(/_/g, " ")}</Badge>
                    <span className={styles.rowMeta}>{money(p.total)}</span>
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
