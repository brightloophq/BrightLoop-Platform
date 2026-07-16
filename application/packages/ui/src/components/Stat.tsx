import type { ReactNode } from "react";
import styles from "./Stat.module.css";

export interface StatProps {
  value: ReactNode;
  label: ReactNode;
  accent?: boolean;
  className?: string;
}

/**
 * Stat — a display figure with a label.
 *
 * INTEGRITY: this component renders whatever it is given. It must never be fed
 * an invented business result. Portfolio result metrics are gated by
 * `disclosedMetrics()` in the domain layer before they reach here.
 */
export function Stat({ value, label, accent = false, className }: StatProps) {
  return (
    <div className={[styles.stat, accent ? styles.accent : null, className].filter(Boolean).join(" ")}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

export interface StatChipProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

/** Compact label/value chip — project-facts grids. */
export function StatChip({ label, value, className }: StatChipProps) {
  return (
    <div className={[styles.chip, className].filter(Boolean).join(" ")}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>{value}</span>
    </div>
  );
}
