import { Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import { commercialBadgeStatus, type CompetitorIntelligenceView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * Competitor Intelligence status surface (Phase C · Sprint C8 + post-scan commercial).
 *
 * Read-only. Exposes the coherent commercial status (Not run / Running / Ready /
 * Insufficient evidence / Review required / Failed), confidence and evidence count.
 * Competitors are discovered ONLY from the prospect's own site references + admin
 * input, gated by identity validation — never searched, scraped, or inferred.
 */
export function CompetitorIntelligencePanel({ competitor }: { competitor: CompetitorIntelligenceView }) {
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
        <Badge status={commercialBadgeStatus(competitor.status)}>{competitor.statusLabel}</Badge>
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
        <span>From the prospect&apos;s own references + admin input · identity-gated</span>
        <span>No search · no scraping · no inferred competitors</span>
      </div>
    </OperationalPanel>
  );
}
