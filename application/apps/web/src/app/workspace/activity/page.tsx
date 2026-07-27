/**
 * Activity feed (Phase F · Sprint F1). A unified, chronological timeline derived
 * from existing read-model data — missions, reports, automations. No new events
 * backend; the feed is composed from what the client can already see.
 */

import { EmptyState } from "@brightloop/ui";
import { loadWorkspaceDashboard } from "@/lib/workspace-data";
import styles from "../pages.module.css";

interface Event { at: string; type: string; text: string }

export default async function ActivityPage() {
  const data = await loadWorkspaceDashboard();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  const events: Event[] = [
    ...data.missions.map((m) => ({ at: m.updatedAt, type: "Mission", text: `${m.title} — ${m.status.replace(/_/g, " ")}` })),
    ...data.reports.map((r) => ({ at: r.updatedAt, type: "Report", text: `${r.title} — ${r.status}` })),
    ...data.intents.map((i) => ({ at: i.createdAt, type: "Automation", text: `${i.title} — ${i.status.replace(/_/g, " ")}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Activity</h1><p className={styles.pageSub}>Everything happening across your workspace.</p></div></div>
      {events.length === 0 ? <EmptyState icon="activity" title="No activity yet" body="Strategy, plans, reports and agent actions will stream here as your workspace comes to life." />
        : <div className={styles.timeline}>{events.slice(0, 60).map((e, i) => (
            <div key={i} className={styles.tlRow}><span className={styles.tlDot} /><div className={styles.tlBody}><div className={styles.tlType}>{e.type}</div><div className={styles.tlText}>{e.text}</div></div></div>))}</div>}
    </>
  );
}
