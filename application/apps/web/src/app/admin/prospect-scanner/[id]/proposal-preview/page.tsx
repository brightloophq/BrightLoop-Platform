import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizationError, assertCapability } from "@brightloop/domain";
import { isApplicationError } from "@brightloop/application";
import { Alert, Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import { requireSurface } from "@/lib/auth";
import { loadProposalPreview } from "@/lib/scanner-data";
import type { ProposalPreviewView } from "@/lib/prospect-scanner";
import styles from "../../scanner.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposal preview · Auxion" };
const SCANNER_CAP = "transformation.scan.write";

/**
 * §Preview — the INTERNAL, read-only, client-FACING proposal preview.
 *
 * Deterministic composition of the persisted commercial proposal + admin pricing +
 * prospect identity. No AI, no new facts, no invented numbers. This is a PREVIEW an
 * admin inspects before approving — it neither sends nor publishes anything.
 */
export default async function ProposalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSurface("admin");
  try {
    assertCapability(actor, SCANNER_CAP);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return (
        <div className={styles.page}>
          <OperationalPanel>
            <Alert tone="danger" title="Not authorized">You don’t have access to this proposal.</Alert>
          </OperationalPanel>
        </div>
      );
    }
    throw error;
  }

  const { id } = await params;
  let data: Awaited<ReturnType<typeof loadProposalPreview>>;
  try {
    data = await loadProposalPreview(id);
  } catch (error) {
    if (isApplicationError(error) && error.status === 404) notFound();
    throw error;
  }
  if (data === null) notFound();

  return (
    <div className={styles.page}>
      <div className={styles.canvas}>
        <div className={styles.previewBack}>
          <Link href={`/admin/prospect-scanner/${data.runId}`} className={styles.previewLink}>← Back to the workspace</Link>
        </div>
        <ProposalPreview preview={data.preview} />
      </div>
    </div>
  );
}

function ProposalPreview({ preview }: { preview: ProposalPreviewView }) {
  if (!preview.present) {
    return (
      <OperationalPanel>
        <SectionRule index="—" label="Proposal preview" meta="client-facing" />
        <Alert tone="info" title="No draft to preview yet">A proposal draft appears once the post-scan commercial workflow runs on a completed scan.</Alert>
      </OperationalPanel>
    );
  }

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="—" label="Proposal preview" meta="client-facing · deterministic" />

      <header className={styles.previewHead}>
        <h1 className={styles.previewTitle}>Proposal for {preview.prospectName}</h1>
        {preview.website ? <span className={styles.stageReason}>{preview.website}</span> : null}
        {!preview.pricingComplete ? (
          <div style={{ marginTop: "var(--space-2)" }}>
            <Badge status="pending">Draft · pricing required</Badge>
          </div>
        ) : null}
      </header>

      {preview.executiveSummary ? (
        <section className={styles.previewSection}>
          <h2 className={styles.previewH2}>Executive summary</h2>
          <p className={styles.previewBody}>{preview.executiveSummary}</p>
        </section>
      ) : null}

      {preview.observedSituation ? (
        <section className={styles.previewSection}>
          <h2 className={styles.previewH2}>Your current situation</h2>
          <p className={styles.previewBody}>{preview.observedSituation}</p>
        </section>
      ) : null}

      {preview.opportunities.length > 0 ? (
        <section className={styles.previewSection}>
          <h2 className={styles.previewH2}>Key opportunities</h2>
          <ul className={styles.previewList}>
            {preview.opportunities.map((o, i) => (
              <li key={i}><strong>{o.title}.</strong> {o.detail}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.previewSection}>
        <h2 className={styles.previewH2}>Recommended work</h2>
        <div className={styles.previewScope}>
          {preview.work.map((w, i) => (
            <div key={i} className={styles.previewWorkRow}>
              <div>
                <span className={styles.summaryValue}>{w.title}{w.optional ? " (optional)" : ""}</span>
                {w.reason ? <span className={styles.stageReason}>{w.reason}</span> : null}
              </div>
              <span className={styles.previewPrice}>{w.priceLabel ?? "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.previewSection}>
        <h2 className={styles.previewH2}>Investment</h2>
        <div className={styles.pricingSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryKey}>One-time total</span>
            <span className={styles.summaryValue}>{preview.oneTimeLabel ?? "—"}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryKey}>Monthly</span>
            <span className={styles.summaryValue}>{preview.monthlyLabel ?? "—"}</span>
          </div>
          {preview.currency ? (
            <div className={styles.summaryItem}>
              <span className={styles.summaryKey}>Currency</span>
              <span className={styles.summaryValue}>{preview.currency}</span>
            </div>
          ) : null}
          {preview.validUntil ? (
            <div className={styles.summaryItem}>
              <span className={styles.summaryKey}>Valid until</span>
              <span className={styles.summaryValue}>{preview.validUntil}</span>
            </div>
          ) : null}
        </div>
        {preview.commercialNotes ? <p className={styles.previewBody} style={{ marginTop: "var(--space-3)" }}>{preview.commercialNotes}</p> : null}
      </section>

      {preview.nextStep ? (
        <section className={styles.previewSection}>
          <h2 className={styles.previewH2}>Next step</h2>
          <p className={styles.previewBody}>{preview.nextStep}</p>
        </section>
      ) : null}

      <div className={styles.railFoot}>
        <span>Composed from verified intelligence + admin pricing · nothing invented</span>
        <span>Preview only · not sent to the prospect</span>
      </div>
    </OperationalPanel>
  );
}
