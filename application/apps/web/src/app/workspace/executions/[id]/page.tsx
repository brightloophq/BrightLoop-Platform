/**
 * Execution Detail (Phase F · Sprint F3). A runtime execution with its normalized
 * failures + attempt count. Read-only; safe messages only (no provider bodies).
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadExecutionDetail } from "@/lib/runtime-data";
import styles from "../../pages.module.css";

export const dynamic = "force-dynamic";

export default async function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadExecutionDetail(id);
  if (data === null) return <EmptyState icon="lock" title="Execution not found" body="It may have been removed, or you may not have access." />;
  const { execution: e, failures, attempts } = data;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <Link href="/workspace/executions" className={styles.rowMeta} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="arrow-left" size={13} /> Executions</Link>
          <h1 className={styles.pageTitle}>Execution {e.externalExecutionId}</h1>
          <p className={styles.pageSub}>{e.triggerType ?? "trigger"} · {e.durationMs}ms · {attempts} attempt{attempts === 1 ? "" : "s"} · deployment {e.deploymentId.slice(0, 12)}</p>
        </div>
        <div className={styles.rowRight}><Badge tone={e.status === "succeeded" ? "success" : e.status === "failed" ? "danger" : "blue"}>{e.status}</Badge></div>
      </div>

      {failures.length === 0 ? <p className={styles.rowMeta}>No failures recorded for this execution.</p>
        : <div className={styles.list}>{failures.map((f) => (
            <div key={f.id} className={styles.row}>
              <div className={styles.rowMain}><div className={styles.rowTitle}>{f.category.replace(/_/g, " ")}</div><div className={styles.rowMeta}>{f.message || "—"}{f.lastNode ? ` · at ${f.lastNode}` : ""} · {f.createdAt}</div></div>
              <div className={styles.rowRight}><Badge tone={f.retryable ? "warning" : "danger"}>{f.retryable ? "retryable" : "terminal"}</Badge></div>
            </div>))}</div>}
    </>
  );
}
