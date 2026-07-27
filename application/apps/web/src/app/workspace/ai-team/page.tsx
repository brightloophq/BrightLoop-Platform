/**
 * AI Team (Phase F · Sprint F1). Presents the E7 specialist agents. Read-only —
 * no chat interface this sprint. Powered by `loadAiTeam()` (agent profiles + ops).
 */

import Link from "next/link";
import { Badge, EmptyState } from "@brightloop/ui";
import { loadAiTeam } from "@/lib/workspace-data";
import styles from "../pages.module.css";

const ROSTER: { role: string; name: string; blurb: string }[] = [
  { role: "coordinator", name: "Coordinator", blurb: "Plans the mission and delegates to specialists" },
  { role: "strategy", name: "Strategist", blurb: "Surfaces recommendations, risks and opportunities" },
  { role: "project_management", name: "Project Manager", blurb: "Turns strategy into an executable plan" },
  { role: "automation", name: "Automation Engineer", blurb: "Builds and validates automation workflows" },
  { role: "knowledge", name: "Knowledge Specialist", blurb: "Assembles evidence and preserves citations" },
  { role: "reporting", name: "Reporting Analyst", blurb: "Produces executive reports and narratives" },
  { role: "review", name: "Reviewer", blurb: "Validates outputs and checks completion criteria" },
];

export default async function AiTeamPage() {
  const data = await loadAiTeam();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;
  const active = data.missions.find((m) => m.status === "running" || m.status === "planning");

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>AI Team</h1><p className={styles.pageSub}>Your specialist agents — coordinated, auditable, always on.</p></div>
        <span style={{ display: "flex", gap: "var(--space-2)" }}>
          <Badge tone="neutral">{data.ops.activeMissions} active</Badge>
          <Badge tone="neutral">{data.ops.totalMissions} missions</Badge>
        </span>
      </div>

      <div className={styles.teamGrid}>
        {ROSTER.map((a) => {
          const profile = data.profiles.find((p) => p.role === a.role);
          const status = profile?.status ?? (active ? "active" : "ready");
          return (
            <div key={a.role} className={styles.agentCard}>
              <div className={styles.agentTop}>
                <span className={styles.agentAvatar} aria-hidden>{a.name.charAt(0)}</span>
                <span><span className={styles.agentName}>{a.name}</span><br /><span className={styles.agentRole}>{a.role.replace(/_/g, " ")}</span></span>
                <span style={{ marginLeft: "auto" }}><Badge status={status} dot>{status}</Badge></span>
              </div>
              <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)", margin: 0 }}>{a.blurb}</p>
              <div className={styles.rowMeta}>{active && a.role !== "coordinator" ? `On: ${active.title}` : "Awaiting delegation"}</div>
            </div>
          );
        })}
      </div>

      {data.missions.length > 0 && (
        <section className={styles.section} style={{ marginTop: "var(--space-6)" }}>
          <div className={styles.sectionHead}><span className={styles.sectionTitle}>Recent missions</span></div>
          <div className={styles.list}>
            {data.missions.slice(0, 6).map((m) => (
              <Link key={m.id} href={`/workspace/missions/${m.id}`} className={styles.row}>
                <div className={styles.rowMain}><div className={styles.rowTitle}>{m.title}</div><div className={styles.rowMeta}>{m.status.replace(/_/g, " ")} · {m.taskCount} tasks</div></div>
                <div className={styles.rowRight}><Badge status={m.status} dot>{m.progress}%</Badge></div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
