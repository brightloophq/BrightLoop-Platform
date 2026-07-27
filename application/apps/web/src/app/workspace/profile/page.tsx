/**
 * Profile (Phase F · Sprint F3.5) — the signed-in user's identity, role and
 * organization, from the verified session (`getActor`) + their workspaces. Read
 * only; account changes are handled by an administrator (invite-only platform).
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { resolveWorkspaces } from "@/lib/workspace-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  owner: "Owner", admin: "Administrator", team_member: "Team Member",
  client_admin: "Client Admin", client_member: "Client Member",
};

export default async function ProfilePage() {
  const actor = await getActor();
  if (actor === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;
  const workspaces = await resolveWorkspaces();

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Profile</h1><p className={styles.pageSub}>Your identity and access on Auxion.</p></div>
      </div>

      <div className={styles.profileCard}>
        <div className={styles.profileAvatar} aria-hidden="true"><Icon name="users" size={26} /></div>
        <div className={styles.profileMeta}>
          <div className={styles.profileName}>{actor.userId}</div>
          <div className={styles.profileSub}>
            <Badge tone="blue">{roleLabel[actor.role] ?? actor.role}</Badge>
            {actor.clientId ? <Badge tone="neutral">Org {actor.clientId}</Badge> : <Badge tone="neutral">Internal</Badge>}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Access</h2><Link className={styles.sectionLink} href="/workspace/settings">Settings <Icon name="arrow-right" size={13} /></Link></div>
        <div className={styles.detailRows}>
          <div className={styles.detailRow}><span className={styles.detailLabel}>Role</span><span className={styles.detailValue}>{roleLabel[actor.role] ?? actor.role}</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>Organization</span><span className={styles.detailValue}>{actor.clientId ?? "Auxion (internal)"}</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>Workspaces</span><span className={styles.detailValue}>{workspaces.length}</span></div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Your workspaces</h2></div>
        {workspaces.length === 0 ? <EmptyState icon="rocket" title="No workspaces yet" body="Your transformation workspace will appear here once provisioned." />
          : <div className={styles.list}>{workspaces.map((w) => (
              <Link key={w.id} href="/workspace" className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}><Icon name="layout-grid" size={15} /> {w.title}</div><div className={styles.rowMeta}>{w.status}</div></div>
                <div className={styles.rowRight}><Icon name="chevron-right" size={15} /></div>
              </Link>))}</div>}
      </div>
    </>
  );
}
