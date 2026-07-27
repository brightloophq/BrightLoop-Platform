/**
 * Runtime Detail (Phase F · Sprint F3). Health history + discovered capabilities.
 * Validate / health-check actions route through the runtime server actions.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadRuntimeDetail } from "@/lib/runtime-data";
import { RuntimeControls } from "./RuntimeControls";
import styles from "../../pages.module.css";

export const dynamic = "force-dynamic";

export default async function RuntimeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadRuntimeDetail(id);
  if (data === null) return <EmptyState icon="lock" title="Runtime not found" body="It may have been removed, or you may not have access." />;
  const { runtime, health, capabilities } = data;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <Link href="/workspace/runtimes" className={styles.rowMeta} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="arrow-left" size={13} /> Runtimes</Link>
          <h1 className={styles.pageTitle}>{runtime.displayName}</h1>
          <p className={styles.pageSub}>{runtime.provider} · {runtime.environment} · last checked {runtime.lastHealthCheckAt ?? "never"}</p>
        </div>
        <div className={styles.rowRight}><Badge status={runtime.status}>{runtime.status.replace(/_/g, " ")}</Badge></div>
      </div>

      <RuntimeControls runtimeId={runtime.id} />

      <h2 className={styles.pageSub} style={{ marginTop: "var(--space-5)", fontWeight: 600 }}>Capabilities</h2>
      {capabilities.length === 0 ? <p className={styles.rowMeta}>No capabilities discovered yet.</p>
        : <div className={styles.list}>{capabilities.map((c) => (
            <div key={c.operation} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{c.operation}</div></div><div className={styles.rowRight}><Badge tone={c.supported ? "success" : "neutral"}>{c.supported ? "supported" : "unsupported"}</Badge></div></div>))}</div>}

      <h2 className={styles.pageSub} style={{ marginTop: "var(--space-5)", fontWeight: 600 }}>Health history</h2>
      {health.length === 0 ? <p className={styles.rowMeta}>No health checks recorded.</p>
        : <div className={styles.list}>{health.slice(0, 15).map((h, i) => (
            <div key={i} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{h.level}</div><div className={styles.rowMeta}>{h.latencyMs}ms · {h.checkedAt}</div></div></div>))}</div>}
    </>
  );
}
