import Link from "next/link";
import type { Metadata } from "next";
import { DISCIPLINES } from "@brightloop/schema";
import { PLACEHOLDER_DISCIPLINE_COPY } from "@brightloop/data";
import { Button, CTASection, Container, Eyebrow, Section } from "@brightloop/ui";
import home from "../home.module.css";
import styles from "./about.module.css";

/**
 * About — the page a prospect looks for before they contact anyone.
 *
 * Written from what the site ALREADY claims: the four disciplines and their
 * outcomes come from the same catalog copy the Services pages render, so this
 * page cannot drift from them or assert something the rest of the site does
 * not. There are no invented numbers here — no team size, no years in
 * business, no client count — because none of those are recorded anywhere and
 * an About page is exactly where a made-up figure would be believed.
 */

export const metadata: Metadata = {
  title: "About",
  description:
    "Auxion builds the brand, site, automation and measurement a small business needs as one system rather than four disconnected projects.",
};

export default function AboutPage() {
  return (
    <>
      <Section rhythm="hero">
        <Container width="prose">
          <Eyebrow>About</Eyebrow>
          <h1 className={home.title}>One system, not four projects</h1>
          <p className={home.lede}>
            Most small businesses end up with a logo from one place, a website from another,
            a CRM nobody finished setting up, and no way to tell which of them is working.
            Auxion builds those as one loop, so each part feeds the next.
          </p>
        </Container>
      </Section>

      <Section inset>
        <Container width="prose">
          <h2 className={home.sectionTitle}>The four disciplines</h2>
          <p className={styles.body}>
            Every engagement is assembled from the same four. A business can start anywhere in
            the loop — most start where it hurts most — and the rest connects to it later.
          </p>

          <ol className={styles.disciplines}>
            {DISCIPLINES.map((discipline, i) => {
              const copy = PLACEHOLDER_DISCIPLINE_COPY[discipline];
              return (
                <li key={discipline} className={styles.discipline}>
                  <span className={styles.disciplineN}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.disciplineBody}>
                    <Link href={`/services/${discipline.toLowerCase()}`} className={styles.disciplineName}>
                      {discipline}
                    </Link>
                    <span className={styles.disciplineOutcome}>{copy?.outcome}</span>
                    <span className={styles.disciplineBlurb}>{copy?.blurb}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Container>
      </Section>

      <Section>
        <Container width="prose">
          <h2 className={home.sectionTitle}>How we work</h2>
          <div className={styles.principles}>
            <div className={styles.principle}>
              <h3 className={styles.principleTitle}>Diagnose before quoting</h3>
              <p className={styles.body}>
                Work starts with a scan of what exists now — the site, the funnel, the follow-up —
                so the scope answers something observed rather than something assumed.
              </p>
            </div>
            <div className={styles.principle}>
              <h3 className={styles.principleTitle}>Nothing shipped is a placeholder</h3>
              <p className={styles.body}>
                Where a number, a case study or a review has not been verified, this site says so
                rather than filling the gap. That rule applies to our own pages first.
              </p>
            </div>
            <div className={styles.principle}>
              <h3 className={styles.principleTitle}>You own what we build</h3>
              <p className={styles.body}>
                Accounts, domains, data and source stay in your name. An engagement that ends
                leaves a working system behind, not a dependency.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <CTASection
        eyebrow="Start here"
        title="Tell us what you're trying to fix"
        body="No pitch deck, no discovery gauntlet. Describe the problem and we'll tell you whether we're the right people for it."
        actions={
          <>
            <Button variant="primary" size="lg" asChild>
              <Link href="/contact">Request a consultation</Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/portfolio">See the work</Link>
            </Button>
          </>
        }
      />
    </>
  );
}
