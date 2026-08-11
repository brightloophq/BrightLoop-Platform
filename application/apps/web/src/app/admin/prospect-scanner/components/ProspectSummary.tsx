import { Alert, Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { ProspectSummaryView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * The operator-only outreach preparation card (§12).
 *
 * Every value is DERIVED from a structured artifact — no sales copy is
 * generated, and an unevidenced field stays empty rather than being filled in.
 */
export function ProspectSummary({ summary }: { summary: ProspectSummaryView }) {
  const facts: { key: string; value: string | null }[] = [
    { key: "Prospect", value: summary.prospectName },
    { key: "Website", value: summary.website },
    { key: "Strongest observed issue", value: summary.strongestIssue },
    { key: "Strongest opportunity", value: summary.strongestOpportunity },
    { key: "Index summary", value: summary.indexSummary },
    { key: "Confidence", value: summary.confidence },
  ];

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="10" label="Prospect summary" meta="internal only" />

      <div className={styles.summaryGrid}>
        {facts.map((f) => (
          <div key={f.key} className={styles.summaryItem}>
            <span className={styles.summaryKey}>{f.key}</span>
            <span className={styles.summaryValue}>{f.value ?? "Not evidenced yet"}</span>
          </div>
        ))}

        <div className={styles.summaryItem}>
          <span className={styles.summaryKey}>Top recommendations</span>
          {summary.topRecommendations.length === 0 ? (
            <span className={styles.summaryValue}>None yet — reasoning has not produced candidates.</span>
          ) : (
            <ol className={styles.gapList}>
              {summary.topRecommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryKey}>Major evidence gaps</span>
          {summary.evidenceGaps.length === 0 ? (
            <span className={styles.summaryValue}>No gaps recorded.</span>
          ) : (
            <ul className={styles.gapList}>
              {summary.evidenceGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.badgeRow} style={{ marginTop: "var(--space-4)" }}>
        <Badge status={summary.reportReady ? "active" : "pending"}>Report {summary.reportReady ? "ready" : "pending"}</Badge>
        <Badge status="idle">Proposal · {summary.proposalStatusLabel}</Badge>
        <Badge status="idle">Package · {summary.packageStateLabel}</Badge>
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone="info" title="Suggested next human action">
          {summary.nextHumanAction}
        </Alert>
      </div>

      <div className={styles.railFoot}>
        <span>Derived from structured artifacts only</span>
        <span>No generated sales copy</span>
      </div>
    </OperationalPanel>
  );
}
