import type { Metadata } from "next";
import Link from "next/link";
import { canWriteSignals } from "@brightloop/domain";
import { Alert, EmptyWorkspace, OperationalPanel, SectionHeader } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { getSignalsRepository } from "@/lib/repositories";
import { SignalForm } from "../SignalForm";
import styles from "../signals.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New Signal · Auxion" };

export default async function NewSignalPage() {
  const actor = await requireSurface("admin");
  if (!canWriteSignals(actor)) {
    return (
      <div className={styles.page}>
        <div className={styles.canvas}>
          <OperationalPanel>
            <EmptyWorkspace
              title="You can't create signals"
              body="Your role has read-only access to the transformation command center."
              action={
                <Link href="/admin/signals" className={styles.backLink}>
 Back to signals
                </Link>
              }
            />
          </OperationalPanel>
        </div>
      </div>
    );
  }

  const repo = await getSignalsRepository();
  const orgs = await repo.listOrganizations();

  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <Link href="/admin/signals" className={styles.backLink}>
 Back to signals
        </Link>
        <SectionHeader
          as="h1"
          size="page"
          kicker="New signal"
          title="Create a signal"
          hint="Capture a detected change worth attention. It starts in the Detected state — validate or prioritize it from its detail page."
        />
        {orgs.length === 0 ? (
          <Alert tone="warning" title="No organizations yet">
            Create a client organization before capturing signals.
          </Alert>
        ) : (
          <SignalForm orgs={orgs} />
        )}
      </div>
    </div>
  );
}
