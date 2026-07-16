import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { may } from "@brightloop/domain";
import { Alert, Badge, Card, EmptyState, Progress } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MilestoneApproval } from "./MilestoneApproval";
import styles from "../../admin/cms.module.css";
import shell from "../../admin/admin.module.css";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

/**
 * Project progress + milestones (handoff §07).
 *
 * A milestone waiting_client_approval surfaces the approval action for
 * client_admin. Everything is RLS-scoped to the caller's org.
 */
export default async function PortalProjectPage() {
  const actor = await getActor();
  const supabase = await createClient();

  const { data: projects } = await supabase.from("projects").select("*").limit(1);
  const project = projects?.[0];

  const { data: milestones } = project
    ? await supabase.from("milestones").select("*").eq("project_id", project.id).order("order", { ascending: true })
    : { data: [] };

  const ms = milestones ?? [];
  const canApprove = actor ? may(actor, "own.deliverables.approve") : false;

  if (!project) {
    return (
      <>
        <div className={shell.topbar}>
          <h1 className={shell.topTitle}>Project</h1>
        </div>
        <div className={shell.content}>
          <EmptyState icon="workflow" title="No project yet" body="Your project appears here once it kicks off." />
        </div>
      </>
    );
  }

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{project.name}</h1>
      </div>

      <div className={shell.content}>
        <Card style={{ marginBottom: "var(--space-6)" }}>
          <div className={styles.rowTop}>
            <span className={styles.rowName}>{project.name}</span>
            <Badge tone={toneFor(project.status)} dot>
              {project.status.replace(/_/g, " ")}
            </Badge>
            {project.target_date ? <span className={styles.rowMeta}>target {project.target_date}</span> : null}
          </div>
          <div style={{ marginTop: "var(--space-3)" }}>
            <Progress value={Number(project.progress)} label={`${Math.round(Number(project.progress))}% complete`} />
          </div>
        </Card>

        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Milestones</h2>
            <p className={styles.lede}>Your project, step by step. Approve a milestone when it&apos;s ready.</p>
          </div>
        </div>

        {ms.length === 0 ? (
          <EmptyState icon="check" title="No milestones yet" body="Your team will lay these out at kickoff." />
        ) : (
          <div className={styles.rows}>
            {ms.map((m) => {
              const waiting = m.status === "waiting_client_approval";
              return (
                <Card key={m.id} className={[styles.row, waiting ? styles.rowLive : null].filter(Boolean).join(" ")}>
                  <div className={styles.rowBody} style={{ width: "100%" }}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowName}>{m.title}</span>
                      {m.due_date ? <span className={styles.rowMeta}>due {m.due_date}</span> : null}
                      <Badge tone={toneFor(m.status)} dot>
                        {m.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    {waiting && canApprove ? (
                      <MilestoneApproval milestoneId={m.id} />
                    ) : waiting ? (
                      <p className={styles.rowMeta} style={{ marginTop: "var(--space-2)" }}>
                        Waiting on an account admin to approve.
                      </p>
                    ) : m.status === "revision_requested" ? (
                      <Alert tone="warning" title="Revision requested">
                        The team is working on your requested changes.
                      </Alert>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
