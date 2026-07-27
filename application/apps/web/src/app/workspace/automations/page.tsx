/**
 * Automation view (Phase F · Sprint F1). Execution intents + workflow status from
 * `loadAutomations()`. This surface NEVER deploys workflows — read-only.
 */

import { Badge, EmptyState } from "@brightloop/ui";
import { loadAutomations } from "@/lib/workspace-data";
import styles from "../pages.module.css";

export default async function AutomationsPage() {
  const data = await loadAutomations();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Automations</h1><p className={styles.pageSub}>Automation-ready workflows generated from your approved plans. Prepared, never auto-deployed.</p></div></div>
      {data.intents.length === 0 ? <EmptyState icon="workflow" title="No automations yet" body="Once an execution plan is approved, your Automation Engineer prepares workflows here." />
        : <div className={styles.list}>{data.intents.map((i) => (
            <div key={i.id} className={styles.row}>
              <div className={styles.rowMain}><div className={styles.rowTitle}>{i.title}</div><div className={styles.rowMeta}>{i.stepCount} steps · {i.branchCount} branches · {i.variableCount} variables</div></div>
              <div className={styles.rowRight}><Badge status={i.status}>{i.status.replace(/_/g, " ")}</Badge></div>
            </div>))}</div>}
    </>
  );
}
