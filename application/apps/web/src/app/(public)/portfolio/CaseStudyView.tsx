import Link from "next/link";
import { AWARDS, type AwardKey, type PortfolioProject, type Testimonial } from "@brightloop/schema";
import {
  canShowLivePreview,
  canonicalUrl,
  disclosedMetrics,
  schemaFor,
} from "@brightloop/domain";
import {
  Alert,
  Badge,
  Button,
  Card,
  CategoryRatings,
  Container,
  Eyebrow,
  Icon,
  MediaTile,
  ProjectCard,
  Section,
  Stars,
  Stat,
  StatChip,
  Tag,
} from "@brightloop/ui";
import { safeJsonLd } from "@/lib/json-ld";
import home from "../home.module.css";
import styles from "./case-study.module.css";

export interface CaseStudyViewProps {
  project: PortfolioProject;
  testimonial: Testimonial | null;
  related: PortfolioProject[];
  /** "portfolio" = /portfolio/:slug · "case" = the long-form /case-studies/:slug view. */
  variant: "portfolio" | "case";
}

/**
 * Case study (handoff §05).
 *
 * Both /portfolio/:slug and /case-studies/:slug render the SAME record — the
 * prototype treats them as one project, and open decision 6 asks to confirm.
 * Until then /case-studies is the long-form view and canonicalises to
 * /portfolio/:slug so the two never compete in search.
 *
 * TWO GATES ARE LOAD-BEARING HERE:
 *   1. Results render only via `disclosedMetrics()` — which returns [] unless the
 *      client approved disclosure AND real values exist. Otherwise the honest
 *      "kept private at the client's request" panel shows. There is no code path
 *      that renders a zero or an invented figure.
 *   2. Live-site CTAs render only via `canShowLivePreview()` — permission AND a
 *      real URL.
 */
