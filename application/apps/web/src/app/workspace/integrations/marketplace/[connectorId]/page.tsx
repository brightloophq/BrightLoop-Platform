/**
 * Connector detail (marketplace) — Phase F · Sprint F4.1. A connector type's
 * capabilities, configuration schema, and (if it has a live adapter) an install
 * form. Config secret fields are collected but never echoed back.
 */

import Link from "next/link";
import { Alert, Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadConnectorDescriptor } from "@/lib/integration-data";
import { InstallForm } from "./InstallForm";
import styles from "../../../pages.module.css";

export const dynamic = "force-dynamic";

export default async function ConnectorDetailPage({ params }: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await params;
  const c = await loadConnectorDescriptor(connectorId);
  if (c === null) return <EmptyState icon="search" title="Connector not found" body="This connector is not in the registry." action={<Link href="/workspace/integrations/marketplace" className={styles.sectionLink}>Back to marketplace</Link>} />;

  return (
    <>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Link href="/workspace/integrations/marketplace" className={styles.rowMeta} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="arrow-left" size={13} /> Marketplace</Link>
      </div>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{c.name}</h1>
          <p className={styles.pageSub}>{c.summary}</p>
        </div>
        <span style={{ display: "flex", gap: "var(--space-2)" }}>
          <Badge tone="neutral">{c.category}</Badge>
          <Badge tone="neutral">{c.authMethod}</Badge>
          {c.available ? <Badge tone="success" dot>available</Badge> : <Badge tone="neutral">example</Badge>}
        </span>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>Capabilities</span></div>
        <div className={styles.list}>
          {c.capabilities.map((cap) => (
            <div key={cap.key} className={styles.row}>
              <div className={styles.rowMain}><div className={styles.rowTitle}>{cap.label}</div><div className={styles.rowMeta}>{cap.key} · {cap.operation}</div></div>
              <div className={styles.rowRight}><Badge tone="neutral">{cap.sideEffect}</Badge></div>
            </div>
          ))}
        </div>
      </section>

      {c.triggerKinds.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Triggers</span></div>
          <span style={{ display: "flex", gap: "var(--space-2)" }}>{c.triggerKinds.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}><span className={styles.sectionTitle}>{c.available ? "Install" : "Configuration schema"}</span></div>
        {c.available
          ? <InstallForm connectorId={c.id} defaultName={c.name} fields={c.configFields} />
          : <Alert tone="neutral">This is a framework example that demonstrates the connector shape. It has no live adapter and cannot be installed. Real integrations implement the same ConnectorAdapter port in their own data-layer adapter.</Alert>}
      </section>
    </>
  );
}
