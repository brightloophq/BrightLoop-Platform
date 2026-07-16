import Link from "next/link";
import type { Metadata } from "next";
import { toneFor } from "@brightloop/schema";
import { Alert, Badge, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

/**
 * Projects — cross-client delivery list (handoff §08).
 *
 * Status moves happen on the project detail page, where paused/delayed can
 * capture the required reason + revised date. This is the overview.
 */
export default async function ProjectsPage() {
  const supabase = await createClient();
  const [{ data: projects, error }, { data: clients }] = await Promise.all([
    supabase.from("projects").select("*").order("target_date", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("id, company"),
  ]);

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.company]));
  const list = projects ?? [];
  const inFlight = list.filter((p) => ["active", "in_review", "delayed", "paused"].includes(p.status)).length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Projects</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Delivery</h2>
            <p className={styles.lede}>
              {list.length} total · {inFlight} in flight. Create projects from a client&apos;s page;
              open one to move its status or manage milestones.
            </p>
          </div>
        </div>

        {error ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Couldn't load projects">
              {error.message}
            </Alert>
          </div>
        ) : null}

        {list.length === 0 ? (
          <EmptyState
            icon="workflow"
            title="No projects yet"
            body="Projects are created from a client's page. Open a client to add one."
            action={
              <Link href="/admin/clients" style={{ color: "var(--text-link)" }}>
                Go to clients →
              </Link>
            }
          />
        ) : (
          <div className={styles.rows}>
            {list.map((p) => (
              <Card key={p.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <Link href={`/admin/projects/${p.id}`} className={styles.rowName} style={{ textDecoration: "none" }}>
                      {p.name}
                    </Link>
                    <span className={styles.rowMeta}>{clientName.get(p.client_id) ?? "—"}</span>
                    <Badge tone={toneFor(p.status)} dot>
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                    <span className={styles.rowMeta}>{Math.round(Number(p.progress))}%</span>
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