export function CaseStudyView({ project, testimonial, related, variant }: CaseStudyViewProps) {
  const metrics = disclosedMetrics(project);
  const showLive = canShowLivePreview(project);
  const schema = schemaFor(project, testimonial);
  const canonical = canonicalUrl(variant === "case" ? "case" : "portfolio", project.slug);

  // flatMap rather than map+filter: AWARDS labels are literal types, so a
  // `label is string` predicate would widen illegally.
  const awardLabels = project.awards.flatMap((a) => {
    const label = AWARDS[a as AwardKey]?.label;
    return label ? [label] : [];
  });

  return (
    <>
      {/* JSON-LD. schemaFor() returns null for unpublished content, so this
          cannot emit structured data for something that isn't live. */}
      {schema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
        />
      ) : null}

      <Section rhythm="hero">
        <Container width="wide">
          <Link href="/portfolio" className={styles.back}>
            <Icon name="arrow-left" size={14} />
            Back to portfolio
          </Link>

          <div className={styles.badges}>
            <Badge tone="cyan">{project.industry}</Badge>
            {project.services.map((s) => (
              <Badge key={s} tone="neutral">
                {s}
              </Badge>
            ))}
            {awardLabels.map((label) => (
              <Badge key={label} tone="warning" dot>
                {label}
              </Badge>
            ))}
          </div>

          <h1 className={styles.title}>{project.name}</h1>
          <p className={styles.summary}>{project.summary}</p>

          <div className={styles.headActions}>
            {showLive ? (
              <>
                <Button variant="primary" size="md" asChild>
                  <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                    Visit live website
                  </a>
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  rightIcon={<Icon name="external-link" size={14} />}
                  asChild
                >
                  <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                    Open in new tab
                  </a>
                </Button>
              </>
            ) : (
              // Honest state — not an error, just an absence.
              <span className={styles.noPreview}>
                <Icon name="lock" size={14} />
                Live preview not shared for this project.
              </span>
            )}
          </div>

          <div className={styles.hero}>
            Hero image pending — slot “{project.heroSlot}”
          </div>

          {/* Project FACTS. Always safe to show: these are ours, not the client's
              business results. */}
          <div className={styles.facts}>
            <StatChip label="Timeline" value={project.timeline} />
            <StatChip label="Services" value={project.services.join(", ")} />
            <StatChip label="Deliverables" value={String(project.deliverablesCount)} />
            <StatChip label="Industry" value={project.industry} />
            <StatChip label="Platform" value={project.platform} />
            <StatChip label="Completed" value={project.completedDate} />
            <StatChip label="Status" value={project.projectStatus} />
            <StatChip label="Business size" value={project.size} />
          </div>

          <div className={styles.body}>
            <div className={styles.prose}>
              <h2>The challenge</h2>
              <p>{project.challenge}</p>

              <h2>Our approach</h2>
              <p>{project.approach}</p>

              <h2>Results</h2>
              {metrics.length > 0 ? (
                <div className={styles.results}>
                  {metrics.map((m) => (
                    <Card key={m.key}>
                      <Stat
                        accent
                        value={`${m.value}${m.unit}`}
                        label={m.label}
                      />
                    </Card>
                  ))}
                </div>
              ) : (
                <Alert tone="neutral" title="Results kept private at the client's request" icon="lock">
                  This client has chosen not to publish their business results. We don&apos;t
                  estimate, extrapolate or invent numbers to fill the gap — the project facts above
                  are what we can verify.
                </Alert>
              )}

              {project.media.length > 0 ? (
                <>
                  <h2>Gallery</h2>
                  <div className={styles.gallery}>
                    {project.media.map((item) => (
                      <MediaTile
                        key={`${item.kind}-${item.label}`}
                        kind={item.kind}
                        label={item.label}
                        url={item.url}
                        slot={item.slot}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            {/* ---- sidebar ---- */}
            <aside className={styles.side}>
              <Card>
                <h2 className={styles.sideTitle}>Technology</h2>
                <div className={styles.tagRow}>
                  {project.tech.map((t) => (
                    <Tag key={t} accent>
                      {t}
                    </Tag>
                  ))}
                </div>
              </Card>

              {project.tags.length > 0 ? (
                <Card>
                  <h2 className={styles.sideTitle}>Tags</h2>
                  <div className={styles.tagRow}>
                    {project.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                </Card>
              ) : null}

              {/* SEO & metadata panel (handoff §05) — documents exactly what this
                  page emits, so it's auditable without reading the HTML source. */}
              <Card>
                <h2 className={styles.sideTitle}>SEO &amp; metadata</h2>
                <div className={styles.seoRow}>
                  <span className={styles.seoLabel}>Canonical</span>
                  <span className={styles.seoValue}>
                    {canonicalUrl("portfolio", project.slug)}
                  </span>
                </div>
                <div className={styles.seoRow}>
                  <span className={styles.seoLabel}>Title</span>
                  <span className={styles.seoValue}>{project.seo.title}</span>
                </div>
                <div className={styles.seoRow}>
                  <span className={styles.seoLabel}>Description</span>
                  <span className={styles.seoValue}>{project.seo.description}</span>
                </div>
                <div className={styles.seoRow}>
                  <span className={styles.seoLabel}>Structured data</span>
                  <span className={styles.seoValue}>
                    CreativeWork{schema?.review ? " + Review" : ""}
                  </span>
                </div>
                {variant === "case" ? (
                  <div className={styles.seoRow}>
                    <span className={styles.seoLabel}>This URL</span>
                    <span className={styles.seoValue}>{canonical}</span>
                  </div>
                ) : null}
              </Card>
            </aside>
          </div>
        </Container>
      </Section>

      {/* ---- testimonial ---- */}
      {testimonial ? (
        <Section inset>
          <Container width="wide">
            <Eyebrow>What the client said</Eyebrow>
            <div className={styles.quoteBlock}>
              <figure style={{ margin: 0 }}>
                <Stars value={testimonial.overall} showValue />
                <blockquote className={styles.quote} style={{ marginTop: "var(--space-4)" }}>
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className={styles.quoteWho}>
                  {testimonial.author} — {testimonial.role}, {testimonial.company}
                </figcaption>
              </figure>
              <Card>
                <h2 className={styles.sideTitle}>Rated by category</h2>
                <CategoryRatings categories={testimonial.categories} />
              </Card>
            </div>
          </Container>
        </Section>
      ) : null}

      {/* ---- related ---- */}
      {related.length > 0 ? (
        <Section>
          <Container width="wide">
            <div className={home.head}>
              <Eyebrow>More work</Eyebrow>
              <h2 className={home.title}>You may also like</h2>
            </div>
            <div className={styles.related}>
              {related.map((p) => (
                <ProjectCard
                  key={p.slug}
                  name={p.name}
                  summary={p.summary}
                  industry={p.industry}
                  services={p.services}
                  href={`/portfolio/${p.slug}`}
                  year={p.year}
                  timeline={p.timeline}
                />
              ))}
            </div>
          </Container>
        </Section>
      ) : null}
    </>
  );
}
