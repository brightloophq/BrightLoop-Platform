/**
 * Project workspace (Phase F · Sprint F1). Each project exposes its transformation
 * facets — strategy, execution plan, automations, reports, AI agents, approvals,
 * activity. F1 ships the overview + facet navigation; deep per-facet drill-ins
 * reuse the workspace-scoped read models (see report §35).
 */

import Link from "next/link";
import { Badge, EmptyState } from "@brightloop/ui";
import { resolveWorkspaces } from "@/lib/workspace-data";
import styles from "../../pages.module.css";

const FACETS = [
  { key: "overview", label: "Overview", href: "/workspace" },
  { key: "strategy", label: "Strategy", href: "/workspace/ai-team" },
  { key: "plan", label: "Execution Plan", href: "/workspace/ai-team" },
  { key: "automations", label: "Automations", href: "/workspace/automations" },
  { key: "reports", label: "Reports", href: "/workspace/reports" },
  { key: "agents", label: "AI Agents", href: "/workspace/ai-team" },
  { key: "approvals", label: "Approvals", href: "/workspace/approvals" },
  { key: "activity", label: "Activity", href: "/workspace/activity" },
];

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaces = await resolveWorkspaces();
  const workspace = workspaces.find((w) => w.id === id) ?? null;
  if (workspace === null) return <EmptyState icon="search" title="Project not found" body="This project may belong to another workspace." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>{workspace.title}</h1><p className={styles.pageSub}>Project workspace</p></div>
        <Badge status={workspace.status} dot>{workspace.status}</Badge>
      </div>
      <div className={styles.teamGrid}>
        {FACETS.map((f) => (
          <Link key={f.key} href={f.href} className={styles.agentCard} style={{ textDecoration: "none" }}>
            <span className={styles.agentName}>{f.label}</span>
            <span className={styles.rowMeta}>Open {f.label.toLowerCase()} →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
