import styles from "./Stars.module.css";

export interface StarsProps {
  /** 0–5. */
  value: number;
  /** Height of the meter in px. */
  size?: number;
  /** Show the numeric value beside the meter. */
  showValue?: boolean;
  className?: string;
}

/**
 * Stars — rating display, drawn as a proportional meter rather than five star
 * glyphs.
 *
 * The name is kept because every call site and the reputation data speak in
 * "stars"; only the rendering changed. This is strictly MORE precise than the
 * glyphs were: those rounded 4.8 to five whole stars, so 4.6 and 5.0 looked
 * identical. The meter fills to the real fraction.
 *
 * Accessibility (handoff §11.2): the rating is exposed once as text
 * ("4.8 out of 5") on the wrapper, and the bars are hidden from assistive tech.
 */
export function Stars({ value, size = 15, showValue = false, className }: StarsProps) {
  // Clamp before converting to a width: bad upstream data must not paint a bar
  // wider than its track (or a negative one).
  const pct = `${Math.max(0, Math.min(1, value / 5)) * 100}%`;
  const label = `${value.toFixed(1)} out of 5`;

  return (
    <span className={[styles.row, className].filter(Boolean).join(" ")} role="img" aria-label={label}>
      <span className={styles.track} style={{ height: Math.max(3, Math.round(size / 4)) }} aria-hidden="true">
        <span className={styles.fill} style={{ width: pct }} />
      </span>
      {showValue ? (
        <span className={styles.value} aria-hidden="true">
          {value.toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}
