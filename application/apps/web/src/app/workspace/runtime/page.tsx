/**
 * Runtime Center (Phase F · Sprint F3.5) — a unified operations hub over the F3
 * Execution Runtime: health, active/failed deployments, recent executions, and
 * rollback history in one premium view. Read-only; consumes `loadRuntimeOverview`
 * (getRuntimeOpsDashboard + listRuntimes + listDeployments + listRuntimeExecutions
 * + listRollbackHistory). No new backend.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadRuntimeOverview } from "@/lib/runtime-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const healthTone = (h: string): "success" | "warning" | "danger" | "neutral" =>
  h === "healthy" ? "success" : h === "degraded" ? "warning" : h === "unavailable" || h === "unauthorized" ? "danger" : "neutral";
const depTone = (s: string): "success" | "warning" | "danger" | "neutral" | "blue" =>
  s === "active" ? "success" : s === "failed" ? "danger" : s === "awaiting_approval" ? "warning" : s === "rolled_back" || s === "superseded" || s === "cancelled" ? "neutral" : "blue";
const execTone = (s: string): "success" | "danger" | "blue" | "neutral" | "warning" =>
  s === "succeeded" ? "success" : s === "failed" ? "danger" : s === "running" || s === "waiting" ? "blue" : s === "cancelled" ? "neutral" : "warning";

export default async function RuntimeCenterPage() {
  const data = await loadRuntimeOverview();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;
  const { ops, runtimes, deployments, executions, rollbacks } = data;
  const activeOrFailed = deployments.filter((d) => d.status === "active" || d.status === "failed" || d.status === "awaiting_approval").slice(0, 6);

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Runtime Center</h1><p className={styles.pageSub}>Mission control for your external execution runtimes. Auxion stays the system of record — everything here is governed, idempotent and audited.</p></div>
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metric}><span className={styles.metricValue}>{ops.healthyRuntimes}/{ops.runtimes}</span><span className={styles.metricLabel}>Runtimes healthy</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{ops.activeDeployments}</span><span className={styles.metricLabel}>Active deployments</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{ops.awaitingApproval}</span><span className={styles.metricLabel}>Awaiting approval</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{ops.runningExecutions}</span><span className={styles.metricLabel}>Running now</span></div>
        <div className={styles.metric} data-tone={ops.failedDeployments + ops.failedExecutions > 0 ? "danger" : undefined}><span className={styles.metricValue}>{ops.failedDeployments + ops.failedExecutions}</span><span className={styles.metricLabel}>Failures</span></div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Runtimes</h2><Link className={styles.sectionLink} href="/workspace/runtimes">All runtimes <Icon name="arrow-right" size={13} /></Link></div>
        {runtimes.length === 0 ? <EmptyState icon="workflow" title="No runtimes registered" body="Register an execution runtime (e.g. n8n) to deploy approved automations." />
          : <div className={styles.list}>{runtimes.slice(0, 5).map((r) => (
              <Link key={r.id} href={`/workspace/runtimes/${r.id}`} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}><Icon name="git-branch" size={15} /> {r.displayName}</div><div className={styles.rowMeta}>{r.provider} · {r.environment} · {r.supportedCapabilities.length} capabilities</div></div>
                <div className={styles.rowRight}><Badge tone={healthTone(r.healthState)}>{r.healthState}</Badge></div>
              </Link>))}</div>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Deployments needing attention</h2><Link className={styles.sectionLink} href="/workspace/deployments">Deployment Center <Icon name="arrow-right" size={13} /></Link></div>
        {activeOrFailed.length === 0 ? <EmptyState icon="rocket" title="Nothing to attend to" body="Active, failed and pending-approval deployments show here." />
          : <div className={styles.list}>{activeOrFailed.map((d) => (
              <Link key={d.id} href={`/workspace/deployments/${d.id}`} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}><Icon name="rocket" size={15} /> Deployment v{d.deploymentVersion}</div><div className={styles.rowMeta}>{d.targetEnvironment} · {d.provider} · hash {d.packageHash.slice(0, 10)}</div></div>
                <div className={styles.rowRight}><Badge tone={depTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge></div>
              </Link>))}</div>}
      </div>

      <div className={styles.grid2}>
        <div className={styles.section}>
          <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Recent executions</h2><Link className={styles.sectionLink} href="/workspace/executions">All <Icon name="arrow-right" size={13} /></Link></div>
          {executions.length === 0 ? <EmptyState icon="activity" title="No executions yet" body="Runs of your active workflows appear here." />
            : <div className={styles.list}>{executions.slice(0, 5).map((e) => (
                <Link key={e.id} href={`/workspace/executions/${e.id}`} className={styles.row}>
                  <div className={styles.rowMain}><div className={styles.rowTitle}>{e.externalExecutionId}</div><div className={styles.rowMeta}>{e.triggerType ?? "trigger"} · {e.durationMs}ms</div></div>
                  <div className={styles.rowRight}><Badge tone={execTone(e.status)}>{e.status}</Badge></div>
                </Link>))}</div>}
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Rollback history</h2></div>
          {rollbacks.length === 0 ? <EmptyState icon="arrow-left" title="No rollbacks" body="Rollbacks to previous immutable versions are recorded here." />
            : <div className={styles.list}>{rollbacks.slice(0, 5).map((r) => (
                <div key={r.id} className={styles.row}>
                  <div className={styles.rowMain}><div className={styles.rowTitle}>Rollback</div><div className={styles.rowMeta}>{r.reason} · {r.createdAt}</div></div>
                  <div className={styles.rowRight}><Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "blue"}>{r.status}</Badge></div>
                </div>))}</div>}
        </div>
      </div>
    </>
  );
}
