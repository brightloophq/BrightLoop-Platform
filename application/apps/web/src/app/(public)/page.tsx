import Link from "next/link";
import type { Metadata } from "next";
import { DISCIPLINE_SLUGS, type Discipline } from "@brightloop/schema";
import { PLACEHOLDER_DISCIPLINE_COPY, PLACEHOLDER_TRUST_BAR } from "@brightloop/data";
import {
  Alert,
  Button,
  CTASection,
  CaseStudyCard,
  Container,
  Eyebrow,
  Icon,
  Section,
  ServiceCard,
  Stars,
  Testimonial,
} from "@brightloop/ui";
import { getCatalogRepository, getReputationRepository } from "@/lib/repositories";
import styles from "./home.module.css";

/**
 * ISR, 5 min — the featured case study comes from the CMS and must appear
 * without a deploy. Literal, not imported: Next requires segment config to be
 * statically analysable. Policy: lib/revalidate.ts.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "BrightLoop — Brands. Systems. Growth.",
  description:
    "One connected loop — Brand, Build, Automate, Grow — for small businesses that want to look established and run like it.",
};

const LOOP_NODES: { discipline: Discipline; icon: string; position: string }[] = [
  { discipline: "Brand", icon: "pen-tool", position: "nodeTop" },
  { discipline: "Build", icon: "layout-grid", position: "nodeRight" },
  { discipline: "Automate", icon: "workflow", position: "nodeBottom" },
  { discipline: "Grow", icon: "trending-up", position: "nodeLeft" },
];

/**
 * Homepage (handoff §05).
 *
 * All proof is pulled through the reputation repository, which publish-gates it.
 * The featured case study and testimonials are whatever is published — if
 * nothing is, the page degrades to an honest empty state rather than inventing
 * proof (handoff §15: "falls back gracefully if none published").
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

  return (
    <>
      {/* ---- Hero ---- */}
      <Section rhythm="hero" className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <Container width="wide" className={styles.heroGrid}>
          <div>
            <Eyebrow>Brand · Build · Automate · Grow</Eyebrow>
            <h1 className={styles.heroTitle}>
              Four disciplines. <span className={styles.heroAccent}>One loop.</span>
            </h1>
            <p className={styles.heroSub}>
              Most agencies hand you a logo, a site, or a campaign — then leave the gaps to you.
              BrightLoop connects all four so your brand, website, operations and marketing compound
              instead of competing.
            </p>
            <div className={styles.heroActions}>
              <Button variant="primary" size="lg" asChild>
                <Link href="/assessment">Start the Health Assessment</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/contact">Book a Strategy Call</Link>
              </Button>
            </div>
            <p className={styles.heroNote}>
              Free assessment · No card required · Takes about 5 minutes
            </p>
          </div>

          {/* The loop visual — the four disciplines as one cycle. */}
          <div className={styles.loop} aria-hidden="true">
            <div className={styles.loopRing} />
            {LOOP_NODES.map((node) => (
              <div
                key={node.discipline}
                className={`${styles.loopNode} ${styles[node.position]}`}
              >
                <Icon name={node.icon} size={18} className={styles.loopNodeIcon} />
                <span className={styles.loopNodeLabel}>{node.discipline}</span>
              </div>
            ))}
            <div className={styles.loopCore}>
              Bright
              <br />
              Loop
            </div>
          </div>
        </Container>
      </Section>

      {/* ---- Trust bar (PLACEHOLDER company names — open decision 14) ---- */}
      <div className={styles.trust}>
        <Container width="wide" className={styles.trustInner}>
          <span className={styles.trustLabel}>Sample client names</span>
          {PLACEHOLDER_TRUST_BAR.map((name) => (
            <span key={name} className={styles.trustLogo}>
              {name}
            </span>
          ))}
        </Container>
      </div>

      {/* ---- The four disciplines ---- */}
      <Section>
        <Container width="wide">
          <div className={styles.head}>
            <Eyebrow>The framework</Eyebrow>
            <h2 className={styles.title}>Everything a small business needs, in the right order</h2>
            <p className={styles.lede}>
              Each discipline stands alone. Together they form the loop — brand earns the click,
              build converts it, automation catches it, and growth compounds it.
            </p>
          </div>

          <div className={styles.serviceGrid}>
            {Object.entries(DISCIPLINE_SLUGS).map(([slug, discipline]) => {
              const copy = PLACEHOLDER_DISCIPLINE_COPY[discipline];
              const count = moduleCountFor(discipline);
              return (
                <ServiceCard
                  key={slug}
                  name={discipline}
                  outcome={copy?.outcome ?? ""}
                  blurb={copy?.blurb ?? ""}
                  icon={copy?.icon ?? "sparkles"}
                  href={`/services/${slug}`}
                  meta={`${count} ${count === 1 ? "module" : "modules"}`}
                />
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ---- Proof: featured case study ---- */}
      <Section inset>
        <Container width="wide">
          <div className={styles.head}>
            <Eyebrow>Proof</Eyebrow>
            <h2 className={styles.title}>The loop, applied</h2>
          </div>

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
              Work appears here once a project is published in the Reputation CMS. Nothing is shown
              until it is real and client-approved.
            </Alert>
          )}
        </Container>
      </Section>

      {/* ---- Testimonials ---- */}
      <Section>
        <Container width="wide">
          <div className={`${styles.head} ${styles.headCentered}`}>
            <Eyebrow>What clients say</Eyebrow>
            <h2 className={styles.title}>Rated by the businesses we build for</h2>
            {aggregate.count > 0 ? (
              <div className={styles.ratingRow}>
                <Stars value={aggregate.overall} showValue />
                <span>
                  based on {aggregate.count} verified{" "}
                  {aggregate.count === 1 ? "review" : "reviews"}
                </span>
              </div>
            ) : null}
          </div>

          {testimonials.length > 0 ? (
            <div className={styles.testimonialGrid}>
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
            </div>
          ) : (
            <Alert tone="neutral" title="No published reviews yet">
              Reviews appear here once they are real, attributed and approved for publication.
            </Alert>
          )}
        </Container>
      </Section>

      {/* ---- Closing CTA ---- */}
      <Section rhythm="tight">
        <Container width="wide">
          <CTASection
            eyebrow="Start here"
            title="Find out where your business actually stands"
            body="Answer five questions and get a Business Health Score across Brand, Build, Automate and Grow — plus a recommended path built from your answers, not a template."
            actions={
              <>
                <Button variant="primary" size="lg" asChild>
                  <Link href="/assessment">Start the Health Assessment</Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/packages">See packages</Link>
                </Button>
              </>
            }
            note="Free · No card required · About 5 minutes"
          />
        </Container>
      </Section>
    </>
  );
}
