/**
 * Global search (Phase F · Sprint F1). Builds a workspace-scoped search index from
 * existing read models (projects, reports, missions, approvals) and hands it to a
 * thin client box. RLS already scopes everything to the caller's own org.
 */

import { EmptyState } from "@brightloop/ui";
import { loadWorkspaceDashboard } from "@/lib/workspace-data";
import type { SearchDoc } from "@/lib/workspace/search";
import { SearchBox } from "./SearchBox";
import styles from "../pages.module.css";

export default async function SearchPage() {
  const data = await loadWorkspaceDashboard();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  const index: SearchDoc[] = [
    ...data.workspaces.map((w) => ({ id: w.id, kind: "project" as const, title: w.title, subtitle: "Project", href: `/workspace/projects/${w.id}` })),
    ...data.reports.map((r) => ({ id: r.id, kind: "report" as const, title: r.title, subtitle: r.kind.replace(/_/g, " "), href: "/workspace/reports" })),
    ...data.missions.map((m) => ({ id: m.id, kind: "mission" as const, title: m.title, subtitle: m.status.replace(/_/g, " "), href: `/workspace/missions/${m.id}` })),
    ...data.missions.filter((m) => m.status === "waiting_for_approval").map((m) => ({ id: `${m.id}-appr`, kind: "approval" as const, title: `Approval: ${m.title}`, subtitle: "Pending", href: "/workspace/approvals" })),
    ...data.intents.map((i) => ({ id: i.id, kind: "artifact" as const, title: i.title, subtitle: "Automation", href: "/workspace/automations" })),
  ];

  return (
    <>
      <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Search</h1><p className={styles.pageSub}>Find anything across your workspace.</p></div></div>
      <SearchBox index={index} />
    </>
  );
}
