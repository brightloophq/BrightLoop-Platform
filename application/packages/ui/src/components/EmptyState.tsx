import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

/**
 * EmptyState — heading + one-line guidance + primary action. Never a blank
 * screen.
 *
 * The centred pictogram this used to lead with is gone; a short metallic rule
 * holds the same optical position. It is drawn geometry, not a glyph, so it
 * carries no meaning that the heading does not already state.
 */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.rule} aria-hidden="true" />
      <h3 className={styles.title}>{title}</h3>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
