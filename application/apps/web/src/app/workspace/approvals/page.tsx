/**
 * Approval Center (Phase F · Sprint F1). Centralizes the approvals awaiting the
 * client across missions, from `loadApprovals()` (agent approval queues). The
 * decision action itself runs through the existing agent approval use-case in a
 * follow-up; this sprint surfaces the queue + details (see report §35).
 */

import Link from "next/link";
import { Badge, EmptyState } from "@brightloop/ui";
import { loadApprovals } from "@/lib/workspace-data";
import styles from "../pages.module.css";

export default async function ApprovalsPage() {
  const data = await loadApprovals();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Approvals</h1><p className={styles.pageSub}>Decisions waiting for you — plan approvals, workflow publishes, and privileged actions.</p></div></div>
      {data.approvals.length === 0 ? <EmptyState icon="check-circle" title="Nothing to approve" body="You’re all caught up. Approvals your AI team needs will appear here." />
        : <div className={styles.list}>{data.approvals.map((a) => (
            <Link key={`${a.missionId}:${a.taskKey}`} href={`/workspace/missions/${a.missionId}`} className={styles.row}>
              <div className={styles.rowMain}><div className={styles.rowTitle}>{a.approvalClass.replace(/_/g, " ")}</div><div className={styles.rowMeta}>{a.missionTitle} · task {a.taskKey}</div></div>
              <div className={styles.rowRight}><Badge tone="warning">Pending</Badge></div>
            </Link>))}</div>}
    </>
  );
}
