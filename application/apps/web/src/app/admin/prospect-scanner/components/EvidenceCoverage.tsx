import { Alert, Badge, EmptyWorkspace, MetricCard, OperationalPanel, OperationalTable, SectionRule, type OperationalColumn } from "@brightloop/ui";
import type { EvidenceItemView, EvidenceView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

export interface EvidenceCoverageProps {
  evidence: EvidenceView;
}

/**
 * Evidence coverage and its explicit gaps. A page that failed stays
 * `unavailable` — the surface never upgrades a missing source into an inferred
 * one, and never shows hidden reasoning.
 */
export function EvidenceCoverage({ evidence }: EvidenceCoverageProps) {
  if (!evidence.present) {
    return (
      <OperationalPanel>
        <SectionRule index="06" label="Evidence" meta="not normalized" />
        <EmptyWorkspace
          icon="layers"
          title="No evidence yet"
          body="Run the evidence normalization stage after discovery. Evidence is derived only from pages that were actually fetched."
        />
      </OperationalPanel>
    );
  }

  const columns: OperationalColumn<EvidenceItemView>[] = [
    { key: "source", header: "Source", label: "Source", render: (i) => <span className={styles.mono}>{i.source}</span> },
    { key: "url", header: "Origin", label: "Origin", render: (i) => <span className={styles.mono}>{i.url}</span> },
    { key: "kind", header: "Type", label: "Type", hideOnMobile: true, render: (i) => <span className={styles.mono}>{i.kind}</span> },
    {
      key: "state",
      header: "State",
      label: "State",
      render: (i) => <Badge status={i.state === "observed" ? "active" : "pending"}>{i.state}</Badge>,
    },
    { key: "freshness", header: "Freshness", label: "Freshness", hideOnMobile: true, render: (i) => <span className={styles.mono}>{i.freshness ?? "unknown"}</span> },
    { key: "checksum", header: "Checksum", label: "Checksum", hideOnMobile: true, render: (i) => <span className={styles.mono}>{i.checksum ?? "—"}</span> },
    { key: "reason", header: "Note", label: "Note", hideOnMobile: true, render: (i) => <span className={styles.mono}>{i.reason ?? "—"}</span> },
  ];

  return (
    <OperationalPanel>
      <SectionRule index="06" label="Evidence" meta={`${evidence.observed} observed of ${evidence.total}`} />

      <div className={styles.metrics}>
        <MetricCard label="Evidence items" value={evidence.total} icon="layers" />
        <MetricCard label="Observed" value={evidence.observed} icon="check-circle" emphasis="hero" />
        <MetricCard label="Unavailable" value={evidence.unavailable} icon="x" />
        <MetricCard label="Conflicts" value={evidence.conflicts} icon="bell" />
      </div>

      <div className={styles.switches} style={{ marginTop: "var(--space-4)" }}>
        {evidence.coveredSources.map((s) => (
          <span key={s} className={[styles.switch, styles.switchOn].join(" ")}>
            <span className={styles.switchDot} aria-hidden="true" />
            {s}
          </span>
        ))}
        {evidence.missingSources.map((s) => (
          <span key={s} className={styles.switch}>
            <span className={styles.switchDot} aria-hidden="true" />
            {s} · missing
          </span>
        ))}
      </div>

      {evidence.limitations.length > 0 ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Alert tone="neutral" title="Limitations">
            <ul className={styles.gapList}>
              {evidence.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <div style={{ marginTop: "var(--space-4)" }}>
        <OperationalTable
          caption="Evidence items with source, state, freshness and provenance checksum."
          columns={columns}
          rows={evidence.items}
          rowKey={(i) => i.targetId}
        />
      </div>
    </OperationalPanel>
  );
}
