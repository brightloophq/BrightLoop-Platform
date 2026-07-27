/**
 * Projects (Phase F · Sprint F1). The client's transformation workspaces, each a
 * "project" with strategy, plan, automations, reports and AI agents behind it.
 */

import Link from "next/link";
import { Badge, EmptyState } from "@brightloop/ui";
import { loadProjects } from "@/lib/workspace-data";
import styles from "../pages.module.css";

export default async function ProjectsPage() {
  const data = await loadProjects();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Projects</h1><p className={styles.pageSub}>Your transformation workspaces.</p></div></div>
      {data.workspaces.length === 0 ? <EmptyState icon="rocket" title="No projects yet" body="Your first transformation workspace will appear here once it’s provisioned." />
        : <div className={styles.list}>{data.workspaces.map((w) => (
            <Link key={w.id} href={`/workspace/projects/${w.id}`} className={styles.row}>
              <div className={styles.rowMain}><div className={styles.rowTitle}>{w.title}</div><div className={styles.rowMeta}>Transformation workspace</div></div>
              <div className={styles.rowRight}><Badge status={w.status}>{w.status}</Badge></div>
            </Link>))}</div>}
    </>
  );
}
