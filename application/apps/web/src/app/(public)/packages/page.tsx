import Link from "next/link";
import type { Metadata } from "next";
import { ESTIMATE_DISCLAIMER, ESTIMATE_LABEL, formatRange } from "@brightloop/domain";
import {
  Alert,
  Button,
  CTASection,
  Card,
  Container,
  Eyebrow,
  PricingCard,
  Section,
  Tag,
} from "@brightloop/ui";
import { getCatalogRepository } from "@/lib/repositories";
import home from "../home.module.css";
import styles from "./packages.module.css";

export const metadata: Metadata = {
  title: "Packages",
  description:
    "Productised BrightLoop packages — Foundation, Launch, Transform and Growth Partner — with estimated ranges and what each includes.",
};

/**
 * Packages & pricing (handoff §05).
 *
 * PRICING INTEGRITY — the approved answer to "how do estimates avoid being read
 * as guaranteed quotes?":
 *   * every figure is a low–high RANGE from the catalog, never a single number;
 *   * PricingCard requires the non-binding qualifier as a prop, so no card can
 *     render a price without it;
 *   * a prominent notice states plainly that the binding figure is the proposal.
 *
 * Real names/tiers/prices are open decisions 1 & 2. Replacing them is a data
 * change in the catalog — this page does not change.
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
              Each package bundles the modules that usually go together. The configurator removes
              anything you already have, so you only pay for what you actually need.
            </p>
          </div>

          {/* The estimate/quote distinction, stated once and prominently. */}
          <div className={styles.notice}>
            <Alert tone="info" title="These are estimates, not quotes" icon="lightbulb">
              Every figure below is an estimated range based on typical scope. Your binding price
              appears on your proposal after a strategy call. Nothing here is a final quotation, and
              nothing commits you to anything.
            </Alert>
          </div>

          <div className={styles.grid}>
            {resolved.map(({ plan, modules, range, weeksMax }) => (
              <PricingCard
                key={plan.id}
                name={plan.name}
                blurb={plan.blurb}
                range={formatRange(range)}
                estimateLabel={ESTIMATE_LABEL}
                estimateQualifier={ESTIMATE_DISCLAIMER}
                tag={plan.tag || undefined}
                recommended={plan.tag === "Popular"}
                weeks={`Typically ${Math.max(1, Math.round(weeksMax * 0.55))}–${weeksMax} weeks`}
                includes={modules.map((m) => m.module.name)}
                action={
                  <Button
                    variant={plan.tag === "Popular" ? "primary" : "secondary"}
                    size="md"
                    block
                    asChild
                  >
                    <Link href={`/configurator?plan=${plan.id}`}>Configure {plan.name}</Link>
                  </Button>
                }
              />
            ))}
          </div>
        </Container>
      </Section>

      {/* ---- What's in each package ---- */}
      <Section inset>
        <Container width="wide">
          <div className={home.head}>
            <Eyebrow>Compare</Eyebrow>
            <h2 className={home.title}>What each package includes</h2>
            <p className={home.lede}>
              Modules are grouped by discipline — Brand, Build, Automate, Grow.
            </p>
          </div>

          <div className={styles.compare}>
            {resolved.map(({ plan, modules }) => (
              <Card key={plan.id} className={styles.compareCard}>
                <h3 className={styles.compareName}>{plan.name}</h3>
                <div className={styles.moduleTags}>
                  {modules.map((m) => (
                    <Tag key={m.module.id}>{m.module.name}</Tag>
                  ))}
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
            body="Pick the modules you need, tell us what you already have, and see a live estimated range. Still not a quote — but a lot closer to your reality."
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
