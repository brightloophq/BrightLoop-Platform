import type { Metadata } from "next";
import { Alert, Card, Container, Eyebrow, Section } from "@brightloop/ui";
import { CONTACT_EMAIL } from "@/lib/site";
import { ContactForm } from "./ContactForm";
import home from "../home.module.css";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "Book a strategy call with Auxion, or send an enquiry.",
  alternates: { canonical: "/contact" },
};

/**
 * Contact & booking (handoff §05).
 *
 * The scheduler embed (Cal.com/Calendly) is a Sprint 8 integration — the
 * booking panel says so plainly rather than showing a dead widget.
 */

/**
 * REAL — confirmed by the product owner. This resolves the "support email"
 * line of the "Company facts" placeholder list in handoff §13.
 *
 * On the Auxion domain, not the old free-mail address: the address a prospect
 * sees is part of whether they believe the rest of the page, and this one is
 * the same brand as the site they are standing on.
 *
 * Still outstanding on that list: business address, phone, and the booking
 * calendar. Social links are published in the footer of every page.
 */

export default function ContactPage() {
  return (
    <Section rhythm="hero">
      <Container width="wide">
        <div className={home.head}>
          <Eyebrow>Contact</Eyebrow>
          <h1 className={home.title}>Tell us what you&apos;re trying to fix</h1>
          <p className={home.lede}>
            No pitch deck, no discovery gauntlet. Tell us where the business hurts and we&apos;ll
            tell you honestly whether we can help.
          </p>
        </div>

        <div className={styles.grid}>
          <ContactForm fallbackEmail={CONTACT_EMAIL} />

          <aside className={styles.aside}>
            <Card>
              <h2 className={styles.bookingTitle}>Book a strategy call</h2>
              <p className={styles.bookingBody}>
                A 30-minute call to walk your loop, name the weakest link, and tell you what it would
                take to fix it.
              </p>
              <Alert tone="neutral" title="Scheduler not connected yet">
                Calendar booking goes live with the scheduling integration in a later sprint. Until
                then, use the form or email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </Alert>
            </Card>

            <Card>
              <ul className={styles.detailList}>
                <li className={styles.detail}>
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </li>
                <li className={styles.detail}>
                  <span>We read every enquiry and reply as soon as we can.</span>
                </li>
                <li className={styles.detail}>
                  <span>
                    Jamaica — working with businesses across the Caribbean, US, UK and Canada.
                  </span>
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
