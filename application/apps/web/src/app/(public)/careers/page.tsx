import Link from "next/link";
import type { Metadata } from "next";
import { Alert, Button, Container, Eyebrow, Section } from "@brightloop/ui";
import { CONTACT_EMAIL } from "@/lib/site";
import home from "../home.module.css";
import styles from "./careers.module.css";

/**
 * Careers — honest about there being no openings.
 *
 * A careers page with invented roles is worse than no careers page: it wastes
 * the time of everyone who applies. This states the real position and gives a
 * route in anyway, which is what a small team actually wants — the next hire
 * usually arrives through an introduction rather than a job board.
 *
 * The route exists because `/careers` is a path people and crawlers try, and a
 * 404 reads as a site that is half-built rather than a team that is not hiring.
 */


export const metadata: Metadata = {
  title: "Careers",
  description: "Auxion is not hiring right now. How to reach us anyway.",
  alternates: { canonical: "/careers" },
};

export default function CareersPage() {
  return (
    <Section rhythm="hero">
      <Container width="prose">
        <Eyebrow>Careers</Eyebrow>
        <h1 className={home.title}>No open roles right now</h1>
        <p className={home.lede}>
          We are a small team and we are not recruiting at the moment. When that changes, the
          openings will be listed on this page.
        </p>

        <div className={styles.notice}>
          <Alert tone="neutral" title="We would still rather hear from you than not">
            If you build brand, web, automation or growth work and you think there is a fit, send
            your work to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We read everything
            and reply as soon as we can — but we will not pretend a role exists when it does not.
          </Alert>
        </div>

        <h2 className={home.sectionTitle}>Working with us another way</h2>
        <p className={styles.body}>
          Much of what we deliver is built alongside independent specialists on a per-engagement
          basis. If you contract, say so — that is the conversation we are more often able to have.
        </p>

        <div className={styles.actions}>
          <Button variant="secondary" size="md" asChild>
            <Link href="/contact">Get in touch</Link>
          </Button>
          <Button variant="ghost" size="md" asChild>
            <Link href="/about">What we do</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}
