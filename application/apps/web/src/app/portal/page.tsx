import Link from "next/link";
import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Button, Card, EmptyState, Icon, Progress, Stat } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../admin/cms.module.css";
import shell from "../admin/admin.module.css";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * Client dashboard (handoff §07).
 *
 * The heart of it is the ACTION CARDS — the things awaiting the client's
 * decision. That is what drives re-entry (§07). Everything here is RLS-scoped to
 * the caller's own org; there is no client_id filter in the queries because the
 * database applies it.
 */
export default async function PortalDashboard() {
  const supabase = await createClient();

  const [{ data: clients }, { data: projects }, { data: deliverables }, { data: milestones }, { data: invoices }] =
    await Promise.all([
      supabase.from("clients").select("company, health_score").limit(1),
      supabase.from("projects").select("*"),
      supabase.from("deliverables").select("id, title, status, project_id").eq("status", "in_review"),
      supabase.from("milestones").select("id, title, status").eq("status", "waiting_client_approval"),
      supabase.from("invoices").select("id, amount, status, type").in("status", ["sent", "pending", "overdue"]),
    ]);

  const org = clients?.[0];
  const project = projects?.[0];
  const awaitingDeliverables = deliverables ?? [];
  const awaitingMilestones = milestones ?? [];
  const openInvoices = invoices ?? [];
  const overdue = openInvoices.filter((i) => i.status === "overdue");

  const actionCount = awaitingDeliverables.length + awaitingMilestones.length + openInvoices.length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{org?.company ?? "Your dashboard"}</h1>
      </div>

      <div className={shell.content}>
        {/* ---- project status banner ---- */}
        {project ? (
          <Card style={{ marginBottom: "var(--space-6)" }}>
            <div className={styles.rowTop}>
              <span className={styles.rowName}>{project.name}</span>
              <Badge tone={toneFor(project.status)} dot>
                {project.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Progress
                value={Number(project.progress)}
                label={`${Math.round(Number(project.progress))}% complete`}
              />
            </div>
            {project.status === "paused" || project.status === "delayed" ? (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Alert tone="warning" title={`Project ${project.status}`}>
                  Your project is currently {project.status}. Your team will be in touch with a
                  revised timeline.
                </Alert>
              </div>
            ) : null}
          </Card>
        ) : (
          <div style={{ marginBottom: "var(--space-6)" }}>
            <Alert tone="neutral" title="Your project hasn't started yet">
              Once kickoff happens, you&apos;ll track progress, approve work and see everything here.
            </Alert>
          </div>
        )}

        {/* ---- KPI row ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--space-4)",
            marginBottom: "var(--space-6)",
          }}
        >
          <Card>
            <Stat value={project ? `${Math.round(Number(project.progress))}%` : "—"} label="Project progress" />
          </Card>
          <Card>
            <Stat value={awaitingDeliverables.length + awaitingMilestones.length} label="Awaiting your approval" accent />
          </Card>
          <Card>
            <Stat value={openInvoices.length} label="Open invoices" />
          </Card>
          <Card>
            <Stat value={org?.health_score != null ? Number(org.health_score).toFixed(0) : "—"} label="Health score" />
          </Card>
        </div>

        {/* ---- ACTION CARDS ---- */}
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Needs your attention</h2>
            <p className={styles.lede}>
              {actionCount === 0 ? "You're all caught up." : `${actionCount} thing${actionCount === 1 ? "" : "s"} waiting on you.`}
            </p>
          </div>
        </div>

        {overdue.length > 0 ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Overdue invoice">
              You have an overdue invoice. Please settle it to avoid a hold on your project.
            </Alert>
          </div>
        ) : null}

        {actionCount === 0 ? (
          <EmptyState icon="check-circle" title="All caught up" body="Nothing needs your decision right now." />
        ) : (
          <div className={styles.rows}>
            {awaitingDeliverables.map((d) => (
              <Card key={d.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Icon name="check" size={15} />
                    <span className={styles.rowName}>{d.title}</span>
                    <Badge tone="warning" dot>
                      awaiting approval
                    </Badge>
                  </div>
                  <p className={styles.rowMeta}>A deliverable is ready for your review.</p>
                </div>
                <Button variant="primary" size="sm" asChild>
                  <Link href={`/portal/deliverables/${d.id}`}>Review</Link>
                </Button>
              </Card>
            ))}

            {awaitingMilestones.map((m) => (
              <Card key={m.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Icon name="workflow" size={15} />
                    <span className={styles.rowName}>{m.title}</span>
                    <Badge tone="warning" dot>
                      milestone approval
                    </Badge>
                  </div>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/portal/project">Review</Link>
                </Button>
              </Card>
            ))}

            {openInvoices.map((i) => (
              <Card key={i.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Icon name="trending-up" size={15} />
                    <span className={styles.rowName}>{money(i.amount)} {i.type} invoice</span>
                    <Badge tone={toneFor(i.status)} dot>
                      {i.status}
                    </Badge>
                  </div>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/portal/invoices">View</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
