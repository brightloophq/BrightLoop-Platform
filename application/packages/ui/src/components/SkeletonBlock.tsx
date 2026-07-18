import styles from "./SkeletonBlock.module.css";

export interface SkeletonBlockProps {
  /** CSS width (default fills container). */
  width?: string;
  /** CSS height. */
  height?: string;
  /** Corner radius token value (default md). */
  radius?: string;
  /** Accessible label for the loading region wrapper (set on a parent instead if grouping). */
  className?: string;
}

/**
 * A loading placeholder. A calm opacity pulse (transform/opacity only) that goes
 * static under prefers-reduced-motion. The one primitive every module uses for
 * loading states, so "waiting" looks the same product-wide — never a blank area.
 */
export function SkeletonBlock({ width, height = "1rem", radius = "var(--radius-md)", className }: SkeletonBlockProps) {
  return (
    <span
      className={[styles.block, className].filter(Boolean).join(" ")}
      style={{ width: width ?? "100%", height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
