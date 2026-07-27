/**
 * Notification Center (Phase F · Sprint F3.5) — a full-page view of the same
 * notifications surfaced in the shell panel, derived from live mission / report /
 * automation read models via `loadNotificationInputs()` + `deriveNotifications()`.
 * Read-only; no new backend.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { loadNotificationInputs } from "@/lib/workspace-data";
import { deriveNotifications } from "@/lib/workspace/notifications";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const sevTone = (s: string): "danger" | "warning" | "success" | "blue" | "neutral" =>
  s === "critical" ? "danger" : s === "warning" ? "warning" : s === "success" ? "success" : s === "info" ? "blue" : "neutral";

export default async function NotificationsPage() {
  const inputs = await loadNotificationInputs();
  const notifications = deriveNotifications(inputs);

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Notifications</h1><p className={styles.pageSub}>Everything that needs your attention across missions, reports, automations and approvals.</p></div>
      </div>
      {notifications.length === 0
        ? <EmptyState icon="bell" title="You're all caught up" body="New activity across your workspace will appear here." />
        : <div className={styles.list}>{notifications.map((n) => (
            <Link key={n.id} href={n.href} className={styles.row}>
              <div className={styles.rowMain} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
                <span className={styles.notifDotLg} data-sev={n.severity} aria-hidden="true" />
                <span><span className={styles.rowTitle}>{n.title}</span><span className={styles.rowMeta} style={{ display: "block" }}>{n.detail}</span></span>
              </div>
              <div className={styles.rowRight}><Badge tone={sevTone(n.severity)}>{n.severity}</Badge><Icon name="chevron-right" size={15} /></div>
            </Link>))}</div>}
    </>
  );
}
