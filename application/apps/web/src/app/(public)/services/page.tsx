import Link from "next/link";
import type { Metadata } from "next";
import { DISCIPLINE_SLUGS, type Discipline } from "@brightloop/schema";
import { PLACEHOLDER_DISCIPLINE_COPY } from "@brightloop/data";
import { Button, CTASection, Container, Eyebrow, Section, ServiceCard } from "@brightloop/ui";
import { getCatalogRepository } from "@/lib/repositories";
import styles from "../home.module.css";
import page from "./services.module.css";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Brand, Build, Automate, Grow — the four disciplines of the Auxion loop, and the modules inside each.",
  alternates: { canonical: "/services" },
};

/**
 * Services overview (handoff §05).
 *
 * The four discipline cards are derived from the schema vocabulary; module
 * counts come from the catalog repository. Nothing about the catalog is
 * hardcoded here.
 *
 * The page was four cards and a call to action — a visitor could read the whole
 * of it and still not know how an engagement starts, what it produces, or what
 * they end up owning. Those three answers are the page's real job, so they are
 * stated here rather than left to the conversation.
 */
export default async function ServicesPage() {
  const catalog = getCatalogRepository();
  const modules = await catalog.listModules();

  // Must match what /services/[discipline] lists — including `upgrade` variants.
  // See the note on the homepage: they appear in no plan, so counting them here
  // cannot affect plan estimates.
  const countFor = (discipline: Discipline) =>
    modules.filter((m) => m.stage === discipline).length;

  return (
    <>
      <Section rhythm="hero">
        <Container width="wide">
          <div className={styles.head}>
            <Eyebrow>Services</Eyebrow>
            <h1 className={styles.title}>Four disciplines that build on each other</h1>
            <p className={styles.lede}>
              Start anywhere. Most businesses start where the loop is weakest — the assessment tells
              you where that is.
            </p>
          </div>

          <h2 className="sr-only">The four disciplines</h2>
          <div className={styles.serviceGrid}>
            {Object.entries(DISCIPLINE_SLUGS).map(([slug, discipline]) => {
              const copy = PLACEHOLDER_DISCIPLINE_COPY[discipline];
              const count = countFor(discipline);
              return (
                <ServiceCard
                  key={slug}
                  name={discipline}
                  outcome={copy?.outcome ?? ""}
                  blurb={copy?.blurb ?? ""}
                  href={`/services/${slug}`}
                  meta={`${count} ${count === 1 ? "module" : "modules"}`}
                />
              );
            })}
          </div>
        </Container>
      </Section>

      <Section inset>
        <Container width="prose">
          <h2 className={styles.sectionTitle}>How an engagement works</h2>
          <p className={page.body}>
            The same four steps whichever discipline you start in. Nothing is scoped before the
            first one is done.
          </p>

          <ol className={page.steps}>
            <li className={page.step}>
              <span className={page.stepN}>01</span>
              <span className={page.stepBody}>
                <span className={page.stepName}>Diagnose</span>
                <span className={page.stepText}>
                  We scan what exists now — the site, the paths through it, the ways someone can
                  actually reach you, and what is measurable from the outside. Each finding carries
                  the evidence behind it, and anything the scan cannot see is reported as
                  unmeasured rather than guessed at.
                </span>
              </span>
            </li>
            <li className={page.step}>
              <span className={page.stepN}>02</span>
              <span className={page.stepBody}>
                <span className={page.stepName}>Scope</span>
                <span className={page.stepText}>
                  The findings become a proposal: which modules, in what order, and what each one
                  is meant to change. You see the reasoning, not just the total. Work you do not
                  need is the cheapest thing to remove at this stage.
                </span>
              </span>
            </li>
            <li className={page.step}>
              <span className={page.stepN}>03</span>
              <span className={page.stepBody}>
                <span className={page.stepName}>Build</span>
                <span className={page.stepText}>
                  Delivery runs module by module against the agreed scope. Each one is built to
                  connect to the rest of the loop rather than to stand alone, because the seams
                  between brand, site, follow-up and measurement are where most value leaks.
                </span>
              </span>
            </li>
            <li className={page.step}>
              <span className={page.stepN}>04</span>
              <span className={page.stepBody}>
                <span className={page.stepName}>Measure</span>
                <span className={page.stepText}>
                  The same scan runs again against the same categories, so the difference is a
                  measurement rather than an impression. That result is what decides the next piece
                  of work — including when the answer is that no further work is needed yet.
                </span>
              </span>
            </li>
          </ol>

          <h2 className={styles.sectionTitle}>What you own at the end</h2>
          <p className={page.body}>
            Accounts, domains, data and source stay in your name throughout. Brand files are handed
            over in their editable originals, not as flattened exports. An engagement that ends
            leaves a working system behind rather than a dependency — you should be able to take
            what we built to someone else, and the fact that you could is the point.
          </p>
          <p className={page.body}>
            We publish no rate card, because the honest price depends on what the diagnosis finds.
            What we can say before it is what a package includes and how it is assembled, which is
            what the <Link href="/packages">packages page</Link> sets out.
          </p>
        </Container>
      </Section>

      <Section rhythm="tight">
        <Container width="wide">
          <CTASection
            eyebrow="Not sure where to start?"
            title="Let the assessment decide"
            body="Five questions, scored across the loop. You get a Business Health Score and a recommended path built from your answers."
            actions={
              <>
                <Button variant="primary" size="lg" asChild>
                  <Link href="/assessment">Run the Business Diagnostic</Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/configurator">Build your own package</Link>
                </Button>
              </>
            }
          />
        </Container>
      </Section>
    </>
  );
}
