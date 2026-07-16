import type { Metadata } from "next";
import { PLACEHOLDER_ASSESSMENT, PLACEHOLDER_PLANS } from "@brightloop/data";
import { Container, Eyebrow, Section } from "@brightloop/ui";
import { funnelCatalog } from "../(funnel)/catalog-data";
import { StartForm } from "./StartForm";
import styles from "../(funnel)/funnel.module.css";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

/**
 * Prospect signup (approved Decision A). Turns funnel work into a member-stage
 * account + opens a discovery conversation. Catalog data is passed server-side
 * so the client form can recompute the final payload without bundling Supabase.
 */
export default function StartPage() {
  return (
    <Section rhythm="hero">
      <Container width="sm">
        <div className={styles.head}>
          <Eyebrow>Almost there</Eyebrow>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.lede}>
            We&apos;ll save your assessment and package, and connect you with a strategist to talk
            it through and build your real quote.
          </p>
        </div>

        <StartForm
          questions={[...PLACEHOLDER_ASSESSMENT]}
          modules={funnelCatalog().modules}
          plans={PLACEHOLDER_PLANS.map((p) => ({ id: p.id, modules: [...p.modules] }))}
        />
      </Container>
    </Section>
  );
}
