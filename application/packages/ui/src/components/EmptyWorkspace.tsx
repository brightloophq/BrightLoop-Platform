import type { ReactNode } from "react";
import styles from "./EmptyWorkspace.module.css";

export interface EmptyWorkspaceProps {
  title: ReactNode;
  /** What this workspace is / what to do — a sentence or two, never fake data. */
  body?: ReactNode;
  /** Primary call to action (e.g. Create). */
  action?: ReactNode;
  /** Secondary content (e.g. active-filter chips + Clear filters for a no-results state). */
  aside?: ReactNode;
  className?: string;
}

/**
 * A full-workspace empty state — larger and more explanatory than the inline
 * EmptyState. Used for "nothing exists yet" and "no results match your filters".
 * The `aside` slot carries the active constraints + a clear action for the
 * filtered-empty case. Never invents sample rows.
 */
export function EmptyWorkspace({ title, body, action, aside, className }: EmptyWorkspaceProps) {
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <span className={styles.rule} aria-hidden="true" />
      <h3 className={styles.title}>{title}</h3>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </div>
  );
}
