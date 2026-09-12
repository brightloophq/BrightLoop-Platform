import Link from "next/link";
import type { Metadata } from "next";
import { DISCIPLINE_SLUGS, type Discipline } from "@brightloop/schema";
import { PLACEHOLDER_DISCIPLINE_COPY } from "@brightloop/data";
import {
  Alert,
  Button,
  CaseStudyCard,
  Container,
  Eyebrow,
  Marquee,
  Section,
  Stars,
  Testimonial,
} from "@brightloop/ui";
import { CountUp, HeroSequence, Reveal } from "@brightloop/ui/motion";
import { getCatalogRepository, getReputationRepository } from "@/lib/repositories";
import { TransformationJourney } from "./_sections/TransformationJourney";
import { PlatformShowcase } from "./_sections/PlatformShowcase";
import { RibbonRail } from "./_sections/RibbonRail";
import styles from "./home.module.css";

/**
 * The public capability strip. These are capability CATEGORIES that map directly
 * to the four disciplines (Brand · Build · Automate · Grow) — neutral nouns, not
 * fabricated service claims or metrics. Content, never motion, lives here.
 */
const CAPABILITY_MARQUEE = [
  "Brand",
  "Strategy",
  "Design",
  "Build",
  "Websites",
  "Funnels",
  "Automate",
  "Workflows",
  "Operations",
  "Grow",
  "Analytics",
  "Optimisation",
] as const;

/**
 * ISR, 5 min — the featured case study comes from the CMS and must appear
 * without a deploy. Literal, not imported: Next requires segment config to be
 * statically analysable. Policy: lib/revalidate.ts.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Auxion — Brands. Systems. Growth.",
  description:
    "One connected loop — Brand, Build, Automate, Grow — for small businesses that want to look established and run like it.",
};

/** The disciplines in loop order, which is also their chapter order. */
const LOOP_ORDER: readonly Discipline[] = ["Brand", "Build", "Automate", "Grow"];

/**
 * Homepage.
 *
 * THE STRUCTURE. A cinematic single-column descent on the identity's black
 * ground: a full-viewport opening stage, an honest ledger, the capability
 * ticker, the loop told as four numbered chapters, the platform, proof, what
 * clients said, and a closing stage. The <RibbonRail> draws the logo's own
 * folded strap down the left gutter as you scroll, so the page's through-line
 * IS the mark.
 *
 * THE INTEGRITY RULES ARE UNCHANGED, and they are what shapes the content:
 * every piece of proof still comes through the reputation repository, which
 * publish-gates it, and each block degrades to an honest empty state rather
 * than inventing proof. The opening ledger counts only things that are real —
 * the four disciplines, the modules actually in the catalog, and reviews only
 * once some are published. It replaces a strip of INVENTED client names
 * (PLACEHOLDER_TRUST_BAR), which was the one piece of fabricated social proof
 * on the page; nothing about the new brand made that safe to keep, and a
 * landing page whose first claim is a lie is a worse landing page.
 */
