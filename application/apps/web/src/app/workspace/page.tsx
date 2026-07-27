/**
 * Client Command Center — Dashboard (Phase F · Sprint F3.5, aligned to
 * docs/design/source 03-Command-Center + 07-Client-Portal). The operator lexicon
 * (Index, Signals, Dispatches, Moves, Auxiliaries) is translated into plain client
 * language: a health Index to target, the outcomes Auxion is holding, what's
 * happening now, and what needs your okay. Powered entirely by existing read
 * models via `loadWorkspaceDashboard()`. Thin server component; graceful states.
 */

import Link from "next/link";
import { Badge, EmptyState, IndexGauge, MetricCard, SectionRule } from "@brightloop/ui";
import { loadWorkspaceDashboard } from "@/lib/workspace-data";
import styles from "./pages.module.css";

const HEALTHY_AT = 90; // product convention: an Index of 90+ reads as "operating".

export default async function DashboardPage() {
  const data = await loadWorkspaceDashboard();
  if (data === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again to view your workspace." />;

  if (data.workspace === null) {
    return (
      <>
        <div className={styles.pageHead}><div><h1 className={styles.pageTitle}>Welcome to Auxion</h1><p className={styles.pageSub}>Your living business operating system. Strategy, automations, runtime and reports will appear here as your workspace comes online.</p></div></div>
        <EmptyState icon="rocket" title="Your workspace is being set up" body="Once provisioned, your Command Center populates automatically — health, what's running, and what needs your okay." />
      </>
    );
  }

  const health = data.health.health;
  const activeMissions = data.missions.filter((m) => m.status === "running" || m.status === "planning" || m.status === "resuming");
  const waiting = data.missions.filter((m) => m.status === "waiting_for_approval");
  const latestReports = data.reports.slice(0, 3);
  const state = health === null ? "Coming online" : health >= HEALTHY_AT ? "Operating" : health >= 70 ? "Stabilizing" : "Needs attention";
  const summary = health === null
    ? "Your operating system is coming online. As strategy, automations and reports run, your health Index appears here."
    : `Your business health Index is holding at ${health}. ${activeMissions.length} ${activeMissions.length === 1 ? "specialist is" : "specialists are"} working, ${data.counts.automations} ${data.counts.automations === 1 ? "process runs" : "processes run"} on their own, and ${waiting.length} ${waiting.length === 1 ? "item needs" : "items need"} your okay.`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.stateLine}><span className={styles.stateDot} data-state={health !== null && health >= HEALTHY_AT ? "ok" : "warn"} /> {state} · {data.workspace.title}</div>
          <h1 className={styles.pageTitle}>Your business, operating</h1>
          <p className={styles.pageSub}>{summary}</p>
        </div>
        <Link href="/workspace/reports" className={styles.sectionLink}>View reports →</Link>
      </div>

      <SectionRule index="01" label="System state" meta={data.health.period ?? "live"} />
      <div className={styles.commandHero}>
        <div className={styles.gaugeWrap}>
          <IndexGauge
            label="Business health"
            value={health ?? 0}
            target={HEALTHY_AT}
            note={health === null ? "coming online" : health >= HEALTHY_AT ? "operating" : `${HEALTHY_AT - health} below healthy`}
            caption={data.health.confidence !== null ? `${data.health.confidence}% confidence` : "score builds as work runs"}
          />
        </div>
        <div className={styles.heroMetrics}>
          <MetricCard label="Working now" value={data.ops.activeMissions} icon="sparkles" emphasis="hero" caption={`${data.ops.totalMissions} total`} emptyLabel="idle" />
          <MetricCard label="Needs your okay" value={data.ops.waitingApprovals} icon="check-circle" emphasis="hero" caption={data.ops.waitingApprovals > 0 ? "awaiting decision" : "all clear"} emptyLabel="0" />
          <MetricCard label="Processes running" value={data.counts.automations} icon="workflow" caption="on their own" emptyLabel="0" />
          <MetricCard label="Reports" value={data.counts.reports} icon="line-chart" caption="delivered" emptyLabel="0" />
        </div>
      </div>

      <div className={styles.grid2}>
        <div>
          <SectionRule index="02" label="Happening now" meta={`${activeMissions.length + latestReports.length} updates`} />
          {activeMissions.length === 0 && latestReports.length === 0
            ? <EmptyState icon="activity" title="Quiet for now" body="When your specialists act or a report is delivered, it shows here." />
            : <div className={styles.list}>
                {activeMissions.slice(0, 4).map((m) => (
                  <Link key={m.id} href={`/workspace/missions/${m.id}`} className={styles.row}>
                    <div className={styles.rowMain}><div className={styles.rowTitle}>{m.title}</div><div className={styles.rowMeta}>A specialist is working · {m.status.replace(/_/g, " ")}</div></div>
                    <div className={styles.rowRight}><div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${m.progress}%` }} /></div><Badge status={m.status} dot>{m.progress}%</Badge></div>
                  </Link>))}
                {latestReports.map((r) => (
                  <Link key={r.id} href="/workspace/reports" className={styles.row}>
                    <div className={styles.rowMain}><div className={styles.rowTitle}>{r.title}</div><div className={styles.rowMeta}>Report delivered · {r.metricCount} metrics · {r.insightCount} insights</div></div>
                    <div className={styles.rowRight}><Badge status={r.status} dot>{r.status}</Badge></div>
                  </Link>))}
              </div>}
        </div>

        <div>
          <SectionRule index="03" label="Needs your okay" meta={`${waiting.length} open`} />
          {waiting.length === 0
            ? <EmptyState icon="check-circle" title="You're all caught up" body="Nothing needs your decision right now." />
            : <div className={styles.list}>{waiting.slice(0, 6).map((m) => (
                <Link key={m.id} href="/workspace/approvals" className={styles.moveRow}>
                  <div className={styles.rowMain}><div className={styles.rowTitle}>{m.title}</div><div className={styles.rowMeta}>Review the brief, then approve or decline.</div></div>
                  <Badge tone="warning" dot>Review</Badge>
                </Link>))}</div>}

          <div style={{ marginTop: "var(--space-5)" }}>
            <SectionRule index="04" label="Your team" meta={`${data.ops.totalMissions} missions`} />
            <Link href="/workspace/ai-team" className={styles.teamBanner}>
              <div className={styles.teamBannerMain}><div className={styles.rowTitle}>Your AI specialists</div><div className={styles.rowMeta}>Auxiliaries monitoring your business around the clock, acting the moment something needs attention.</div></div>
              <Badge tone="success" dot>On watch</Badge>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
