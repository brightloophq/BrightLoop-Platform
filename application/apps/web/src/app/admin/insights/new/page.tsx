import type { Metadata } from "next";
import Link from "next/link";
import { canWriteInsights } from "@brightloop/domain";
import { Alert, EmptyWorkspace, Icon, OperationalPanel, SectionHeader } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { getInsightsRepository } from "@/lib/repositories";
import { InsightForm, type SignalOption } from "../InsightForm";
import styles from "../insights.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New Insight · Auxion" };

export default async function NewInsightPage() {
  const actor = await requireSurface("admin");
  if (!canWriteInsights(actor)) {
    return (
      <div className={styles.page}>
        <div className={styles.canvas}>
          <OperationalPanel>
            <EmptyWorkspace
              icon="lock"
              title="You can't create insights"
              body="Your role has read-only access to the transformation command center."
              action={
                <Link href="/admin/insights" className={styles.backLink}>
                  <Icon name="arrow-left" size={16} /> Back to insights
                </Link>
              }
            />
          </OperationalPanel>
        </div>
      </div>
    );
  }

  const repo = await getInsightsRepository();
  const signals = await repo.listLinkableSignals(null);
  const options: SignalOption[] = signals.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    orgName: s.orgName,
  }));

  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <Link href="/admin/insights" className={styles.backLink}>
          <Icon name="arrow-left" size={16} /> Back to insights
        </Link>
        <SectionHeader
          as="h1"
          size="page"
          kicker="New insight"
          title="Interpret a signal"
          hint="An Insight explains what a Signal means. It starts in the Generated state — endorse or dismiss it from its detail page."
        />
        {options.length === 0 ? (
          <Alert tone="warning" title="No signals to interpret yet">
            An insight interprets a signal, and there are no open signals.{" "}
            <Link href="/admin/signals/new">Create a signal</Link> first.
          </Alert>
        ) : (
          <InsightForm signals={options} />
        )}
      </div>
    </div>
  );
}
