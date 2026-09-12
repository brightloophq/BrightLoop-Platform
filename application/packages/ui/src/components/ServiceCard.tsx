import Link from "next/link";
import { Card } from "./Card";
import styles from "./ServiceCard.module.css";

export interface ServiceCardProps {
  name: string;
  outcome: string;
  blurb: string;
  href: string;
  /** e.g. "3 modules" — supplied by the caller from catalog data. */
  meta?: string;
  /**
   * Position in the sequence, e.g. "01". The disciplines are an ORDERED loop
   * (Brand → Build → Automate → Grow), so a numeral says something true about
   * the card that the pictogram it replaced never did.
   */
  index?: string;
  exploreLabel?: string;
}

/** ServiceCard — a discipline of the loop, linking into its detail page. */
export function ServiceCard({
  name,
  outcome,
  blurb,
  href,
  meta,
  index,
  exploreLabel = "Explore",
}: ServiceCardProps) {
  return (
    <Card interactive flush>
      <Link href={href} className={styles.card} style={{ padding: "var(--space-5)" }}>
        {index ? <span className={styles.index}>{index}</span> : <span className={styles.rule} aria-hidden="true" />}
        <h3 className={styles.name}>{name}</h3>
        <p className={styles.outcome}>{outcome}</p>
        <p className={styles.blurb}>{blurb}</p>
        <span className={styles.foot}>
          {meta ? <span className={styles.meta}>{meta}</span> : <span />}
          <span className={styles.explore}>{exploreLabel}</span>
        </span>
      </Link>
    </Card>
  );
}
