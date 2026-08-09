import { Badge, MetricCard, OperationalPanel, Progress } from "@brightloop/ui";
import type { ScanDTO } from "@brightloop/application";
import { formatDuration, stageLabel, type NextStageView, type ProspectIdentity, type RuntimeFlags } from "@/lib/prospect-scanner";
import { KillSwitches } from "./KillSwitches";
import styles from "../scanner.module.css";

export interface ScanHeaderProps {
  scan: ScanDTO;
  identity: ProspectIdentity;
  next: NextStageView;
  flags: RuntimeFlags;
  latestEvent: string | null;
}

/**
 * The scan instrument header: who the prospect is, where the run stands, and
 * which system switches are live. Everything shown is already-bounded view-model
 * text — no envelope is rendered here.
 */
export function ScanHeader({ scan, identity, next, flags, latestEvent }: ScanHeaderProps) {
  const started = scan.startedAt ?? scan.createdAt;

  return (
    <OperationalPanel tone="anchor">
      <div className={styles.railHead}>
        <span>Prospect scan · {scan.scanId}</span>
        <span>
          Stage {next.position} / {next.total}
        </span>
      </div>

      <div className={styles.headerGrid}>
        <div className={styles.identity}>
          <span className={styles.identityName}>{identity.businessName ?? identity.websiteUrl ?? "Unnamed prospect"}</span>
          {identity.websiteUrl ? (
            <a className={styles.identityUrl} href={identity.websiteUrl} target="_blank" rel="noreferrer noopener nofollow">
              {identity.websiteUrl}
            </a>
          ) : null}
          <div className={styles.badgeRow}>
            <Badge status={scan.lifecycle}>{scan.lifecycle}</Badge>
            <span className={styles.mono}>{stageLabel(scan.currentStage)}</span>
            {identity.industry ? <span className={styles.mono}>{identity.industry}</span> : null}
            {identity.location ? <span className={styles.mono}>{identity.location}</span> : null}
          </div>
          <p className={styles.stageReason}>{scan.summary}</p>
        </div>

        <div className={styles.progressWrap}>
          <Progress value={scan.progress} label={`Pipeline progress ${scan.progress}%`} />
          <KillSwitches flags={flags} />
        </div>
      </div>

      <div className={styles.metrics} style={{ marginTop: "var(--space-4)" }}>
        <MetricCard label="Progress" value={`${scan.progress}%`} icon="gauge" />
        <MetricCard label="Elapsed" value={formatDuration(scan.durationMs)} icon="clock" />
        <MetricCard label="Started" value={new Date(started).toLocaleString()} icon="activity" />
        <MetricCard label="Latest event" value={latestEvent ?? "—"} icon="bell" emptyLabel="No events yet" />
      </div>

      <div className={styles.railFoot}>
        <span>Run · {scan.id}</span>
        <span>Automatic · checkpointed execution</span>
      </div>
    </OperationalPanel>
  );
}
