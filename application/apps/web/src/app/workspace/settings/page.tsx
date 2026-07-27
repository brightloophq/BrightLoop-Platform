/**
 * Settings (Phase F · Sprint F1). Workspace + profile settings for the client.
 * Agent configuration and privileged operations stay INTERNAL (owner/admin) —
 * they are intentionally absent here, honoring the existing capability model.
 */

import { EmptyState } from "@brightloop/ui";
import { resolveWorkspaces } from "@/lib/workspace-data";
import { getActor } from "@/lib/auth";
import styles from "../pages.module.css";

export default async function SettingsPage() {
  const actor = await getActor();
  if (actor === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;
  const workspaces = await resolveWorkspaces();

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Settings</h1><p className={styles.pageSub}>Your profile and workspace preferences.</p></div></div>
      <div className={styles.grid2}>
        <section className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Profile</span></div>
          <div className={styles.list}>
            <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Role</div><div className={styles.rowMeta}>{actor.role.replace(/_/g, " ")}</div></div></div>
            <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Organization</div><div className={styles.rowMeta}>{actor.clientId ?? "—"}</div></div></div>
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Workspaces</span></div>
          <div className={styles.list}>
            {workspaces.length === 0 ? <div className={styles.rowMeta}>No workspaces provisioned yet.</div>
              : workspaces.map((w) => <div key={w.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{w.title}</div><div className={styles.rowMeta}>{w.status}</div></div></div>)}
          </div>
        </section>
      </div>
    </>
  );
}
