/**
 * Mission view (Phase F · Sprint F1). The full agent mission — task graph, state,
 * delegations, approvals, artifacts, evaluation, failures — from `getMissionDetail`.
 */

import { Badge, EmptyState } from "@brightloop/ui";
import { loadMission } from "@/lib/workspace-data";
import styles from "../../pages.module.css";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadMission(id);
  if (detail === null) return <EmptyState icon="search" title="Mission not found" body="This mission may belong to another workspace or has been archived." />;
  const { mission, tasks, delegations, approvals, artifacts, evaluations, failures } = detail;
  const evaluation = evaluations.find((e) => e.targetKind === "mission");

  return (
    <>
      <div className={styles.pageHead}>
        <div><h1 className={styles.pageTitle}>{mission.title}</h1><p className={styles.pageSub}>{mission.goal}</p></div>
        <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <Badge status={mission.status} dot>{mission.status.replace(/_/g, " ")}</Badge>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${mission.progress}%` }} /></div>
        </span>
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metric}><span className={styles.metricLabel}>Tasks</span><span className={styles.metricValue}>{mission.taskCount}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Delegations</span><span className={styles.metricValue}>{mission.delegationCount}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Capability calls</span><span className={styles.metricValue}>{mission.capabilityCalls}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Checkpoints</span><span className={styles.metricValue}>{mission.checkpointCount}</span></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Cost</span><span className={styles.metricValue}><small>$</small>{mission.cost.toFixed(2)}</span></div>
      </div>

      <div className={styles.grid2}>
        <div>
          <section className={styles.section}>
            <div className={styles.sectionHead}><span className={styles.sectionTitle}>Task graph</span></div>
            {tasks.length === 0 ? <EmptyState icon="workflow" title="No tasks" body="The plan has not been generated yet." />
              : <div className={styles.list}>{tasks.map((t) => (
                  <div key={t.id} className={styles.row}>
                    <div className={styles.rowMain}><div className={styles.rowTitle}>{t.title}</div><div className={styles.rowMeta}>{t.assignedRole.replace(/_/g, " ")}{t.dependsOn.length > 0 ? ` · depends on ${t.dependsOn.length}` : ""}{t.approvalGated ? " · approval gate" : ""}</div></div>
                    <div className={styles.rowRight}><Badge status={t.status} dot>{t.status.replace(/_/g, " ")}</Badge></div>
                  </div>))}</div>}
          </section>

          {artifacts.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><span className={styles.sectionTitle}>Artifacts</span></div>
              <div className={styles.list}>{artifacts.map((a) => (
                <div key={a.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{a.title || a.kind.replace(/_/g, " ")}</div><div className={styles.rowMeta}>{a.refContext} · {a.citations.length} citation(s)</div></div><Badge tone="neutral">{a.kind.replace(/_/g, " ")}</Badge></div>))}</div>
            </section>
          )}
        </div>

        <div>
          <section className={styles.section}>
            <div className={styles.sectionHead}><span className={styles.sectionTitle}>Approvals</span></div>
            {approvals.length === 0 ? <EmptyState icon="check-circle" title="No approvals" body="No approval gates on this mission." />
              : <div className={styles.list}>{approvals.map((a) => (
                  <div key={a.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{a.approvalClass.replace(/_/g, " ")}</div><div className={styles.rowMeta}>task {a.taskKey}</div></div><Badge status={a.status} dot>{a.status}</Badge></div>))}</div>}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><span className={styles.sectionTitle}>Delegations</span></div>
            <div className={styles.list}>{delegations.slice(0, 8).map((d) => (
              <div key={d.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{d.delegatingRole.replace(/_/g, " ")} → {d.receivingRole.replace(/_/g, " ")}</div><div className={styles.rowMeta}>{d.taskKey}</div></div><Badge status={d.status} dot>{d.status}</Badge></div>))}
              {delegations.length === 0 && <div className={styles.rowMeta}>No delegations recorded.</div>}
            </div>
          </section>

          {evaluation && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><span className={styles.sectionTitle}>Evaluation</span></div>
              <div className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>Score {evaluation.score}/100</div><div className={styles.rowMeta}>{evaluation.rationale}</div></div><Badge tone={evaluation.verdict === "pass" ? "success" : "danger"}>{evaluation.verdict}</Badge></div>
            </section>
          )}

          {failures.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><span className={styles.sectionTitle}>Failures</span></div>
              <div className={styles.list}>{failures.slice(0, 6).map((f) => (
                <div key={f.id} className={styles.row}><div className={styles.rowMain}><div className={styles.rowTitle}>{f.category}</div><div className={styles.rowMeta}>{f.cause}</div></div><Badge tone={f.retryable ? "warning" : "danger"}>{f.resolution}</Badge></div>))}</div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
