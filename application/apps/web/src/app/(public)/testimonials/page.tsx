import Link from "next/link";
import type { Metadata } from "next";
import { aggregateSchema, canonicalUrl } from "@brightloop/domain";
import {
  Alert,
  Badge,
  Card,
  CategoryRatings,
  Container,
  Eyebrow,
  Icon,
  Section,
  Stars,
} from "@brightloop/ui";
import { getReputationRepository } from "@/lib/repositories";
import { safeJsonLd } from "@/lib/json-ld";
import home from "../home.module.css";
import styles from "./testimonials.module.css";

export const metadata: Metadata = {
  title: "Testimonials",
  description: "What Auxion clients say — verified reviews with per-category ratings.",
  alternates: { canonical: canonicalUrl("testimonials") },
};

const STAR_FILTERS = [
  { label: "All reviews", value: undefined, href: "/testimonials" },
  { label: "5 stars", value: 5, href: "/testimonials?min=5" },
  { label: "4+ stars", value: 4, href: "/testimonials?min=4" },
] as const;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Testimonials wall (handoff §05).
 *
 * Aggregate + per-category averages are computed over PUBLISHED reviews only,
 * and pinned reviews sort first. When nothing is published the page says so
 * rather than rendering a 0-star score, and no AggregateRating is emitted —
 * `aggregateSchema()` returns null for an empty set, because reviewCount: 0 in
 * structured data would be a claim rather than an absence.
 */
export default async function TestimonialsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawMin = Array.isArray(params["min"]) ? params["min"][0] : params["min"];
  const parsed = Number.parseInt(rawMin ?? "", 10);
  // Only 4 and 5 are offered; anything else means "all".
  const minRating = parsed === 4 || parsed === 5 ? parsed : undefined;

  const repo = await getReputationRepository();
  const [testimonials, aggregate] = await Promise.all([
    repo.listTestimonials(minRating ? { minRating } : {}),
    repo.getAggregateRating(),
  ]);

  const schema = aggregateSchema(aggregate);

  return (
    <Section rhythm="hero">
      {schema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
        />
      ) : null}

      <Container width="wide">
        <div className={`${home.head} ${home.headCentered}`}>
          <Eyebrow>Testimonials</Eyebrow>
          <h1 className={home.title}>Rated by the businesses we build for</h1>
          <p className={home.lede}>
            Every review below is from a real client, published with their permission.
          </p>
        </div>

        {aggregate.count > 0 ? (
          <>
            <div className={styles.aggregate}>
              <div className={styles.score}>
                <span className={styles.big}>{aggregate.overall.toFixed(1)}</span>
                <Stars value={aggregate.overall} size={18} />
                <span className={styles.count}>
                  based on {aggregate.count} verified {aggregate.count === 1 ? "review" : "reviews"}
                </span>
              </div>
              <CategoryRatings categories={aggregate.cats} precise />
            </div>

            <div className={styles.filters}>
              {STAR_FILTERS.map((f) => (
                <Link
                  key={f.label}
                  href={f.href}
                  className={[styles.filter, minRating === f.value ? styles.filterActive : null]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={minRating === f.value ? "page" : undefined}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <Alert tone="neutral" title="No published reviews yet">
            Reviews appear here once they are real, attributed and approved for publication. We
            don&apos;t show a rating until there is one to show.
          </Alert>
        )}

        {testimonials.length > 0 ? (
          <div className={styles.wall}>
            {testimonials.map((t) => (
              <div key={t.id} className={styles.wallItem}>
                <Card className={styles.card} as="figure">
                  {t.pinned ? (
                    <span className={styles.pinned}>
                      <Badge tone="cyan" dot>
                        Pinned
                      </Badge>
                    </span>
                  ) : null}

                  <Stars value={t.overall} />
                  <blockquote className={styles.quote}>“{t.quote}”</blockquote>

                  <details className={styles.details}>
                    <summary className={styles.summary}>
                      <Icon name="chevron-down" size={12} />
                      Rated by category
                    </summary>
                    <div className={styles.detailsBody}>
                      <CategoryRatings categories={t.categories} />
                    </div>
                  </details>

                  <figcaption className={styles.who}>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(t.author)}
                    </span>
                    <span>
                      <span className={styles.name}>{t.author}</span>
                      <span className={styles.role}>
                        {t.role}, {t.company}
                      </span>
                    </span>
                    {t.projectSlug ? (
                      <Link href={`/portfolio/${t.projectSlug}`} className={styles.link}>
                        View project
                      </Link>
                    ) : null}
                  </figcaption>
                </Card>
              </div>
            ))}
          </div>
        ) : aggregate.count > 0 ? (
          <Alert tone="neutral" title="No reviews match that filter">
            Try a lower star threshold.
          </Alert>
        ) : null}
      </Container>
    </Section>
  );
}
