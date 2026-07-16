import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Alert, Container, Eyebrow, Section } from "@brightloop/ui";
import home from "../../home.module.css";
import styles from "../legal.module.css";

/**
 * Legal pages — Privacy, Terms, Cookies (handoff §05).
 *
 * ██ DELIBERATELY EMPTY ██
 * Handoff §13: "Privacy Policy, Terms of Service, Cookie Policy — placeholder;
 * must be provided by legal counsel." Open decision 15 asks who supplies the
 * copy and by when.
 *
 * These are SHELLS: correct routes, prose container, structure and last-updated
 * slot, with an explicit notice that no policy is in force. Writing plausible
 * legal text would be fabricating a binding document — the one kind of
 * placeholder that could actually harm the business and its customers. So the
 * page states the absence instead of filling it.
 */

const DOCUMENTS = {
  privacy: {
    title: "Privacy Policy",
    eyebrow: "Legal",
    intro:
      "How BrightLoop collects, uses, stores and shares personal information, and the rights you have over it.",
    sections: [
      "Who we are and how to contact us",
      "What information we collect",
      "How we use your information",
      "Legal bases for processing",
      "Sharing with third parties and sub-processors",
      "International transfers and data residency",
      "How long we keep information",
      "Your rights (access, correction, deletion, portability)",
      "How to make a complaint",
    ],
  },
  terms: {
    title: "Terms of Service",
    eyebrow: "Legal",
    intro: "The terms that govern your use of the BrightLoop website, platform and services.",
    sections: [
      "Acceptance of these terms",
      "Accounts, eligibility and your responsibilities",
      "Services, scope and deliverables",
      "Fees, estimates, invoicing and payment terms",
      "Intellectual property and licensing",
      "Confidentiality",
      "Warranties and disclaimers",
      "Limitation of liability",
      "Termination and suspension",
      "Governing law and dispute resolution",
    ],
  },
  cookies: {
    title: "Cookie Policy",
    eyebrow: "Legal",
    intro: "What cookies and similar technologies we use, why, and how to control them.",
    sections: [
      "What cookies are",
      "Strictly necessary cookies",
      "Analytics cookies and your consent",
      "Marketing cookies and your consent",
      "Third-party cookies",
      "Managing your preferences",
      "How consent is recorded",
    ],
  },
} as const;

type DocumentSlug = keyof typeof DOCUMENTS;

interface PageProps {
  params: Promise<{ document: string }>;
}

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((document) => ({ document }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { document } = await params;
  const doc = DOCUMENTS[document as DocumentSlug];
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.intro,
    // Never let an unwritten policy be indexed as if it were in force.
    robots: { index: false, follow: false },
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { document } = await params;
  const doc = DOCUMENTS[document as DocumentSlug];
  if (!doc) notFound();

  return (
    <Section rhythm="hero">
      <Container width="prose">
        <Eyebrow>{doc.eyebrow}</Eyebrow>
        <h1 className={home.title}>{doc.title}</h1>
        <p className={home.lede}>{doc.intro}</p>

        <div className={styles.notice}>
          <Alert tone="warning" title="This policy has not been issued yet">
            No {doc.title.toLowerCase()} is currently in force. This page is a structural placeholder
            awaiting copy from legal counsel — it is not a policy, creates no obligations, and grants
            no rights. It is excluded from search indexing until real content is supplied.
          </Alert>
        </div>

        <p className={styles.lastUpdated}>
          <strong>Last updated:</strong> not yet issued
        </p>

        <h2 className={styles.outlineTitle}>Intended contents</h2>
        <p className={styles.outlineIntro}>
          The sections below are the expected structure of this document, listed so the shape can be
          reviewed before the copy is written. Each is currently empty.
        </p>

        <ol className={styles.outline}>
          {doc.sections.map((section) => (
            <li key={section} className={styles.outlineItem}>
              <span className={styles.sectionName}>{section}</span>
              <span className={styles.sectionState}>Awaiting copy</span>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
