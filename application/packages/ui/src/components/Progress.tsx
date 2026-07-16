import styles from "./Progress.module.css";

export interface ProgressProps {
  /** 0–100. Clamped. */
  value: number;
  label?: string;
  className?: string;
}

/**
 * Progress — determinate bar.
 *
 * Accessibility: a real progressbar role with aria-valuenow/min/max, so the
 * value is announced rather than conveyed by width alone.
 */
export function Progress({ value, label, className }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
