/**
 * Execution Monitor (Phase F · Sprint F3). Normalized runtime executions —
 * running, succeeded, failed, retried — from `loadExecutions()`. Read-only.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadExecutions } from "@/lib/runtime-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const tone = (s: string): "success" | "danger" | "warning" | "blue" | "neutral" =>
  s === "succeeded" ? "success" : s === "failed" ? "danger" : s === "running" || s === "waiting" ? "blue" : s === "cancelled" ? "neutral" : "warning";

export default async function ExecutionsPage() {
  const data = await loadExecutions();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Executions</h1><p className={styles.pageSub}>Runtime executions of your active deployments, reconciled from the runtime by webhook + polling.</p></div>
      </div>
      {data.executions.length === 0
        ? <EmptyState icon="activity" title="No executions yet" body="When your active workflows run, their executions appear here with status, duration and failures." />
        : <div className={styles.list}>{data.executions.map((e) => (
            <Link key={e.id} href={`/workspace/executions/${e.id}`} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}><Icon name="activity" size={15} /> {e.externalExecutionId}</div>
                <div className={styles.rowMeta}>{e.triggerType ?? "trigger"} · {e.durationMs}ms{e.retryNumber > 0 ? ` · retry ${e.retryNumber}` : ""}{e.failureCategory ? ` · ${e.failureCategory}` : ""} · {e.createdAt}</div>
              </div>
              <div className={styles.rowRight}><Badge tone={tone(e.status)}>{e.status}</Badge></div>
            </Link>))}</div>}
    </>
  );
}
