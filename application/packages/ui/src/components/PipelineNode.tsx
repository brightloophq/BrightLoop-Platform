import styles from "./PipelineNode.module.css";

export interface PipelineNodeProps {
  label: string;
  count: number;
  /** Position in the loop — trims the connecting rail at the ends. */
  position?: "first" | "middle" | "last" | "only";
  interactive?: boolean;
  className?: string;
}

/**
 * One stage of the transformation loop — Auxion's signature motif. Stages sit on
 * a continuous rail (a filled marker where work exists, hollow where it doesn't),
 * so the pipeline reads as one operational flow rather than a row of chips. This
 * is the element meant to make an Auxion screen recognizable at a glance.
 *
 * Presentational + router-agnostic; wrap in a link where navigation is needed.
 */
export function PipelineNode({
  label,
  count,
  position = "middle",
  interactive = false,
  className,
}: PipelineNodeProps) {
  return (
    <div
      className={[styles.node, interactive ? styles.interactive : null, className]
        .filter(Boolean)
        .join(" ")}
      data-position={position}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.rail} />
        <span className={styles.marker} data-filled={count > 0 ? "true" : "false"} />
      </span>
      <span className={styles.count}>{count.toLocaleString()}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
