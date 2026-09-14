import Link from "next/link";
import type { Metadata } from "next";
import { Container, Eyebrow, Section } from "@brightloop/ui";
import home from "../home.module.css";
import styles from "./resources.module.css";

/**
 * Resources — a hub over things that already exist, not a container for things
 * that do not.
 *
 * The obvious way to fill this route is a library of guides and downloads. We
 * have none, and stubbing empty ones would add exactly the "thin content base"
 * a scan of this site already flags. So every entry here points at a page that
 * is genuinely built and genuinely useful, and the page is honest that written
 * guides are not among them yet.
 */

export const metadata: Metadata = {
  title: "Resources",
  description: "The tools, work and reference material Auxion publishes for small businesses.",
};

const RESOURCES = [
  {
    href: "/start",
    name: "Free business scan",
    body: "Answer a short set of questions and get a read on where your brand, site, follow-up and measurement actually stand.",
  },
  {
    href: "/services",
    name: "The four disciplines",
    body: "What Brand, Build, Automate and Grow each cover, what they cost to run, and which one to start with.",
  },
  {
    href: "/packages",
    name: "Packages and scope",
    body: "The three standard engagements, what is included in each, and how to assemble your own instead.",
  },
  {
    href: "/portfolio",
    name: "Client work",
    body: "Case studies with the facts of each engagement — timeline, deliverables, platform — and results only where the client approved them.",
  },
  {
    href: "/testimonials",
    name: "Client reviews",
    body: "Ratings and reviews from the businesses we have built for, attributed and published with permission.",
  },
] as const;

export default function ResourcesPage() {
  return (
    <Section rhythm="hero">
      <Container width="wide">
        <Eyebrow>Resources</Eyebrow>
        <h1 className={home.title}>Where to start</h1>
        <p className={home.lede}>
          Everything below is live and free to use. We do not publish gated guides or lead-magnet
          downloads — when we have something worth writing down, it will appear here.
        </p>

        <ul className={styles.grid}>
          {RESOURCES.map((resource) => (
            <li key={resource.href} className={styles.card}>
              <Link href={resource.href} className={styles.cardLink}>
                <span className={styles.cardName}>{resource.name}</span>
                <span className={styles.cardBody}>{resource.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
