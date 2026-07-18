import type { ReactNode } from "react";
import styles from "./ActivityTimeline.module.css";

export interface TimelineItem {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  /** ISO timestamp — rendered in a `<time>` for screen readers. */
  at: string;
  /** Human label for the timestamp (e.g. "2h ago"); falls back to the raw value. */
  timeLabel?: string;
  /** Filled marker = a state change; hollow = an informational entry. */
  emphasis?: boolean;
}

export interface ActivityTimelineProps {
  items: TimelineItem[];
  /** Rendered when there are no items. */
  empty?: ReactNode;
  className?: string;
}

/**
 * A vertical audit/activity timeline on the transformation rail motif — a
 * continuous line with a marker per event. Caller supplies items already ordered
 * (typically newest-first). Reused by every entity's history view.
 */
export function ActivityTimeline({ items, empty, className }: ActivityTimelineProps) {
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <ol className={[styles.timeline, className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <span className={styles.rail} aria-hidden="true">
            <span className={styles.marker} data-emphasis={item.emphasis ? "true" : "false"} />
          </span>
          <div className={styles.body}>
            <div className={styles.head}>
              <span className={styles.title}>{item.title}</span>
              <time className={styles.time} dateTime={item.at}>
                {item.timeLabel ?? item.at}
              </time>
            </div>
            {item.meta ? <span className={styles.meta}>{item.meta}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
