import styles from "./AttentionRow.module.css";

export type AttentionTone = "danger" | "warning" | "info";

export interface AttentionRowProps {
  label: string;
  count: number;
  tone: AttentionTone;
  interactive?: boolean;
  className?: string;
}

/** Severity as a word, so it is never carried by colour alone (WCAG 1.4.1). */
const TONE_WORD: Record<AttentionTone, string> = {
  danger: "Risk",
  warning: "Due",
  info: "Info",
};

/**
 * A single "needs attention" item. Severity is carried by a tone WORD in the
 * leading chip AND by colour (never colour alone — WCAG 1.4.1), with the count
 * trailing. Presentational + router-agnostic. Reused anywhere work needs triage.
 */
export function AttentionRow({ label, count, tone, interactive = false, className }: AttentionRowProps) {
  return (
    <div
      className={[styles.row, styles[tone], interactive ? styles.interactive : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.chip}>{TONE_WORD[tone]}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.count}>{count.toLocaleString()}</span>
    </div>
  );
}
