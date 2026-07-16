import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";
import styles from "./CTASection.module.css";

export interface CTASectionProps {
  eyebrow?: string;
  title: string;
  body?: string;
  actions: ReactNode;
  note?: string;
}

/** CTASection — the closing conversion block on a marketing page. */
export function CTASection({ eyebrow, title, body, actions, note }: CTASectionProps) {
  return (
    <div className={styles.wrap}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className={styles.title}>{title}</h2>
      {body ? <p className={styles.body}>{body}</p> : null}
      <div className={styles.actions}>{actions}</div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
