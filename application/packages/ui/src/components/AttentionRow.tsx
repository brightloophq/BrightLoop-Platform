import { Icon } from "./Icon";
import styles from "./AttentionRow.module.css";

export type AttentionTone = "danger" | "warning" | "info";

export interface AttentionRowProps {
  label: string;
  count: number;
  tone: AttentionTone;
  /** Icon name; falls back to a per-tone default so severity is never colour-only. */
  icon?: string;
  interactive?: boolean;
  className?: string;
}

const DEFAULT_ICON: Record<AttentionTone, string> = {
  danger: "bell",
  warning: "clock",
  info: "activity",
};

/**
 * A single "needs attention" item. Severity is carried by a tone-tinted icon
 * chip AND colour (never colour alone — WCAG 1.4.1), with the count trailing.
 * Presentational + router-agnostic. Reused anywhere work needs triage.
 */
export function AttentionRow({ label, count, tone, icon, interactive = false, className }: AttentionRowProps) {
  return (
    <div
      className={[styles.row, styles[tone], interactive ? styles.interactive : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.chip} aria-hidden="true">
        <Icon name={icon ?? DEFAULT_ICON[tone]} size={15} />
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.count}>{count.toLocaleString()}</span>
    </div>
  );
}
