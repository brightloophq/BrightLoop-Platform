import Link from "next/link";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { Stars } from "./Stars";
import { Tag } from "./Tag";
import styles from "./ProjectCard.module.css";

export interface ProjectCardProps {
  name: string;
  summary: string;
  industry: string;
  services: readonly string[];
  href: string;
  year: number;
  /** Project fact — not a result metric. */
  timeline?: string;
  /** Award labels, resolved by the caller from the AWARDS vocab. */
  awards?: readonly string[];
  /** Rating of the linked PUBLISHED testimonial, when one exists. */
  rating?: number;
  mediaLabel?: string;
}

/**
 * ProjectCard — one project in the portfolio grid.
 *
 * INTEGRITY: shows project FACTS (industry, services, year, timeline) and, when
 * a published testimonial is linked, its rating. There is no prop for a business
 * result — result metrics live only on the case-study Results panel, gated by
 * `disclosedMetrics()`.
 */
export function ProjectCard({
  name,
  summary,
  industry,
  services,
  href,
  year,
  timeline,
  awards = [],
  rating,
  mediaLabel = "Project imagery pending",
}: ProjectCardProps) {
  return (
    <Card interactive flush>
      <Link href={href} className={styles.card} style={{ padding: "var(--space-4)" }}>
        <div className={styles.media}>
          {awards.length > 0 ? (
            <span className={styles.awards}>
              {awards.map((award) => (
                <Badge key={award} tone="cyan">
                  {award}
                </Badge>
              ))}
            </span>
          ) : null}
          <span className={styles.mediaLabel}>{mediaLabel}</span>
        </div>

        <div className={styles.badges}>
          <Badge tone="cyan">{industry}</Badge>
          {services.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
        </div>

        <h3 className={styles.name}>{name}</h3>
        <p className={styles.summary}>{summary}</p>

        <span className={styles.foot}>
          <span className={styles.meta}>
            <span>{year}</span>
            {timeline ? <span>· {timeline}</span> : null}
          </span>
          {typeof rating === "number" ? (
            <span className={styles.rating}>
              <Stars value={rating} size={13} />
            </span>
          ) : null}
        </span>
      </Link>
    </Card>
  );
}
