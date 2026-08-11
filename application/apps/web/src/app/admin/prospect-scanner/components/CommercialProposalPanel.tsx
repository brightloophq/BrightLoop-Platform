import { Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import { commercialBadgeStatus, type CommercialProposalView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * §09 — the INTERNAL admin proposal surface.
 *
 * Reads the post-scan COMMERCIAL proposal draft (proposal_versions, any status) so
 * an admin sees a `needs_review` / `needs_pricing` draft — unlike the client-facing
 * approved-only proposal reader, which is intentionally gated and unchanged. It
 * renders derived STATUS only (never invented pricing): the generation axis (Draft
 * ready), the review axis (Review required), and the commercial axis (Pricing
 * required). Pricing is never fabricated — `needs_pricing` is the honest default.
 */
export function CommercialProposalPanel({ proposal }: { proposal: CommercialProposalView }) {
  if (!proposal.present) {
    return (
      <OperationalPanel tone="anchor">
        <SectionRule index="09" label="Proposal" meta="internal draft · commercial" />
        <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
          <Badge status="pending">Not drafted</Badge>
        </div>
        <p className={styles.stageReason}>The commercial proposal draft appears automatically once the post-scan workflow runs on a completed scan.</p>
      </OperationalPanel>
    );
  }

  const facts: { key: string; value: string }[] = [
    { key: "Status", value: proposal.generationLabel },
    { key: "Review", value: proposal.statusLabel },
    { key: "Commercial state", value: proposal.commercialStateLabel ?? "—" },
    { key: "Recommended work", value: `${proposal.workItemCount} item${proposal.workItemCount === 1 ? "" : "s"}` },
  ];

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="09" label="Proposal" meta="internal draft · commercial" />

      <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
        <Badge status={proposal.draftReady ? "active" : commercialBadgeStatus(proposal.status)}>{proposal.generationLabel}</Badge>
        <Badge status={commercialBadgeStatus(proposal.status)}>{proposal.statusLabel}</Badge>
        {proposal.needsPricing ? <Badge status="pending">Pricing required</Badge> : null}
      </div>

      <div className={styles.summaryGrid}>
        {facts.map((f) => (
          <div key={f.key} className={styles.summaryItem}>
            <span className={styles.summaryKey}>{f.key}</span>
            <span className={styles.summaryValue}>{f.value}</span>
          </div>
        ))}
        {proposal.summary ? (
          <div className={styles.summaryItem}>
            <span className={styles.summaryKey}>Executive summary</span>
            <span className={styles.summaryValue}>{proposal.summary}</span>
          </div>
        ) : null}
      </div>

      <div className={styles.railFoot}>
        <span>Draft assembled from verified intelligence · no invented pricing</span>
        <span>Approve in the Prospect package · nothing is sent</span>
      </div>
    </OperationalPanel>
  );
}
