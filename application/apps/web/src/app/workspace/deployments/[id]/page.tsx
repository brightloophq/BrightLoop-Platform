/**
 * Deployment Detail (Phase F · Sprint F3). Lifecycle timeline, provider attempts,
 * drift reconciliations, sanitized logs, and contextual, permission-aware actions.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadDeploymentDetail } from "@/lib/runtime-data";
import { resolveWorkspaces } from "@/lib/workspace-data";
import { DeploymentControls } from "./DeploymentControls";
import styles from "../../pages.module.css";

export const dynamic = "force-dynamic";

const driftTone = (d: string): "success" | "warning" | "danger" | "neutral" =>
  d === "no_drift" ? "success" : d === "destructive_drift" || d === "missing_provider_workflow" ? "danger" : "warning";

export default async function DeploymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, workspaces] = await Promise.all([loadDeploymentDetail(id), resolveWorkspaces()]);
  if (data === null) return <EmptyState icon="lock" title="Deployment not found" body="It may have been removed, or you may not have access." />;
  const { detail, logs } = data;
  const d = detail.deployment;
  const workspaceId = workspaces[0]?.id ?? "";

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <Link href="/workspace/deployments" className={styles.rowMeta} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="arrow-left" size={13} /> Deployments</Link>
          <h1 className={styles.pageTitle}>Deployment v{d.deploymentVersion}</h1>
          <p className={styles.pageSub}>{d.targetEnvironment} · {d.provider} · package {d.deploymentPackageId.slice(0, 12)} · hash {d.packageHash.slice(0, 12)}{d.externalWorkflowId ? ` · workflow ${d.externalWorkflowId}` : ""}</p>
        </div>
        <div className={styles.rowRight}>
          {d.activationState === "active" && <Badge tone="success">active</Badge>}
          <Badge status={d.status} dot>{d.status.replace(/_/g, " ")}</Badge>
        </div>
      </div>

      <DeploymentControls deploymentId={d.id} status={d.status} workspaceId={workspaceId} previousDeploymentId={d.previousDeploymentId} />

      <h2 className={styles.sectionTitle} style={{ marginTop: "var(--space-5)" }}>Lifecycle timeline</h2>
      <div className={styles.timeline}>
        {detail.timeline.map((e) => (
          <div key={e.id} className={styles.tlRow}>
            <span className={styles.tlDot} />
            <div className={styles.tlBody}>
              <div className={styles.tlType}>{e.toStatus?.replace(/_/g, " ") ?? e.operation ?? "event"}</div>
              <div className={styles.tlText}>{e.reason || "—"} · {e.createdAt}</div>
            </div>
          </div>
        ))}
      </div>

      {detail.reconciliations.length > 0 && (<>
        <h2 className={styles.sectionTitle} style={{ marginTop: "var(--space-5)" }}>Drift</h2>
        <div className={styles.list}>{detail.reconciliations.slice(0, 8).map((r) => (
          <div key={r.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{r.kind} reconciliation</div><div className={styles.rowMeta}>{r.detail || "no changes"} · {r.createdAt}</div></div><div className={styles.rowRight}><Badge tone={driftTone(r.driftClass)}>{r.driftClass.replace(/_/g, " ")}</Badge></div></div>))}</div>
      </>)}

      {detail.attempts.length > 0 && (<>
        <h2 className={styles.sectionTitle} style={{ marginTop: "var(--space-5)" }}>Provider operations</h2>
        <div className={styles.list}>{detail.attempts.map((a) => (
          <div key={a.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{a.operation} · attempt {a.attemptNumber}</div><div className={styles.rowMeta}>{a.failureCategory ? `${a.failureCategory}${a.providerCode ? ` (${a.providerCode})` : ""}` : "succeeded"} · {a.startedAt}</div></div><div className={styles.rowRight}><Badge tone={a.status === "succeeded" ? "success" : a.status === "failed" ? "danger" : "neutral"}>{a.status}</Badge></div></div>))}</div>
      </>)}

      {logs.length > 0 && (<>
        <h2 className={styles.sectionTitle} style={{ marginTop: "var(--space-5)" }}>Logs</h2>
        <div className={styles.list}>{logs.slice(0, 20).map((l) => (
          <div key={l.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{l.operation}</div><div className={styles.rowMeta}>{l.message} · {l.createdAt}</div></div><div className={styles.rowRight}><Badge tone={l.severity === "error" || l.severity === "critical" ? "danger" : l.severity === "warn" ? "warning" : "neutral"}>{l.severity}</Badge></div></div>))}</div>
      </>)}
    </>
  );
}
