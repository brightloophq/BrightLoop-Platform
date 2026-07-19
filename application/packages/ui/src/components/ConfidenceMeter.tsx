import styles from "./ConfidenceMeter.module.css";

export type ConfidenceBand = "unrated" | "low" | "medium" | "high";

export interface ConfidenceMeterProps {
  /** 0–100 integer, or null when the insight is unrated. */
  percent: number | null;
  /** Qualitative band — drives the restrained fill tint. */
  band: ConfidenceBand;
  /** Human label for the band (e.g. "High"). Falls back to a capitalized band. */
  bandLabel?: string;
  size?: "sm" | "md";
  /** Show the numeric/band text beside the track. Default true. */
  showValue?: boolean;
  className?: string;
}

const DEFAULT_BAND_LABEL: Record<ConfidenceBand, string> = {
  unrated: "Unrated",
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * ConfidenceMeter — a calibrated 0..1 confidence rendered as a restrained bar.
 *
 * Confidence is presentation-only here: the caller computes `percent`/`band`
 * (domain `confidencePercent` / `confidenceBand`) so this primitive stays free of
 * business logic and reusable by any transformation module (Insights now,
 * Recommendations later). Accessibility: a real progressbar with aria-valuenow so
 * the value is announced, and the band word is always rendered — never color
 * alone. An unrated insight shows an empty track and muted "Unrated" text.
 */
export function ConfidenceMeter({
  percent,
  band,
  bandLabel,
  size = "md",
  showValue = true,
  className,
}: ConfidenceMeterProps) {
  const rated = percent !== null;
  const pct = rated ? Math.max(0, Math.min(100, percent)) : 0;
  const label = bandLabel ?? DEFAULT_BAND_LABEL[band];
  const classes = [styles.wrap, styles[size], className].filter(Boolean).join(" ");
  const ariaLabel = rated ? `Confidence ${pct}% (${label})` : "Confidence unrated";

  return (
    <div className={classes}>
      <div
        className={styles.track}
        data-band={band}
        role="progressbar"
        aria-valuenow={rated ? pct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        {rated ? <div className={styles.fill} style={{ width: `${pct}%` }} /> : null}
      </div>
      {showValue ? (
        <span className={styles.value}>
          {rated ? (
            <>
              <span className={styles.pct}>{pct}%</span>
              <span className={styles.band}>{label}</span>
            </>
          ) : (
            <span className={styles.unrated}>{label}</span>
          )}
        </span>
      ) : null}
    </div>
  );
}
