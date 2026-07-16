import Link from "next/link";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Stars } from "./Stars";
import styles from "./Testimonial.module.css";

export interface TestimonialProps {
  quote: string;
  author: string;
  role: string;
  company: string;
  overall: number;
  /** Link to the linked project's case study, when one is published. */
  projectHref?: string;
  projectLabel?: string;
}

/** Initials fallback while real avatar media is outstanding (open decision 13). */
function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Testimonial — a single review.
 *
 * INTEGRITY: only publish ∈ {public, featured} reviews ever reach this
 * component; the gate is applied by the repository, not here.
 */
export function Testimonial({
  quote,
  author,
  role,
  company,
  overall,
  projectHref,
  projectLabel = "View project",
}: TestimonialProps) {
  return (
    <Card className={styles.card} as="figure">
      <Stars value={overall} />
      <blockquote className={styles.quote}>“{quote}”</blockquote>
      <figcaption className={styles.author}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(author)}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{author}</span>
          <span className={styles.role}>
            {role}, {company}
          </span>
        </span>
        {projectHref ? (
          <Link href={projectHref} className={styles.link}>
            {projectLabel}
            <Icon name="arrow-right" size={12} />
          </Link>
        ) : null}
      </figcaption>
    </Card>
  );
}
