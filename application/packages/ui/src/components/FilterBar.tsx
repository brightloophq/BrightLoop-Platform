import type { ReactNode } from "react";
import styles from "./FilterBar.module.css";

export interface FilterBarProps {
  /** Search / select controls, left-aligned. */
  children: ReactNode;
  /** Right-aligned controls (e.g. sort, a primary action). */
  trailing?: ReactNode;
  /** Active-constraint chips + a clear action, shown on a second row when present. */
  chips?: ReactNode;
  /** Accessible label for the toolbar region. */
  label?: string;
  className?: string;
}

/**
 * The standard filter/search toolbar for a workspace: a control row plus an
 * optional row of active-constraint chips. Presentational + responsive; the page
 * supplies the URL-driven controls. Reused across list modules.
 */
export function FilterBar({ children, trailing, chips, label = "Filters", className }: FilterBarProps) {
  return (
    <div className={[styles.bar, className].filter(Boolean).join(" ")} role="search" aria-label={label}>
      <div className={styles.controls}>
        <div className={styles.leading}>{children}</div>
        {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
      </div>
      {chips ? <div className={styles.chips}>{chips}</div> : null}
    </div>
  );
}
