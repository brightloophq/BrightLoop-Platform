import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Icon } from "./Icon";
import styles from "./PricingCard.module.css";

export interface PricingCardProps {
  name: string;
  blurb: string;
  /** Pre-formatted estimate RANGE, e.g. "$1,800–$3,600". Never a single figure. */
  range: string;
  /**
   * The non-binding qualifier. REQUIRED — a price may not render without it, so
   * an estimate can never be presented as a guaranteed quote.
   */
  estimateQualifier: string;
  estimateLabel?: string;
  includes: readonly string[];
  tag?: string;
  recommended?: boolean;
  weeks?: string;
  action: ReactNode;
}

/**
 * PricingCard — a productised plan.
 *
 * PRICING INTEGRITY: `range` is always a range and `estimateQualifier` is a
 * required prop rendered directly beneath it. There is no prop combination that
 * displays a bare number that could read as a final quote. Binding figures live
 * only on Proposal/Contract.
 */
export function PricingCard({
  name,
  blurb,
  range,
  estimateQualifier,
  estimateLabel = "Estimated range",
  includes,
  tag,
  recommended = false,
  weeks,
  action,
}: PricingCardProps) {
  return (
    <Card className={[styles.card, recommended ? styles.recommended : null].filter(Boolean).join(" ")}>
      <div className={styles.head}>
        <h3 className={styles.name}>{name}</h3>
        {tag ? <Badge tone={recommended ? "cyan" : "neutral"}>{tag}</Badge> : null}
      </div>

      <p className={styles.blurb}>{blurb}</p>

      <div className={styles.priceBlock}>
        <span className={styles.estimateLabel}>{estimateLabel}</span>
        <span className={styles.range}>{range}</span>
        <span className={styles.qualifier}>{estimateQualifier}</span>
      </div>

      {weeks ? <span className={styles.weeks}>{weeks}</span> : null}

      <ul className={styles.list}>
        {includes.map((item) => (
          <li key={item} className={styles.item}>
            <Icon name="check" size={14} className={styles.check} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {action}
    </Card>
  );
}
