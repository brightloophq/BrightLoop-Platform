/**
 * Workspace Administration (Phase F · Sprint F3.5) — a read-only administration
 * overview: organization + access, provisioned workspaces, and the AI team roster
 * (existing `loadAiTeam`). Human user/role management is not yet a backend
 * capability and is surfaced as Future Phase rather than faked. No new backend.
 */

import Link from "next/link";
import { Badge, EmptyState, Icon } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { loadAiTeam, resolveWorkspaces } from "@/lib/workspace-data";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  owner: "Owner", admin: "Administrator", team_member: "Team Member",
  client_admin: "Client Admin", client_member: "Client Member",
};

export default async function WorkspaceAdminPage() {
  const actor = await getActor();
  if (actor === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;
  const [workspaces, aiTeam] = await Promise.all([resolveWorkspaces(), loadAiTeam()]);

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>Administration</h1><p className={styles.pageSub}>Organization, access and the specialists working your transformation.</p></div>
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metric}><span className={styles.metricValue}>{workspaces.length}</span><span className={styles.metricLabel}>Workspaces</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{aiTeam?.profiles.length ?? 0}</span><span className={styles.metricLabel}>AI specialists</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{aiTeam?.ops.activeMissions ?? 0}</span><span className={styles.metricLabel}>Active missions</span></div>
        <div className={styles.metric}><span className={styles.metricValue}>{roleLabel[actor.role] ?? actor.role}</span><span className={styles.metricLabel}>Your role</span></div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Organization &amp; access</h2></div>
        <div className={styles.detailRows}>
          <div className={styles.detailRow}><span className={styles.detailLabel}>Organization</span><span className={styles.detailValue}>{actor.clientId ?? "Auxion (internal)"}</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>Your role</span><span className={styles.detailValue}>{roleLabel[actor.role] ?? actor.role}</span></div>
          <div className={styles.detailRow}><span className={styles.detailLabel}>Provisioned workspaces</span><span className={styles.detailValue}>{workspaces.map((w) => w.title).join(", ") || "—"}</span></div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>AI team</h2><Link className={styles.sectionLink} href="/workspace/ai-team">Full roster <Icon name="arrow-right" size={13} /></Link></div>
        {!aiTeam || aiTeam.profiles.length === 0 ? <EmptyState icon="users" title="No specialists yet" body="Your AI team is provisioned with your workspace." />
          : <div className={styles.list}>{aiTeam.profiles.slice(0, 8).map((p) => (
              <div key={p.id} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}><Icon name="users" size={15} /> {p.name}</div><div className={styles.rowMeta}>{p.role}{p.purpose ? ` · ${p.purpose}` : ""}</div></div>
                <div className={styles.rowRight}><Badge status={p.status}>{p.status}</Badge></div>
              </div>))}</div>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Team management</h2></div>
        <EmptyState icon="lock" title="Coming in a future phase" body="Inviting teammates and managing human roles will arrive with the team-management backend. Today, accounts are provisioned by Auxion." />
      </div>
    </>
  );
}
