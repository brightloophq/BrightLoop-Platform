import Link from "next/link";
import { Card } from "./Card";
import { Icon } from "./Icon";
import styles from "./ServiceCard.module.css";

export interface ServiceCardProps {
  name: string;
  outcome: string;
  blurb: string;
  icon: string;
  href: string;
  /** e.g. "3 modules" — supplied by the caller from catalog data. */
  meta?: string;
  exploreLabel?: string;
}

/** ServiceCard — a discipline of the loop, linking into its detail page. */
export function ServiceCard({
  name,
  outcome,
  blurb,
  icon,
  href,
  meta,
  exploreLabel = "Explore",
}: ServiceCardProps) {
  return (
    <Card interactive flush>
      <Link href={href} className={styles.card} style={{ padding: "var(--space-5)" }}>
        <span className={styles.icon}>
          <Icon name={icon} size={22} />
        </span>
        <h3 className={styles.name}>{name}</h3>
        <p className={styles.outcome}>{outcome}</p>
        <p className={styles.blurb}>{blurb}</p>
        <span className={styles.foot}>
          {meta ? <span className={styles.meta}>{meta}</span> : <span />}
          <span className={styles.explore}>
            {exploreLabel}
            <Icon name="arrow-right" size={14} />
          </span>
        </span>
      </Link>
    </Card>
  );
}
