/**
 * Connector installation detail (Phase F · Sprint F4.1). The installation's status
 * + health, non-secret configuration, enabled capabilities, lifecycle controls,
 * and its recent canonical events, health snapshots, and audit trail. Secrets
 * never appear — only whether a credential is present.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadInstallationDetail } from "@/lib/integration-data";
import { ConnectorControls } from "./ConnectorControls";
import styles from "../../pages.module.css";

export const dynamic = "force-dynamic";

const healthTone = (h: string): "success" | "warning" | "danger" | "neutral" =>
  h === "healthy" ? "success" : h === "degraded" ? "warning" : h === "unavailable" || h === "unauthorized" ? "danger" : "neutral";

export default async function InstallationDetailPage({ params }: { params: Promise<{ installationId: string }> }) {
  const { installationId } = await params;
  const data = await loadInstallationDetail(installationId);
  if (data === null) return <EmptyState icon="search" title="Connector not found" body="This installation does not exist or you cannot access it." action={<Link href="/workspace/integrations" className={styles.sectionLink}>Back to integrations</Link>} />;
  const { installation: i, recentEvents, recentHealth, recentAudit } = data;

  return (
    <>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Link href="/workspace/integrations" className={styles.rowMeta} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="arrow-left" size={13} /> Integrations</Link>
      </div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{i.displayName}</h1>
          <p className={styles.pageSub}>{i.connectorId} · {i.authMethod} · {i.triggerKind} trigger · credential {i.hasCredential ? "present" : "missing"}</p>
        </div>
        <span style={{ display: "flex", gap: "var(--space-2)" }}>
          <Badge tone={healthTone(i.healthLevel)}>{i.healthLevel}</Badge>
          <Badge status={i.status} dot>{i.status.replace(/_/g, " ")}</Badge>
        </span>
      </div>

      <ConnectorControls installationId={i.id} status={i.status} />

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Enabled capabilities</span></div>
        {i.enabledCapabilities.length === 0
          ? <p className={styles.rowMeta}>None enabled.</p>
          : <span style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>{i.enabledCapabilities.map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}</span>}
      </section>

      {Object.keys(i.config).length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Configuration</span></div>
          <div className={styles.list}>
            {Object.entries(i.config).map(([k, v]) => (
              <div key={k} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{k}</div></div><div className={styles.rowRight} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)" }}>{String(v)}</div></div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Recent events</span><span className={styles.rowMeta}>{recentEvents.length}</span></div>
        {recentEvents.length === 0
          ? <p className={styles.rowMeta}>No events ingested yet.</p>
          : <div className={styles.list}>{recentEvents.map((e) => (
              <div key={e.id} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}>{e.type}</div><div className={styles.rowMeta}>{e.source} · {e.externalId} · {e.occurredAt}</div></div>
                <div className={styles.rowRight}><Badge status={e.status} dot>{e.status}</Badge></div>
              </div>))}</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Health history</span></div>
        {recentHealth.length === 0
          ? <p className={styles.rowMeta}>No health checks yet.</p>
          : <div className={styles.list}>{recentHealth.map((h, idx) => (
              <div key={idx} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}>{h.level}</div><div className={styles.rowMeta}>{h.latencyMs}ms · {h.checkedAt}</div></div>
                <div className={styles.rowRight}><Badge tone={healthTone(h.level)}>{h.level}</Badge></div>
              </div>))}</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Audit trail</span></div>
        {recentAudit.length === 0
          ? <p className={styles.rowMeta}>No activity yet.</p>
          : <div className={styles.list}>{recentAudit.map((a) => (
              <div key={a.id} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}>{a.operation.replace(/_/g, " ")}</div><div className={styles.rowMeta}>{a.summary || `${a.fromStatus ?? "—"} → ${a.toStatus ?? "—"}`} · {a.createdAt}</div></div>
              </div>))}</div>}
      </section>
    </>
  );
}