export default async function HomePage() {
  const reputation = await getReputationRepository();
  const catalog = getCatalogRepository();

  const [featured, testimonials, aggregate, modules] = await Promise.all([
    reputation.listFeaturedProjects(1),
    reputation.listHomeTestimonials(3),
    reputation.getAggregateRating(),
    catalog.listModules(),
  ]);

  const marquee = featured[0] ?? null;

  // Counts every module the discipline's detail page lists, INCLUDING `upgrade`
  // variants — they are real à-la-carte offerings and appear in no plan, so they
  // cannot skew a plan roll-up. Excluding them here made this card disagree with
  // the page it links to.
  const moduleCountFor = (discipline: Discipline) =>
    modules.filter((m) => m.stage === discipline).length;

  const slugFor = (discipline: Discipline) =>
    Object.entries(DISCIPLINE_SLUGS).find(([, d]) => d === discipline)?.[0] ?? "";

  /** The four chapters, composed server-side so the story and the catalog agree. */
  const chapters = LOOP_ORDER.map((discipline, i) => {
    const count = moduleCountFor(discipline);
    return {
      discipline,
      n: String(i + 1).padStart(2, "0"),
      outcome: PLACEHOLDER_DISCIPLINE_COPY[discipline]?.outcome ?? "",
      blurb: PLACEHOLDER_DISCIPLINE_COPY[discipline]?.blurb ?? "",
      href: `/services/${slugFor(discipline)}`,
      meta: `${count} ${count === 1 ? "module" : "modules"}`,
    };
  });

  return (
    <>
      <RibbonRail />

      {/* ---- Opening stage ---- */}
      <Section rhythm="hero" tone="dark" className={styles.stage}>
        <div className={styles.stageWash} aria-hidden="true" />
        <Container width="wide">
          <HeroSequence className={styles.open}>
            <div data-hero="eyebrow">
              <Eyebrow>Brand · Build · Automate · Grow</Eyebrow>
            </div>

            {/* Each line gets its own mask so they rise in sequence, the way a
                title card resolves — one <h1> for the document outline. */}
            <h1 className={styles.openTitle}>
              <span className={styles.lineMask}>
                <span className={styles.line} data-hero="title">
                  Four disciplines.
                </span>
              </span>
              <span className={styles.lineMask}>
                <span className={`${styles.line} ${styles.lineMetal}`} data-hero="title">
                  One loop.
                </span>
              </span>
            </h1>

            <p className={styles.openSub} data-hero="sub">
              Most agencies hand you a logo, a site, or a campaign — then leave the gaps to you.
              Auxion connects all four so your brand, website, operations and marketing compound
              instead of competing.
            </p>

            <div className={styles.openActions} data-hero="actions">
              <Button variant="primary" size="lg" asChild>
                <Link href="/assessment">Start the Health Assessment</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/contact">Book a Strategy Call</Link>
              </Button>
            </div>

            <p className={styles.openNote} data-hero="note">
              Free assessment · No card required · Takes about 5 minutes
            </p>
          </HeroSequence>
        </Container>
      </Section>

      {/* ---- Ledger: only things that are true ---- */}
      <div className={styles.ledger}>
        <Container width="wide">
          <Reveal className={styles.ledgerRow} as="dl">
            <div className={styles.ledgerItem}>
              <dt className={styles.ledgerLabel}>Disciplines</dt>
              <dd className={styles.ledgerValue}>{LOOP_ORDER.length}</dd>
            </div>
            <div className={styles.ledgerItem}>
              <dt className={styles.ledgerLabel}>Modules in the catalog</dt>
              <dd className={styles.ledgerValue}>{modules.length}</dd>
            </div>
            {/* Ratings appear only once reviews are published — never a zero, and
                never a placeholder figure standing in for one. */}
            {aggregate.count > 0 ? (
              <>
                <div className={styles.ledgerItem}>
                  <dt className={styles.ledgerLabel}>Verified reviews</dt>
                  <dd className={styles.ledgerValue}>{aggregate.count}</dd>
                </div>
                <div className={styles.ledgerItem}>
                  <dt className={styles.ledgerLabel}>Average rating</dt>
                  <dd className={styles.ledgerValue}>{aggregate.overall.toFixed(1)}</dd>
                </div>
              </>
            ) : null}
          </Reveal>
        </Container>
      </div>

      {/* ---- Capability ticker ---- */}
      <Marquee items={CAPABILITY_MARQUEE} label="What Auxion does" />

      {/* ---- The loop, as four chapters ---- */}
      <Section className={styles.chapters}>
        <Container width="wide">
          <Reveal className={styles.chaptersHead}>
            <Eyebrow>The framework</Eyebrow>
            <h2 className={styles.sectionTitle}>
              Everything a small business needs, in the right order
            </h2>
            <p className={styles.lede}>
              Each discipline stands alone. Together they form the loop — brand earns the click,
              build converts it, automation catches it, and growth compounds it.
            </p>
          </Reveal>

          <ol className={styles.chapterList}>
            {chapters.map((c) => (
              // One Reveal per chapter, so each arrives on its own scroll rather
              // than the whole list animating off a single trigger.
              <Reveal as="li" className={styles.chapter} key={c.discipline}>
                <Link href={c.href} className={styles.chapterLink}>
                  <span className={styles.chapterN} aria-hidden="true">
                    {c.n}
                  </span>
                  <span className={styles.chapterBody}>
                    <span className={styles.chapterName}>{c.discipline}</span>
                    <span className={styles.chapterOutcome}>{c.outcome}</span>
                    <span className={styles.chapterBlurb}>{c.blurb}</span>
                  </span>
                  <span className={styles.chapterMeta}>{c.meta}</span>
                </Link>
              </Reveal>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ---- How the loop runs (scroll story) ---- */}
      <TransformationJourney />

      {/* ---- The platform, showcased as a product ---- */}
      <PlatformShowcase />

      {/* ---- Proof: featured case study ---- */}
      <Section inset>
        <Container width="wide">
          <Reveal className={styles.head}>
            <Eyebrow>Proof</Eyebrow>
            <h2 className={styles.sectionTitle}>The loop, applied</h2>
          </Reveal>

          <Reveal stagger={false}>
            {marquee ? (
              <CaseStudyCard
                name={marquee.name}
                summary={marquee.summary}
                industry={marquee.industry}
                services={marquee.services}
                href={`/portfolio/${marquee.slug}`}
                // PROJECT FACTS ONLY — never a business result. Result metrics stay
                // undisclosed unless the client has approved them.
                facts={[
                  { label: "Timeline", value: marquee.timeline },
                  { label: "Deliverables", value: String(marquee.deliverablesCount) },
                  { label: "Platform", value: marquee.platform },
                  { label: "Status", value: marquee.projectStatus },
                ]}
              />
            ) : (
              <Alert tone="neutral" title="No published case studies yet">
                Work appears here once a project is published in the Reputation CMS. Nothing is
                shown until it is real and client-approved.
              </Alert>
            )}
          </Reveal>
        </Container>
      </Section>

      {/* ---- Testimonials ---- */}
      <Section>
        <Container width="wide">
          <Reveal className={`${styles.head} ${styles.headCentered}`}>
            <Eyebrow>What clients say</Eyebrow>
            <h2 className={styles.sectionTitle}>Rated by the businesses we build for</h2>
            {aggregate.count > 0 ? (
              <div className={styles.ratingRow}>
                <Stars value={aggregate.overall} showValue />
                <span>
                  based on <CountUp to={aggregate.count} /> verified{" "}
                  {aggregate.count === 1 ? "review" : "reviews"}
                </span>
              </div>
            ) : null}
          </Reveal>

          {testimonials.length > 0 ? (
            <Reveal className={styles.testimonialGrid}>
              {testimonials.map((t) => (
                <Testimonial
                  key={t.id}
                  quote={t.quote}
                  author={t.author}
                  role={t.role}
                  company={t.company}
                  overall={t.overall}
                  projectHref={t.projectSlug ? `/portfolio/${t.projectSlug}` : undefined}
                />
              ))}
            </Reveal>
          ) : (
            <Alert tone="neutral" title="No published reviews yet">
              Reviews appear here once they are real, attributed and approved for publication.
            </Alert>
          )}
        </Container>
      </Section>

      {/* ---- Closing stage: where the ribbon finishes ---- */}
      <Section rhythm="hero" tone="dark" className={styles.close}>
        <div className={styles.stageWash} aria-hidden="true" />
        <Container width="wide">
          <Reveal className={styles.closeInner}>
            <Eyebrow>Start here</Eyebrow>
            <h2 className={styles.closeTitle}>
              Find out where your business{" "}
              <span className={styles.lineMetal}>actually stands</span>
            </h2>
            <p className={styles.closeBody}>
              Answer five questions and get a Business Health Score across Brand, Build, Automate
              and Grow — plus a recommended path built from your answers, not a template.
            </p>
            <div className={styles.openActions}>
              <Button variant="primary" size="lg" asChild>
                <Link href="/assessment">Start the Health Assessment</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/packages">See packages</Link>
              </Button>
            </div>
            <p className={styles.openNote}>Free · No card required · About 5 minutes</p>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
