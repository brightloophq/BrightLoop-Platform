import { ActivityTimeline, EmptyWorkspace, OperationalPanel, SectionRule, type TimelineItem } from "@brightloop/ui";
import type { TimelineRowView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * The operational timeline.
 *
 * Rows arrive already reduced to an allowlisted, bounded summary — the raw event
 * payload is never rendered, so a prompt, a model response, or a database row
 * inside a payload cannot surface here.
 */
export function RuntimeTimeline({ rows }: { rows: TimelineRowView[] }) {
  if (rows.length === 0) {
    return (
      <OperationalPanel>
        <SectionRule index="07" label="Timeline" meta="no events" />
        <EmptyWorkspace icon="activity" title="No runtime events yet" body="Events appear as each stage is executed. Nothing runs on its own." />
      </OperationalPanel>
    );
  }

  const items: TimelineItem[] = rows.map((r) => ({
    id: r.id,
    title: `${r.type}${r.stage ? ` · ${r.stageLabel}` : ""}`,
    meta: r.summary === "" ? undefined : r.summary,
    at: r.at,
    timeLabel: new Date(r.at).toLocaleString(),
    emphasis: r.emphasis,
  }));

  return (
    <OperationalPanel>
      <SectionRule index="07" label="Timeline" meta={`${rows.length} events`} />
      <ActivityTimeline items={items} />
      <div className={styles.railFoot}>
        <span>Append-only runtime events</span>
        <span>Payloads are summarized, never rendered raw</span>
      </div>
    </OperationalPanel>
  );
}
