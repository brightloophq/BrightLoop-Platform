import Link from "next/link";
import type { Metadata } from "next";
import { Alert, Container, Eyebrow, Section } from "@brightloop/ui";
import home from "../home.module.css";
import styles from "./legal.module.css";

/**
 * Legal index — the page `/legal` never had.
 *
 * `/legal/privacy`, `/legal/terms` and `/legal/cookies` have existed all along;
 * only the directory above them 404'd, so every footer or crawler that tried
 * the conventional `/legal` found nothing and concluded the site had no legal
 * section at all.
 *
 * It repeats the sibling pages' honesty rather than softening it: none of these
 * documents has been issued, and an index that listed them without saying so
 * would imply policies are in force when they are not. Excluded from indexing
 * for the same reason the documents themselves are.
 */

const DOCUMENTS = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    intro: "How Auxion collects, uses, stores and shares personal information, and your rights over it.",
  },
  {
    slug: "terms",
    title: "Terms of Service",
    intro: "The terms on which Auxion provides its services, and what each side is responsible for.",
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    intro: "What is stored in your browser, why, and how to refuse it.",
  },
] as const;

export const metadata: Metadata = {
  title: "Legal",
  description: "Auxion's privacy, terms and cookie documents.",
  alternates: { canonical: "/legal" },
  // Consistent with the documents themselves: nothing here is in force yet.
  robots: { index: false, follow: false },
};

export default function LegalIndexPage() {
  return (
    <Section rhythm="hero">
      <Container width="prose">
        <Eyebrow>Legal</Eyebrow>
        <h1 className={home.title}>Legal</h1>
        <p className={home.lede}>
          The documents governing how Auxion handles your information and provides its services.
        </p>

        <div className={styles.notice}>
          <Alert tone="warning" title="None of these documents has been issued yet">
            Each page below is a structural outline awaiting copy from legal counsel. They create no
            obligations and grant no rights. Writing plausible legal text would be fabricating a
            binding document, so the pages state the absence instead of filling it.
          </Alert>
        </div>

        <ol className={styles.outline}>
          {DOCUMENTS.map((doc) => (
            <li key={doc.slug} className={styles.outlineItem}>
              <span className={styles.sectionName}>
                <Link href={`/legal/${doc.slug}`}>{doc.title}</Link>
                <span className={styles.docIntro}>{doc.intro}</span>
              </span>
              <span className={styles.sectionState}>Awaiting copy</span>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
