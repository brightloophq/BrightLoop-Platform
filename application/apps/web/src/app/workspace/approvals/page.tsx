/**
 * Needs your okay — Approval & Decision Queue (Phase F, aligned to
 * docs/design/source 12-Approval-Workspace). Each item is a Move awaiting your
 * decision; open its brief to review Why → Evidence → What changes → Reversibility
 * before approving. Powered by the existing agent approval queue (`loadApprovals`).
 * The decision itself runs through the agent approval use-case on the mission.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon, SectionRule } from "@brightloop/ui";
import { loadApprovals } from "@/lib/workspace-data";
import styles from "../pages.module.css";

const classLabel: Record<string, string> = {
  plan_approval: "Approve the plan",
  workflow_publish: "Publish this automation",
  deployment_package: "Approve this deployment",
  external_side_effect: "Approve a live change",
  high_risk: "High-impact decision",
  cost_threshold: "Spend approval",
  privileged: "Privileged action",
};

export default async function ApprovalsPage() {
  const data = await loadApprovals();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.stateLine}><span className={styles.stateDot} data-state={data.approvals.length > 0 ? "warn" : "ok"} /> {data.approvals.length} await you</div>
          <h1 className={styles.pageTitle}>Needs your okay</h1>
          <p className={styles.pageSub}>Each item is a Move your AI team wants to make. Open the brief to see why, the evidence, and exactly what changes — every action is reversible.</p>
        </div>
      </div>

      <SectionRule index="01" label="Decision queue" meta={`${data.approvals.length} open`} />
      {data.approvals.length === 0 ? <EmptyState icon="check-circle" title="You're all caught up" body="Nothing needs your decision right now. Moves your AI team wants to make will appear here." />
        : <>
            <div className={styles.list}>{data.approvals.map((a) => (
              <Link key={`${a.missionId}:${a.taskKey}`} href={`/workspace/missions/${a.missionId}`} className={styles.moveRow}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{classLabel[a.approvalClass] ?? a.approvalClass.replace(/_/g, " ")}</div>
                  <div className={styles.rowMeta}>{a.missionTitle} · review the brief before you decide</div>
                </div>
                <div className={styles.rowRight}><Badge tone="warning" dot>Awaiting you</Badge><Icon name="chevron-right" size={15} /></div>
              </Link>))}</div>
            <p className={styles.decisionFoot}><Icon name="check-circle" size={13} /> Simulate before you approve · a single okay within your authority · fully reversible.</p>
          </>}
    </>
  );
}
