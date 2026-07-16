import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { isPaymentsConfigured } from "@/lib/payments";
import { PayButton } from "./PayButton";
import styles from "../../admin/cms.module.css";
import shell from "../../admin/admin.module.css";

const PAYABLE = new Set(["sent", "pending", "overdue", "failed"]);

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

/**
 * Invoices (handoff §07) — read-only view of the client's own invoices.
 *
 * PAYING is deliberately not here. Stripe payment is Sprint 6; showing a "Pay"
 * button that does nothing would be worse than saying plainly it's coming. RLS
 * scopes these to the caller's org.
 */
export default async function PortalInvoicesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("issued_at", { ascending: false, nullsFirst: false });

  const invoices = data ?? [];
  const overdue = invoices.some((i) => i.status === "overdue");

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Invoices</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Your invoices</h2>
            <p className={styles.lede}>Your billing history and anything outstanding.</p>
          </div>
        </div>

        {overdue ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="You have an overdue invoice">
              Please settle it to avoid a hold on your project.
            </Alert>
          </div>
        ) : null}

        {!isPaymentsConfigured() ? (
          <div className={styles.notice}>
            <Alert tone="info" title="Card payments run in test mode">
              You can settle invoices here now; live card processing switches on at go-live. No real
              charge is made in test mode.
            </Alert>
          </div>
        ) : null}

        {error ? (
          <Card>
            <p className={styles.rowMeta}>Couldn&apos;t load invoices: {error.message}</p>
          </Card>
        ) : invoices.length === 0 ? (
          <EmptyState icon="trending-up" title="No invoices yet" body="Invoices appear here as your engagement progresses." />
        ) : (
          <div className={styles.rows}>
            {invoices.map((i) => (
              <Card key={i.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{money(i.amount)}</span>
                    <span className={styles.rowMeta}>{i.type}</span>
                    {i.due_date ? <span className={styles.rowMeta}>due {i.due_date}</span> : null}
                    <Badge tone={toneFor(i.status)} dot>
                      {i.status}
                    </Badge>
                  </div>
                </div>
                {PAYABLE.has(i.status) ? <PayButton invoiceId={i.id} /> : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
