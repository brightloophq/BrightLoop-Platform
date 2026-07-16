import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}

/**
 * EmptyState — handoff §09.3: "Centered icon + heading + one-line guidance +
 * primary action. Never a blank screen."
 */
export function EmptyState({ icon = "search", title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>
        <Icon name={icon} size={20} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
