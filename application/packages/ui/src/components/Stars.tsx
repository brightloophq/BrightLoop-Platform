import { Star } from "lucide-react";
import styles from "./Stars.module.css";

export interface StarsProps {
  /** 0–5. Rounded to the nearest whole star for the glyphs. */
  value: number;
  size?: number;
  /** Show the numeric value beside the stars. */
  showValue?: boolean;
  className?: string;
}

/**
 * Stars — rating display.
 *
 * Accessibility (handoff §11.2): the rating is exposed as text
 * ("4.8 out of 5") rather than by colour/glyph alone, and the glyphs are
 * hidden from assistive tech so it is announced once.
 */
export function Stars({ value, size = 15, showValue = false, className }: StarsProps) {
  const rounded = Math.round(value);
  const label = `${value.toFixed(1)} out of 5`;

  return (
    <span className={[styles.row, className].filter(Boolean).join(" ")} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden="true"
          className={i <= rounded ? undefined : styles.empty}
          fill={i <= rounded ? "currentColor" : "none"}
          strokeWidth={1.5}
        />
      ))}
      {showValue ? (
        <span className={styles.value} aria-hidden="true">
          {value.toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}
