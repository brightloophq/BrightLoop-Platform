/**
 * Deployment Center (Phase F · Sprint F3). Governed runtime deployments across the
 * lifecycle — awaiting approval, queued, deploying, active, failed, rolled back —
 * from `loadDeployments()`. Read-only list; actions live on the detail page.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadDeployments } from "@/lib/runtime-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const statusTone = (s: string): "success" | "warning" | "danger" | "neutral" | "blue" =>
  s === "active" ? "success" : s === "failed" ? "danger" : s === "awaiting_approval" ? "warning" : s === "rolled_back" || s === "superseded" || s === "cancelled" ? "neutral" : "blue";

export default async function DeploymentsPage() {
  const data = await loadDeployments();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Deployments</h1><p className={styles.pageSub}>Governed deployments of approved automations to your runtimes. Every deploy is approval-gated, idempotent and audited.</p></div>
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metric}><span className={styles.metricValue}>{data.ops.activeDeployments}</span><span className={styles.metricLabel}>Active</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{data.ops.awaitingApproval}</span><span className={styles.metricLabel}>Awaiting approval</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{data.ops.failedDeployments}</span><span className={styles.metricLabel}>Failed</span></div>
      </div>

      {data.deployments.length === 0
        ? <EmptyState icon="rocket" title="No deployments yet" body="Once an automation package is approved, deploy it to a runtime from your AI team. Deployments appear here." />
        : <div className={styles.list}>{data.deployments.map((d) => (
            <Link key={d.id} href={`/workspace/deployments/${d.id}`} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}><Icon name="rocket" size={15} /> Deployment v{d.deploymentVersion}</div>
                <div className={styles.rowMeta}>{d.targetEnvironment} · {d.provider} · hash {d.packageHash.slice(0, 10)} · {d.deployedAt ? `deployed ${d.deployedAt}` : "not yet deployed"}</div>
              </div>
              <div className={styles.rowRight}>
                {d.activationState === "active" && <Badge tone="success">active</Badge>}
                <Badge tone={statusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
              </div>
            </Link>))}</div>}
    </>
  );
}
