import styles from "./CategoryRatings.module.css";

export interface CategoryRatingsProps {
  /** category → rating (1–5). */
  categories: Readonly<Record<string, number>>;
  /** Show one decimal (aggregate averages) vs whole numbers (a single review). */
  precise?: boolean;
}

/**
 * CategoryRatings — the five per-category rating bars.
 *
 * Accessibility (handoff §11.2): each row is a real progressbar with an
 * aria-valuetext of "4.8 out of 5", so the score is never conveyed by bar length
 * alone. The numeric value is also rendered as text beside it.
 */
export function CategoryRatings({ categories, precise = false }: CategoryRatingsProps) {
  return (
    <div className={styles.list}>
      {Object.entries(categories).map(([label, value]) => {
        const display = precise ? value.toFixed(1) : String(Math.round(value));
        return (
          <div key={label} className={styles.row}>
            <span className={styles.label}>{label}</span>
            <div
              className={styles.track}
              role="progressbar"
              aria-label={label}
              aria-valuenow={Math.round(value * 10) / 10}
              aria-valuemin={0}
              aria-valuemax={5}
              aria-valuetext={`${display} out of 5`}
            >
              <div className={styles.fill} style={{ width: `${(value / 5) * 100}%` }} />
            </div>
            <span className={styles.value} aria-hidden="true">
              {display}
            </span>
          </div>
        );
      })}
    </div>
  );
}
