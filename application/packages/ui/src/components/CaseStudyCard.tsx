import Link from "next/link";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Icon } from "./Icon";
import styles from "./CaseStudyCard.module.css";

export interface CaseStudyFact {
  label: string;
  value: string;
}

export interface CaseStudyCardProps {
  name: string;
  summary: string;
  industry: string;
  services: readonly string[];
  href: string;
  /**
   * PROJECT FACTS ONLY (timeline, deliverables, platform, completion).
   * Result metrics are NOT accepted here — they are gated by disclosedMetrics()
   * and rendered by the case-study Results panel, never by a marketing card.
   */
  facts?: readonly CaseStudyFact[];
  /** Alt text for the hero image once real media exists. */
  mediaNote?: string;
  ctaLabel?: string;
}

/**
 * CaseStudyCard — the homepage marquee proof block.
 *
 * INTEGRITY: this card shows the project's own facts and its summary. It cannot
 * display a business result: there is no prop for one.
 */
export function CaseStudyCard({
  name,
  summary,
  industry,
  services,
  href,
  facts = [],
  mediaNote = "Hero image pending — real project photography outstanding",
  ctaLabel = "Read the case study",
}: CaseStudyCardProps) {
  return (
    <Card interactive flush>
      <Link href={href} className={styles.card} style={{ padding: "var(--space-6)" }}>
        <div className={styles.body}>
          <div className={styles.badges}>
            <Badge tone="cyan">{industry}</Badge>
            {services.map((s) => (
              <Badge key={s} tone="neutral">
                {s}
              </Badge>
            ))}
          </div>

          <h3 className={styles.name}>{name}</h3>
          <p className={styles.summary}>{summary}</p>

          {facts.length > 0 ? (
            <div className={styles.facts}>
              {facts.map((f) => (
                <span key={f.label} className={styles.fact}>
                  <span className={styles.factLabel}>{f.label}</span>
                  <span className={styles.factValue}>{f.value}</span>
                </span>
              ))}
            </div>
          ) : null}

          <span className={styles.cta}>
            {ctaLabel}
            <Icon name="arrow-right" size={14} />
          </span>
        </div>

        <div className={styles.media}>
          <span className={styles.mediaNote}>{mediaNote}</span>
        </div>
      </Link>
    </Card>
  );
}
