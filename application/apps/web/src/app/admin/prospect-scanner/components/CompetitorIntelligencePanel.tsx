import { Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { CompetitorIntelligenceView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * Competitor Intelligence status surface (Phase C · Sprint C8).
 *
 * Read-only. Exposes exactly the deterministic snapshot's status, confidence and
 * evidence count — no redesign, no generated prose. When no competitor evidence
 * exists the panel states so explicitly; the runtime never fails on absence.
 */
export function CompetitorIntelligencePanel({ competitor }: { competitor: CompetitorIntelligenceView }) {
  const badgeStatus = competitor.status === "available" ? "active" : competitor.status === "review_required" ? "pending" : "idle";
  const facts: { key: string; value: string }[] = [
    { key: "Status", value: competitor.statusLabel },
    { key: "Competitors", value: String(competitor.competitorCount) },
    { key: "Evidence count", value: String(competitor.evidenceCount) },
    { key: "Confidence", value: competitor.confidence === null ? "Not evidenced yet" : `${competitor.confidence}${competitor.confidenceBand ? ` (${competitor.confidenceBand.replace("_", " ")})` : ""}` },
  ];

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="11" label="Competitor intelligence" meta="deterministic · evidence-only" />

      <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
        <Badge status={badgeStatus}>{competitor.statusLabel}</Badge>
        {competitor.reviewRequired ? <Badge status="pending">Review required</Badge> : null}
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
          <span className={styles.summaryValue}>{competitor.summary || "Not produced yet."}</span>
        </div>
      </div>

      <div className={styles.railFoot}>
        <span>Analyzes only verified competitor evidence</span>
        <span>No search · no scraping · no inferred competitors</span>
      </div>
    </OperationalPanel>
  );
}
