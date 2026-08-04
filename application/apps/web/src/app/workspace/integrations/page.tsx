/**
 * Installed Connectors (Phase F · Sprint F4.1). Every connector installed in the
 * workspace with its lifecycle status + health, from `loadInstalledConnectors()`.
 * Read-only surface; writes go through the connector detail controls.
 */

import Link from "next/link";
import { Badge, Button, EmptyState, Icon } from "@brightloop/ui";
import { loadInstalledConnectors } from "@/lib/integration-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const healthTone = (h: string): "success" | "warning" | "danger" | "neutral" =>
  h === "healthy" ? "success" : h === "degraded" ? "warning" : h === "unavailable" || h === "unauthorized" ? "danger" : "neutral";

export default async function IntegrationsPage() {
  const data = await loadInstalledConnectors();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Integrations</h1>
          <p className={styles.pageSub}>Connectors installed in this workspace. Auxion stays the system of record — connectors only exchange data.</p>
        </div>
        <Link href="/workspace/integrations/marketplace"><Button variant="secondary"><Icon name="plug" size={14} /> Browse marketplace</Button></Link>
      </div>

      {data.installations.length === 0
        ? <EmptyState icon="plug" title="No connectors yet" body="Install a connector from the marketplace to start exchanging data with an external service." action={<Link href="/workspace/integrations/marketplace"><Button>Browse marketplace</Button></Link>} />
        : <div className={styles.list}>{data.installations.map((i) => (
            <Link key={i.id} href={`/workspace/integrations/${i.id}`} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}><Icon name="plug" size={15} /> {i.displayName}</div>
                <div className={styles.rowMeta}>{i.connectorId} · {i.authMethod} · {i.triggerKind} · {i.enabledCapabilities.length} capabilities</div>
              </div>
              <div className={styles.rowRight}>
                <Badge tone={healthTone(i.healthLevel)}>{i.healthLevel}</Badge>
                <Badge status={i.status} dot>{i.status.replace(/_/g, " ")}</Badge>
              </div>
            </Link>))}</div>}
    </>
  );
}
