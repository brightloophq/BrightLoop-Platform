import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { moveLeadStage } from "../delivery-actions";
import { StageControl } from "../StageControl";
import { NewLeadForm } from "./NewLeadForm";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * Leads / CRM (handoff §08).
 *
 * The pipeline stage moves through the guarded transition service — legal moves
 * only, every move audited. new→proposal_sent is impossible: the machine
 * requires qualifying first, so it isn't even offered in the dropdown.
 *
 * Leads are internal-only: RLS gives no client role any access to this table.
 */
export default async function LeadsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const leads = data ?? [];
  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Leads</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Pipeline</h2>
            <p className={styles.lede}>
              {leads.length} total · {open} open. Stage moves are guarded — a lead must be qualified
              before a proposal, and every move is recorded in the audit log.
            </p>
          </div>
          <NewLeadForm />
        </div>

        {error ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Couldn't load leads">
              {error.message}
            </Alert>
          </div>
        ) : null}

        {leads.length === 0 ? (
          <EmptyState
            icon="route"
            title="No leads yet"
            body="Add your first lead to start the pipeline."
          />
        ) : (
          <div className={styles.rows}>
            {leads.map((lead) => (
              <Card key={lead.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{lead.name}</span>
                    {lead.company ? <span className={styles.rowMeta}>{lead.company}</span> : null}
                    <Badge tone={toneFor(lead.stage)} dot>
                      {lead.stage.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className={styles.rowMeta}>
                    {lead.email}
                    {lead.industry ? ` · ${lead.industry}` : ""}
                    {lead.value ? ` · ${money(lead.value)}` : ""}
                    {lead.source ? ` · ${lead.source}` : ""}
                  </p>
                </div>

                <StageControl
                  machine="lead"
                  entityId={lead.id}
                  current={lead.stage}
                  action={moveLeadStage}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
