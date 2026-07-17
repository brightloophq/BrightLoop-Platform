import Link from "next/link";
import type { Metadata } from "next";
import { DISCIPLINE_SLUGS, type Discipline } from "@brightloop/schema";
import { PLACEHOLDER_DISCIPLINE_COPY } from "@brightloop/data";
import { Button, CTASection, Container, Eyebrow, Section, ServiceCard } from "@brightloop/ui";
import { getCatalogRepository } from "@/lib/repositories";
import styles from "../home.module.css";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Brand, Build, Automate, Grow — the four disciplines of the Auxion loop, and the modules inside each.",
};

/**
 * Services overview (handoff §05).
 *
 * The four discipline cards are derived from the schema vocabulary; module
 * counts come from the catalog repository. Nothing about the catalog is
 * hardcoded here.
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
                  icon={copy?.icon ?? "sparkles"}
                  href={`/services/${slug}`}
                  meta={`${count} ${count === 1 ? "module" : "modules"}`}
                />
              );
            })}
          </div>
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
                  <Link href="/assessment">Start the Health Assessment</Link>
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
