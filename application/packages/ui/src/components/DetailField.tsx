import type { ReactNode } from "react";
import styles from "./DetailField.module.css";

export interface DetailFieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Span the full width of a DetailGrid. */
  wide?: boolean;
  className?: string;
}

/**
 * A single labelled fact on an operational detail surface (label above value).
 * Reused across every entity's detail page. Render inside a `<DetailGrid>`.
 */
export function DetailField({ label, children, wide = false, className }: DetailFieldProps) {
  return (
    <div className={[styles.field, wide ? styles.wide : null, className].filter(Boolean).join(" ")}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

export interface DetailGridProps {
  children: ReactNode;
  className?: string;
}

/** A responsive grid of DetailFields (semantic `<dl>`). */
export function DetailGrid({ children, className }: DetailGridProps) {
  return <dl className={[styles.grid, className].filter(Boolean).join(" ")}>{children}</dl>;
}
