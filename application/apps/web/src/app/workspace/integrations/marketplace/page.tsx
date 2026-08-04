/**
 * Connector Marketplace (Phase F · Sprint F4.1). The catalogue of connector types
 * from the pure Connector Registry, with install state annotated per workspace.
 * Framework only — the sole live connectors are the deterministic Fakes; every
 * other entry is a vendor-neutral example (no live adapter, not installable).
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadMarketplace } from "@/lib/integration-data";
import styles from "../../pages.module.css";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const data = await loadMarketplace();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;
  const installed = new Set(data.installedConnectorIds);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Connector Marketplace</h1>
          <p className={styles.pageSub}>Browse connectors, then install one into your workspace. Every connector plugs into the same governed framework — capability-driven, tenant-isolated, audited.</p>
        </div>
        <Link href="/workspace/integrations" className={styles.sectionLink}>Installed connectors →</Link>
      </div>

      <div className={styles.teamGrid}>
        {data.catalogue.map((c) => (
          <Link key={c.id} href={`/workspace/integrations/marketplace/${c.id}`} className={styles.agentCard} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span className={styles.agentAvatar} aria-hidden><Icon name="plug" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className={styles.agentName}>{c.name}</span><br />
                <span className={styles.agentRole}>{c.category} · {c.authMethod}</span>
              </span>
              {installed.has(c.id)
                ? <Badge tone="success" dot>installed</Badge>
                : c.available ? <Badge tone="neutral">available</Badge> : <Badge tone="neutral">example</Badge>}
            </div>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)", margin: 0 }}>{c.summary}</p>
            <div className={styles.rowMeta}>
              {c.triggerKinds.length > 0 ? `Triggers: ${c.triggerKinds.join(", ")}` : "No triggers"} · {c.capabilities.length} capabilities
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
