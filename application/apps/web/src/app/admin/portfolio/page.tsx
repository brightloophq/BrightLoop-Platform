import Link from "next/link";
import type { Metadata } from "next";
import { PUBLISH, type PublishStatus } from "@brightloop/schema";
import { disclosedMetrics } from "@brightloop/domain";
import { toPortfolioProject } from "@brightloop/data";
import { Alert, Badge, Button, Card, EmptyState } from "@brightloop/ui";
import { createClient } from "@/lib/supabase/server";
import { ModerationControls } from "../reviews/ModerationControls";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Portfolio" };
export const dynamic = "force-dynamic";

/**
 * Reputation CMS → Projects (handoff §08).
 *
 * Reads through the SESSION client, so an internal role sees drafts and private
 * rows via the `*_internal_read` policy — the public anon client cannot.
 *
 * Each row shows its metric-disclosure state explicitly, because that is the
 * single most consequential and least visible property a case study has: it
 * decides whether the public Results panel shows numbers or the honest
 * "kept private at the client's request" state.
 */
export default async function AdminPortfolioPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_projects")
    .select("*")
    .order("order", { ascending: true });

  const projects = (data ?? []).map(toPortfolioProject);
  const live = projects.filter((p) => PUBLISH[p.publish].public).length;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Portfolio</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Case studies</h2>
            <p className={styles.lede}>
              {projects.length} total · {live} live. Only <strong>Public</strong> and{" "}
              <strong>Featured</strong> projects appear on the site, in the sitemap, or in structured
              data.
            </p>
          </div>
          <Button variant="primary" size="md" asChild>
            <Link href="/admin/portfolio/new">New case study</Link>
          </Button>
        </div>

        {error ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Couldn't load projects">
              {error.message}. If this says permission denied, the custom access token hook may not
              be registered — your JWT would carry no role and every policy denies.
            </Alert>
          </div>
        ) : null}

        {projects.length === 0 ? (
          <EmptyState
            icon="star"
            title="No case studies yet"
            body="Add your first one. It saves as a draft — nothing reaches the public site until you publish it."
            action={
              <Button variant="primary" size="md" asChild>
                <Link href="/admin/portfolio/new">New case study</Link>
              </Button>
            }
          />
        ) : (
          <div className={styles.rows}>
            {projects.map((p) => {
              const meta = PUBLISH[p.publish as PublishStatus];
              const metrics = disclosedMetrics(p);
              return (
                <Card
                  key={p.id}
                  className={[styles.row, meta.public ? styles.rowLive : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.rowBody}>
                    <div className={styles.rowTop}>
                      <Link
                        href={`/admin/portfolio/${p.id}`}
                        className={styles.rowName}
                        style={{ textDecoration: "none" }}
                      >
                        {p.name}
                      </Link>
                      <span className={styles.rowMeta}>/{p.slug}</span>
                      <Badge tone={meta.public ? "success" : "warning"} dot>
                        {meta.label}
                      </Badge>
                      {p.featuredOnHome ? <Badge tone="cyan">Home</Badge> : null}
                      {/* Disclosure state is surfaced, not buried — it decides
                          whether the public page shows numbers at all. */}
                      <Badge tone={metrics.length > 0 ? "cyan" : "neutral"}>
                        {metrics.length > 0
                          ? `${metrics.length} result${metrics.length === 1 ? "" : "s"} disclosed`
                          : "Results private"}
                      </Badge>
                    </div>
                    <p className={styles.quote}>{p.summary}</p>
                    <p className={styles.rowMeta} style={{ marginTop: "var(--space-2)" }}>
                      {p.industry} · {p.year} · {p.timeline} ·{" "}
                      <Link href={`/admin/portfolio/${p.id}`}>Edit</Link>
                      {meta.public ? (
                        <>
                          {" · "}
                          <Link href={`/portfolio/${p.slug}`} target="_blank" rel="noopener noreferrer">
                            Preview
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <ModerationControls
                    kind="project"
                    id={p.id}
                    slug={p.slug}
                    publish={p.publish}
                    featuredOnHome={p.featuredOnHome}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
