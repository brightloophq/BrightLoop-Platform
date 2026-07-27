/**
 * Report Center (Phase F · Sprint F1). Executive reports from `loadReports()`.
 * (Detail drill-in and filtering are wired in a follow-up; see report §35.)
 */

import { Badge, EmptyState } from "@brightloop/ui";
import { loadReports } from "@/lib/workspace-data";
import styles from "../pages.module.css";

export default async function ReportsPage() {
  const data = await loadReports();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Reports</h1><p className={styles.pageSub}>Executive reporting — metrics, KPIs, forecasts, insights and narratives.</p></div></div>
      {data.reports.length === 0 ? <EmptyState icon="line-chart" title="No reports yet" body="Your AI team generates executive reports from your live workspace activity. They’ll appear here." />
        : <div className={styles.list}>{data.reports.map((r) => (
            <div key={r.id} className={styles.row}>
              <div className={styles.rowMain}><div className={styles.rowTitle}>{r.title}</div><div className={styles.rowMeta}>{r.kind.replace(/_/g, " ")} · {r.period || "—"} · {r.metricCount} metrics · {r.insightCount} insights · {r.forecastCount} forecasts</div></div>
              <div className={styles.rowRight}><Badge tone="neutral">{r.confidence}%</Badge><Badge status={r.status}>{r.status}</Badge></div>
            </div>))}</div>}
    </>
  );
}
