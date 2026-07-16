import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, EmptyState, Icon, Progress } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import {
  moveDeliverableStatus,
  moveMilestoneStatus,
  moveProjectStatus,
} from "../../delivery-actions";
import { StageControl } from "../../StageControl";
import { AddDeliverable, AddMilestone } from "./AddForms";
import styles from "../../cms.module.css";
import shell from "../../admin.module.css";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Project detail (handoff §08) — the delivery spine.
 *
 * Project → Milestone → Deliverable, each governed by its own machine and each
 * status move going through the guarded, audited transition service. Project
 * progress is derived from milestone completion, recomputed on every change.
 *
 * paused/delayed capture a required reason + revised date (handoff §08); the
 * StageControl surfaces those fields only for those targets.
 */
export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [{ data: client }, { data: milestones }, { data: deliverables }] = await Promise.all([
    supabase.from("clients").select("id, company").eq("id", project.client_id).maybeSingle(),
    supabase.from("milestones").select("*").eq("project_id", id).order("order", { ascending: true }),
    supabase.from("deliverables").select("*").eq("project_id", id),
  ]);

  const ms = milestones ?? [];
  const dv = deliverables ?? [];

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{project.name}</h1>
      </div>

      <div className={shell.content}>
        <Link
          href="/admin/projects"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: "var(--text-muted)", textDecoration: "none", fontSize: "var(--fs-sm)", marginBottom: "var(--space-5)" }}
        >
          <Icon name="arrow-left" size={14} />
          All projects
        </Link>

        {/* ---- project header + status ---- */}
        <Card style={{ marginBottom: "var(--space-6)" }}>
          <div className={styles.rowTop}>
            <span className={styles.rowName}>{project.name}</span>
            {client ? (
              <Link href={`/admin/clients/${client.id}`} className={styles.rowMeta}>
                {client.company}
              </Link>
            ) : null}
          </div>
          <div style={{ margin: "var(--space-3) 0" }}>
            <Progress value={Number(project.progress)} label={`${Math.round(Number(project.progress))}% complete`} />
          </div>
          <StageControl
            machine="project"
            entityId={project.id}
            current={project.status}
            action={moveProjectStatus}
            reasonFor={["paused", "delayed"]}
            dateFor={["delayed", "active"]}
          />
        </Card>

        {/* ---- milestones ---- */}
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Milestones</h2>
            <p className={styles.lede}>
              Progress is computed from these. A milestone can&apos;t complete without client
              approval — the machine won&apos;t offer it.
            </p>
          </div>
          <AddMilestone projectId={project.id} />
        </div>

        {ms.length === 0 ? (
          <EmptyState icon="check" title="No milestones yet" body="Add milestones to structure the delivery." />
        ) : (
          <div className={styles.rows}>
            {ms.map((m) => (
              <Card key={m.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{m.title}</span>
                    {m.due_date ? <span className={styles.rowMeta}>due {m.due_date}</span> : null}
                    {m.status === "waiting_client_approval" ? (
                      <Badge tone="warning" dot>
                        awaiting client
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <StageControl
                  machine="milestone"
                  entityId={m.id}
                  current={m.status}
                  action={moveMilestoneStatus}
                  extraFields={{ projectId: project.id }}
                />
              </Card>
            ))}
          </div>
        )}

        {/* ---- deliverables (review queue) ---- */}
        <div className={styles.head} style={{ marginTop: "var(--space-7)" }}>
          <div>
            <h2 className={styles.title}>Deliverables</h2>
            <p className={styles.lede}>
              Submit work for client approval. Revision or rejection bumps the version and reopens
              submission — the client approval loop itself lives in the portal (Sprint 7).
            </p>
          </div>
          <AddDeliverable projectId={project.id} milestones={ms.map((m) => ({ id: m.id, title: m.title }))} />
        </div>

        {dv.length === 0 ? (
          <EmptyState icon="search" title="No deliverables yet" body="Add deliverables and submit them for approval." />
        ) : (
          <div className={styles.rows}>
            {dv.map((d) => (
              <Card key={d.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{d.title}</span>
                    {d.type ? <span className={styles.rowMeta}>{d.type}</span> : null}
                    <span className={styles.rowMeta}>v{d.version}</span>
                  </div>
                  {d.feedback ? (
                    <p className={styles.rowMeta} style={{ marginTop: "var(--space-2)" }}>
                      Feedback: {d.feedback}
                    </p>
                  ) : null}
                </div>
                <StageControl
                  machine="deliverable"
                  entityId={d.id}
                  current={d.status}
                  action={moveDeliverableStatus}
                  extraFields={{ projectId: project.id }}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
