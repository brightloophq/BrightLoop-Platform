import Link from "next/link";
import { Button, Container, Eyebrow, Section } from "@brightloop/ui";

/**
 * Global 404.
 *
 * Several routes in the primary navigation (/portfolio, /testimonials, and the
 * assessment → configurator funnel) are approved IA that later sprints deliver.
 * Until then they land here. The nav deliberately reflects the approved
 * information architecture rather than being trimmed and re-expanded each sprint
 * — but this page says plainly that the section isn't built yet rather than
 * implying the visitor did something wrong.
 */
export default function NotFound() {
  return (
    <Section rhythm="hero">
      <Container width="sm" style={{ textAlign: "center" }}>
        <Eyebrow>404</Eyebrow>
        <h1 style={{ fontSize: "var(--fs-h2)", marginBottom: "var(--space-4)" }}>
          This page isn&apos;t here yet
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            lineHeight: "var(--lh-body)",
            marginBottom: "var(--space-6)",
          }}
        >
          Either the address is wrong, or this is part of the site still under construction — the
          portfolio, testimonials and assessment funnel are being built now.
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Button variant="primary" size="md" asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button variant="secondary" size="md" asChild>
            <Link href="/services">Browse services</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}
