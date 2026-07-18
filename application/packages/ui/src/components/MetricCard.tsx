import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./MetricCard.module.css";

export interface MetricCardProps {
  label: ReactNode;
  /** The figure. `null` renders the empty state — never a misleading zero. */
  value: number | string | null;
  suffix?: ReactNode;
  /** Icon name (kebab-case) shown beside the label. */
  icon?: string;
  /** `hero` is a primary figure (Business Health / Transformation Index). */
  emphasis?: "hero" | "default";
  /** Supporting context under the value (e.g. a delta or scope note). */
  caption?: ReactNode;
  emptyLabel?: string;
  /** Adds interactive affordance styling (hover lift). Routing stays outside. */
  interactive?: boolean;
  className?: string;
}

/**
 * The single metric primitive for every Auxion module. Presentational and
 * router-agnostic — wrap it in a link where navigation is needed. A `hero`
 * emphasis gives the two headline figures visual primacy over supporting counts,
 * which is what creates hierarchy instead of a wall of equal numbers.
 */
export function MetricCard({
  label,
  value,
  suffix,
  icon,
  emphasis = "default",
  caption,
  emptyLabel = "No data yet",
  interactive = false,
  className,
}: MetricCardProps) {
  return (
    <div
      className={[
        styles.card,
        emphasis === "hero" ? styles.hero : null,
        interactive ? styles.interactive : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.label}>
        {icon ? <Icon name={icon} size={16} className={styles.icon} /> : null}
        {label}
      </span>
      {value === null ? (
        <span className={styles.empty}>{emptyLabel}</span>
      ) : (
        <span className={styles.value}>
          {typeof value === "number" ? value.toLocaleString() : value}
          {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
        </span>
      )}
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </div>
  );
}
