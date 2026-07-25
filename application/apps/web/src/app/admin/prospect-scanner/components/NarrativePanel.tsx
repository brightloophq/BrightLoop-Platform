import { Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { NarrativeView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * Narrative status surface (Phase C · Sprint C10).
 *
 * Read-only. The narrative is the deterministic PRESENTATION layer over the
 * structured findings — no generated prose here, only its status, confidence and
 * review flag. When intelligence is insufficient the panel states so explicitly.
 */
export function NarrativePanel({ narrative }: { narrative: NarrativeView }) {
  const badgeStatus = narrative.status === "available" ? "active" : narrative.status === "review_required" ? "pending" : "idle";
  const facts: { key: string; value: string }[] = [
    { key: "Status", value: narrative.statusLabel },
    { key: "Sections", value: String(narrative.sectionCount) },
    { key: "Confidence", value: narrative.confidence === null ? "Not evidenced yet" : `${narrative.confidence}${narrative.confidenceBand ? ` (${narrative.confidenceBand.replace("_", " ")})` : ""}` },
  ];

  return (
    <OperationalPanel tone="anchor">
      <SectionRule index="13" label="Narrative" meta="deterministic presentation · evidence-traced" />

      <div className={styles.badgeRow} style={{ marginBottom: "var(--space-3)" }}>
        <Badge status={badgeStatus}>{narrative.statusLabel}</Badge>
        {narrative.reviewRequired ? <Badge status="pending">Review required</Badge> : null}
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
          <span className={styles.summaryValue}>{narrative.summary || "Not produced yet."}</span>
        </div>
      </div>

      <div className={styles.railFoot}>
        <span>Presentation of structured findings only</span>
        <span>No creative writing · no AI text · every sentence traces to evidence</span>
      </div>
    </OperationalPanel>
  );
}
