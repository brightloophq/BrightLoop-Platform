/**
 * Runtime Registry (Phase F · Sprint F3). External runtimes + their health,
 * environment, and capability status, from `loadRuntimes()`. Read-only surface.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadRuntimes } from "@/lib/runtime-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const healthTone = (h: string): "success" | "warning" | "danger" | "neutral" =>
  h === "healthy" ? "success" : h === "degraded" ? "warning" : h === "unavailable" || h === "unauthorized" ? "danger" : "neutral";

export default async function RuntimesPage() {
  const data = await loadRuntimes();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Runtimes</h1><p className={styles.pageSub}>External execution runtimes. Auxion stays the system of record — runtimes only execute.</p></div>
      </div>
      {data.runtimes.length === 0
        ? <EmptyState icon="workflow" title="No runtimes yet" body="Your team registers an execution runtime (e.g. n8n) to deploy approved automations. Registered runtimes appear here." />
        : <div className={styles.list}>{data.runtimes.map((r) => (
            <Link key={r.id} href={`/workspace/runtimes/${r.id}`} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}><Icon name="workflow" size={15} /> {r.displayName}</div>
                <div className={styles.rowMeta}>{r.provider} · {r.environment} · {r.providerVersion ?? "version unknown"} · {r.supportedCapabilities.length} capabilities</div>
              </div>
              <div className={styles.rowRight}>
                <Badge tone={healthTone(r.healthState)}>{r.healthState}</Badge>
                <Badge status={r.status} dot>{r.status.replace(/_/g, " ")}</Badge>
              </div>
            </Link>))}</div>}
    </>
  );
}
