import Link from "next/link";
import type { Metadata } from "next";
import { Button, CTASection, Card, Container, Eyebrow, Section, Tag } from "@brightloop/ui";
import { getCatalogRepository } from "@/lib/repositories";
import home from "../home.module.css";
import styles from "./packages.module.css";

export const metadata: Metadata = {
  title: "Packages",
  description:
    "Auxion packages — Starter, Growth and Enterprise. See the deliverables, outcomes, industries served and timelines for each. Pricing is prepared with a strategist.",
};

/**
 * Packages (handoff §05 / Sprint 5R spec §1).
 *
 * NO PRICING. Auxion does not publish a rate card. Each package shows what
 * you get (deliverables), what changes (outcomes), who it suits (industries) and
 * how long it takes (timeline). Tailored pricing is prepared by a strategist in
 * the discovery conversation after the assessment + configurator — never here.
 *
 * The card's action is a stretched link in the card HEAD, not a button in its
 * foot — see packages.module.css for why. All presentation lives in that module;
 * this file deliberately carries no inline `style` props.
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

          <h2 className="sr-only">The three packages</h2>
          <div className={styles.grid}>
            {resolved.map(({ plan, modules }) => {
              const featured = plan.tag === "Popular";
              // The Starter plan's tag is the word "Starter", which next to a
              // heading that already says Starter is just the label twice. Show
              // a tag only when it tells the reader something the name doesn't.
              const tag = plan.tag && plan.tag !== plan.name ? plan.tag : null;
              return (
                <Card
                  key={plan.id}
                  interactive
                  className={[styles.planCard, featured ? styles.planFeatured : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.planHead}>
                    <div className={styles.planTitleRow}>
                      <h3 className={styles.planName}>{plan.name}</h3>
                      {tag ? <Tag accent={featured}>{tag}</Tag> : null}
                    </div>

                    {plan.timelineWeeks ? (
                      <p className={styles.planMeta}>
                        Typically {plan.timelineWeeks[0]}–{plan.timelineWeeks[1]} weeks
                      </p>
                    ) : null}

                    <Link href={`/configurator?plan=${plan.id}`} className={styles.planAction}>
                      Configure {plan.name}
                      <span className={styles.planArrow} aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </div>

                  <p className={styles.planBlurb}>{plan.blurb}</p>

                  {plan.outcomes && plan.outcomes.length > 0 ? (
                    <div className={styles.planBlock}>
                      <span className={styles.planLabel}>Outcomes</span>
                      <ul className={styles.planList}>
                        {plan.outcomes.map((outcome) => (
                          <li key={outcome} className={styles.planListItem}>
                            {outcome}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className={styles.planBlock}>
                    <span className={styles.planLabel}>What&apos;s included</span>
                    <div className={styles.moduleTags}>
                      {modules.map((m) => (
                        <Tag key={m.module.id}>{m.module.name}</Tag>
                      ))}
                    </div>
                  </div>

                  {plan.industries && plan.industries.length > 0 ? (
                    <p className={styles.planFit}>Common fit: {plan.industries.join(" · ")}</p>
                  ) : null}
                </Card>
              );
            })}
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
                  <Link href="/contact">Request a Consultation</Link>
                </Button>
              </>
            }
          />
        </Container>
      </Section>
    </>
  );
}
