import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Finance invoices oversight (owner/admin — finance.*). Client pays from the portal. */
export default async function AdminInvoicesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, amount, type, status, client_id, clients(company)")
    .order("issued_at", { ascending: false, nullsFirst: true });
  const rows = data ?? [];
  const outstanding = rows.filter((i) => ["sent", "pending", "overdue"].includes(i.status)).reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className={shell.topbar}><h1 className={shell.topTitle}>Invoices</h1></div>
      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Invoices</h2>
            <p className={styles.lede}>{outstanding > 0 ? `${money(outstanding)} outstanding.` : "Nothing outstanding."}</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="trending-up" title="No invoices yet" body="Create a deposit invoice from an accepted proposal." />
        ) : (
          <div className={styles.rows}>
            {rows.map((i) => (
              <Card key={i.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{money(i.amount)}</span>
                    <span className={styles.rowMeta}>{(i.clients as unknown as { company: string } | null)?.company ?? i.client_id}</span>
                    <span className={styles.rowMeta}>{i.type}</span>
                    <Badge tone={toneFor(i.status)} dot>{i.status}</Badge>
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
