import Link from "next/link";
import type { Metadata } from "next";
import {
  Button,
  CTASection,
  Card,
  Container,
  Eyebrow,
  Icon,
  Section,
  Tag,
} from "@brightloop/ui";
import { getCatalogRepository } from "@/lib/repositories";
import home from "../home.module.css";
import styles from "./packages.module.css";

export const metadata: Metadata = {
  title: "Packages",
  description:
    "BrightLoop packages — Starter, Growth and Enterprise. See the deliverables, outcomes, industries served and timelines for each. Pricing is prepared with a strategist.",
};

/**
 * Packages (handoff §05 / Sprint 5R spec §1).
 *
 * NO PRICING. BrightLoop does not publish a rate card. Each package shows what
 * you get (deliverables), what changes (outcomes), who it suits (industries) and
 * how long it takes (timeline). Tailored pricing is prepared by a strategist in
 * the discovery conversation after the assessment + configurator — never here.
 */
export default async function PackagesPage() {
  const catalog = getCatalogRepository();
  const plans = await catalog.listPlans();
  const details = await Promise.all(plans.map((plan) => catalog.getPlanDetail(plan.id)));
  const resolved = details.filter((d): d is NonNullable<typeof d> => d !== null);

  return (
    <>
      <Section rhythm="hero">
        <Container width="wide">
          <div className={`${home.head} ${home.headCentered}`}>
            <Eyebrow>Packages</Eyebrow>
            <h1 className={home.title}>Start with a package, or build your own</h1>
            <p className={home.lede}>
              Each package bundles the work that usually goes together. The configurator removes
              anything you already have, so your plan reflects only what you actually need — and your
              strategist prepares tailored pricing with you. No public rate card, no obligation.
            </p>
          </div>

          <div className={styles.grid}>
            {resolved.map(({ plan, modules }) => (
              <Card key={plan.id} className={styles.compareCard}>
                <div className={styles.rowTop} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", justifyContent: "space-between" }}>
                  <h3 className={styles.compareName}>{plan.name}</h3>
                  {plan.tag ? <Tag accent={plan.tag === "Popular"}>{plan.tag}</Tag> : null}
                </div>
                <p className={home.lede} style={{ fontSize: "var(--fs-sm)", marginTop: "var(--space-2)" }}>{plan.blurb}</p>

                {plan.timelineWeeks ? (
                  <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>
                    <Icon name="clock" size={14} /> Typically {plan.timelineWeeks[0]}–{plan.timelineWeeks[1]} weeks
                  </p>
                ) : null}

                {plan.outcomes && plan.outcomes.length > 0 ? (
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <span className={styles.compareName} style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Outcomes</span>
                    <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-2) 0 0" }}>
                      {plan.outcomes.map((o) => (
                        <li key={o} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--fs-sm)", padding: "3px 0" }}>
                          <Icon name="check" size={15} /> <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div style={{ marginTop: "var(--space-3)" }}>
                  <span className={styles.compareName} style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>What&apos;s included</span>
                  <div className={styles.moduleTags} style={{ marginTop: "var(--space-2)" }}>
                    {modules.map((m) => (
                      <Tag key={m.module.id}>{m.module.name}</Tag>
                    ))}
                  </div>
                </div>

                {plan.industries && plan.industries.length > 0 ? (
                  <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: "var(--space-3)" }}>
                    Common fit: {plan.industries.join(" · ")}
                  </p>
                ) : null}

                <div style={{ marginTop: "var(--space-4)" }}>
                  <Button variant={plan.tag === "Popular" ? "primary" : "secondary"} size="md" block asChild>
                    <Link href={`/configurator?plan=${plan.id}`}>Configure {plan.name}</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section rhythm="tight">
        <Container width="wide">
          <CTASection
            eyebrow="Nothing quite right?"
            title="Build your own package"
            body="Pick the work you need, tell us what you already have, and take it into a conversation with a strategist who prepares your tailored pricing — no public rate card."
            actions={
              <>
                <Button variant="primary" size="lg" asChild>
                  <Link href="/configurator">Open the configurator</Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/contact">Book a Strategy Call</Link>
                </Button>
              </>
            }
          />
        </Container>
      </Section>
    </>
  );
}
