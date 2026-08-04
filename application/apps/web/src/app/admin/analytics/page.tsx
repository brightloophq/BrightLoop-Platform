import type { Metadata } from "next";
import { formatRate } from "@brightloop/domain";
import { Alert, Card, Progress, Stat } from "@brightloop/ui";
import { getAnalyticsData } from "@/lib/analytics-data";
import styles from "../cms.module.css";
import shell from "../admin.module.css";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * Admin Analytics (handoff §08 · §25).
 *
 * INTEGRITY: in normal mode every figure is computed from analytics_events
 * (server-emitted, so real not client-inferred) plus live entity counts — no
 * hardcoded number, and an empty database says so. The data is read via
 * `getAnalyticsData()` so the page is unaware of the source; in Demo Mode that
 * seam returns the deterministic demo dataset instead.
 */
export default async function AdminAnalyticsPage() {
  const { funnel, byName, leads, activations, projects, totalEvents, denied } = await getAnalyticsData();

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Analytics</h1>
      </div>

      <div className={shell.content}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>What&apos;s really happening</h2>
            <p className={styles.lede}>
              Every number here is computed from real events and live records — nothing is a demo
              figure. {totalEvents === 0 ? "No events recorded yet." : `${totalEvents} events recorded.`}
            </p>
          </div>
        </div>

        {denied ? (
          <div className={styles.notice}>
            <Alert tone="danger" title="Access denied by the database">
              Your session lacks the analytics scope. If this is unexpected, check the auth hook.
            </Alert>
          </div>
        ) : null}

        {/* ---- entity snapshot ---- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
          <Card><Stat value={leads} label="Leads" /></Card>
          <Card><Stat value={activations} label="Active clients" accent /></Card>
          <Card><Stat value={projects} label="Projects" /></Card>
          <Card><Stat value={totalEvents} label="Events tracked" /></Card>
        </div>

        {/* ---- acquisition funnel ---- */}
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Acquisition funnel</h2>
            <p className={styles.lede}>Assessment → proposal → contract → activation. Rates are stage-over-stage.</p>
          </div>
        </div>
        <div className={styles.rows}>
          {funnel.map((stage) => (
            <Card key={stage.key} className={styles.row}>
              <div className={styles.rowBody} style={{ width: "100%" }}>
                <div className={styles.rowTop}>
                  <span className={styles.rowName}>{stage.label}</span>
                  <span className={styles.rowMeta}>{stage.count}</span>
                  {stage.rate !== null ? (
                    <span className={styles.rowMeta} style={{ color: "var(--text-accent)" }}>
                      {formatRate(stage.rate)} conversion
                    </span>
                  ) : null}
                </div>
                <div style={{ marginTop: "var(--space-2)" }}>
                  <Progress value={funnel[0]!.count > 0 ? (stage.count / funnel[0]!.count) * 100 : 0} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ---- event stream summary ---- */}
        <div className={styles.head} style={{ marginTop: "var(--space-7)" }}>
          <div>
            <h2 className={styles.title}>Event activity</h2>
            <p className={styles.lede}>Server-emitted events by type — the state-truth stream.</p>
          </div>
        </div>
        {Object.keys(byName).length === 0 ? (
          <Alert tone="neutral" title="No events yet">
            Events are recorded as leads move, deliverables are approved, work is published, and so
            on. As you use the platform, this fills with real activity.
          </Alert>
        ) : (
          <div className={styles.rows}>
            {Object.entries(byName)
              .sort((a, b) => b[1] - a[1])
              .map(([name, n]) => (
                <Card key={name} className={styles.row}>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowName} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)" }}>
                        {name}
                      </span>
                      <span className={styles.rowMeta}>{n}</span>
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
