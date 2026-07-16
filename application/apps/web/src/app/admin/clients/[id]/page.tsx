import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState, Icon, Stat } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { may } from "@brightloop/domain";
import { createClient } from "@/lib/supabase/server";
import { NewProjectForm } from "./NewProjectForm";
import styles from "../../cms.module.css";
import shell from "../../admin.module.css";

export const metadata: Metadata = { title: "Client" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** Client detail (handoff §08) — overview, projects, and finance where permitted. */
export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const actor = await getActor();
  const supabase = await createClient();

  const [{ data: client }, { data: projects }, { data: users }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("projects").select("id, name, status, progress").eq("client_id", id),
    supabase.from("users").select("id, name, email, role, status").eq("client_id", id),
  ]);

  if (!client) notFound();
  const canFinance = actor ? may(actor, "finance.read") : false;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{client.company}</h1>
      </div>

      <div className={shell.content}>
        <Link
          href="/admin/clients"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: "var(--text-muted)", textDecoration: "none", fontSize: "var(--fs-sm)", marginBottom: "var(--space-5)" }}
        >
          <Icon name="arrow-left" size={14} />
          All clients
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
          <Card>
            <Stat value={<Badge tone={toneFor(client.lifecycle)} dot>{client.lifecycle.replace(/_/g, " ")}</Badge>} label="Lifecycle" />
          </Card>
          <Card>
            <Stat value={client.industry || "—"} label="Industry" />
          </Card>
          <Card>
            <Stat value={`${client.seats}`} label="Seats" />
          </Card>
          {/* MRR only for finance-capable roles (handoff §08 permissions). */}
          {canFinance ? (
            <Card>
              <Stat value={money(client.mrr)} label="MRR" accent />
            </Card>
          ) : null}
        </div>

        {/* ---- projects ---- */}
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Projects</h2>
            <p className={styles.lede}>Delivery work for this client.</p>
          </div>
          <NewProjectForm clientId={client.id} />
        </div>

        {(projects ?? []).length === 0 ? (
          <EmptyState icon="workflow" title="No projects yet" body="Create the first project for this client." />
        ) : (
          <div className={styles.rows}>
            {(projects ?? []).map((p) => (
              <Card key={p.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Link href={`/admin/projects/${p.id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                      {p.name}
                    </Link>
                    <Badge tone={toneFor(p.status)} dot>
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                    <span className={styles.rowMeta}>{Math.round(Number(p.progress))}% complete</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ---- seats / team ---- */}
        <div className={styles.head} style={{ marginTop: "var(--space-7)" }}>
          <div>
            <h2 className={styles.title}>Team</h2>
            <p className={styles.lede}>Users belonging to this client organisation.</p>
          </div>
        </div>
        {(users ?? []).length === 0 ? (
          <Alert tone="neutral" title="No client users yet">
            Client users are created at account activation, when the client sets a password and
            invites their team.
          </Alert>
        ) : (
          <div className={styles.rows}>
            {(users ?? []).map((u) => (
              <Card key={u.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName}>{u.name}</span>
                    <span className={styles.rowMeta}>{u.email}</span>
                    <Badge tone="neutral">{u.role}</Badge>
                    <Badge tone={u.status === "active" ? "success" : "warning"}>{u.status}</Badge>
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
