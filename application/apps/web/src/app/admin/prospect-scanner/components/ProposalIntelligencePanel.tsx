import { Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { ProposalIntelligenceView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * Proposal Intelligence status surface (Phase C · Sprint C9).
 *
 * Read-only. Exposes the deterministic proposal snapshot's status, proposal
 * count and confidence — no redesign, no generated prose. When evidence is
 * insufficient the panel states so explicitly; the runtime never fails on it.
 */
export function ProposalIntelligencePanel({ proposal }: { proposal: ProposalIntelligenceView }) {
  const badgeStatus = proposal.status === "available" ? "active" : proposal.status === "review_required" ? "pending" : "idle";
  const facts: { key: string; value: string }[] = [
    { key: "Status", value: proposal.statusLabel },
    { key: "Proposals", value: String(proposal.proposalCount) },
    { key: "Priority mix", value: `${proposal.critical} critical · ${proposal.high} high · ${proposal.medium} medium · ${proposal.low} low` },
    { key: "Confidence", value: proposal.confidence === null ? "Not evidenced yet" : `${proposal.confidence}${proposal.confidenceBand ? ` (${proposal.confidenceBand.replace("_", " ")})` : ""}` },
  ];

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="12" label="Proposal intelligence" meta="deterministic · evidence-only" />

      <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
        <Badge status={badgeStatus}>{proposal.statusLabel}</Badge>
        {proposal.reviewRequired ? <Badge status="pending">Review required</Badge> : null}
      </div>

      <div className={styles.summaryGrid}>
        {facts.map((f) => (
          <div key={f.key} className={styles.summaryItem}>
            <span className={styles.summaryKey}>{f.key}</span>
            <span className={styles.summaryValue}>{f.value}</span>
          </div>
        ))}
        <div className={styles.summaryItem}>
          <span className={styles.summaryKey}>Summary</span>
          <span className={styles.summaryValue}>{proposal.summary || "Not produced yet."}</span>
        </div>
      </div>

      <div className={styles.railFoot}>
        <span>Structured recommendations from evidence only</span>
        <span>No marketing copy · no narrative · no AI generation</span>
      </div>
    </OperationalPanel>
  );
}
