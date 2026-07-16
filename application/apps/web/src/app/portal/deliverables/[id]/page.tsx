import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { may } from "@brightloop/domain";
import { Alert, Badge, Card, Icon, MediaTile } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ApprovalControls } from "../ApprovalControls";
import styles from "../../../admin/cms.module.css";
import shell from "../../../admin/admin.module.css";

export const metadata: Metadata = { title: "Deliverable" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Deliverable detail — the J3 approval loop (handoff §07).
 *
 * client_admin sees Approve / Request revision when the deliverable is in_review.
 * client_member sees a read-only note: they may comment, not approve (§01.3).
 * The distinction is enforced server-side by capability + RLS; the UI only
 * decides what to show.
 */
export default async function PortalDeliverableDetail({ params }: PageProps) {
  const { id } = await params;
  const actor = await getActor();
  const supabase = await createClient();

  const { data: d } = await supabase.from("deliverables").select("*").eq("id", id).maybeSingle();
  if (!d) notFound(); // RLS: a deliverable from another org is indistinguishable from missing

  const canApprove = actor ? may(actor, "own.deliverables.approve") : false;
  const inReview = d.status === "in_review";

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{d.title}</h1>
      </div>

      <div className={shell.content}>
        <Link
          href="/portal/deliverables"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: "var(--text-muted)", textDecoration: "none", fontSize: "var(--fs-sm)", marginBottom: "var(--space-5)" }}
        >
          <Icon name="arrow-left" size={14} />
          All deliverables
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "var(--space-6)", alignItems: "start" }}>
          <div>
            <Card style={{ marginBottom: "var(--space-5)" }}>
              <div className={styles.rowTop}>
                <span className={styles.rowName}>{d.title}</span>
                {d.type ? <span className={styles.rowMeta}>{d.type}</span> : null}
                <span className={styles.rowMeta}>version {d.version}</span>
                <Badge tone={toneFor(d.status)} dot>
                  {d.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <div style={{ marginTop: "var(--space-4)" }}>
                {d.file_url ? (
                  <MediaTile kind="website" label="Open the delivered file" url={d.file_url} />
                ) : (
                  <MediaTile kind="image" label="Preview" slot={`deliverable-${d.id}`} />
                )}
              </div>
            </Card>

            {d.feedback ? (
              <Alert tone="neutral" title="Latest feedback">
                {d.feedback}
              </Alert>
            ) : null}
          </div>

          {/* ---- action rail ---- */}
          <aside>
            <Card>
              <h2 className={styles.title} style={{ fontSize: "var(--fs-h4)", marginBottom: "var(--space-3)" }}>
                Your decision
              </h2>

              {!inReview ? (
                <Alert tone="neutral" title={`This deliverable is ${d.status.replace(/_/g, " ")}`}>
                  {d.status === "final" || d.status === "approved"
                    ? "You've approved this. Nothing more to do."
                    : d.status === "revision_requested"
                      ? "Your revision request is with the team. They'll resubmit a new version."
                      : "It isn't ready for your review yet."}
                </Alert>
              ) : canApprove ? (
                <ApprovalControls deliverableId={d.id} projectId={d.project_id} />
              ) : (
                <Alert tone="neutral" title="Awaiting your team lead">
                  This is ready for review, but only an account admin on your team can approve work.
                  You can discuss it with them.
                </Alert>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
