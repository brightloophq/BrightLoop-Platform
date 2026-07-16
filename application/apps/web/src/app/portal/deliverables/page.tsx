import Link from "next/link";
import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../../admin/cms.module.css";
import shell from "../../admin/admin.module.css";

export const metadata: Metadata = { title: "Deliverables" };
export const dynamic = "force-dynamic";

/**
 * Deliverables list (handoff §07) — grouped by status, RLS-scoped to the client.
 * The approve/revision loop lives on the detail page.
 */
export default async function PortalDeliverablesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("*")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  const list = data ?? [];
  const awaiting = list.filter((d) => d.status === "in_review");

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Deliverables</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Your deliverables</h2>
            <p className={styles.lede}>
              {awaiting.length > 0
                ? `${awaiting.length} awaiting your review.`
                : "Nothing awaiting your review right now."}
            </p>
          </div>
        </div>

        {error ? (
          <div className={styles.notice}>
            <Card>
              <p className={styles.rowMeta}>Couldn&apos;t load deliverables: {error.message}</p>
            </Card>
          </div>
        ) : null}

        {list.length === 0 ? (
          <EmptyState
            icon="check"
            title="No deliverables yet"
            body="When your team submits work for review, it appears here for your approval."
          />
        ) : (
          <div className={styles.rows}>
            {list.map((d) => (
              <Card
                key={d.id}
                className={[styles.row, d.status === "in_review" ? styles.rowLive : null].filter(Boolean).join(" ")}
              >
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Link href={`/portal/deliverables/${d.id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                      {d.title}
                    </Link>
                    {d.type ? <span className={styles.rowMeta}>{d.type}</span> : null}
                    <span className={styles.rowMeta}>v{d.version}</span>
                    <Badge tone={toneFor(d.status)} dot>
                      {d.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {d.status === "revision_requested" && d.feedback ? (
                    <p className={styles.rowMeta} style={{ marginTop: "var(--space-2)" }}>
                      Your feedback: {d.feedback}
                    </p>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
