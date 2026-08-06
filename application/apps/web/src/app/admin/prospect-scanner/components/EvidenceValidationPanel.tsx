import { Alert, Badge, EmptyWorkspace, MetricCard, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { EvidenceConclusionView, EvidenceValidationView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

/**
 * One auditable conclusion, expandable to its evidence trail. Native
 * <details>/<summary> — no client JS, keyboard-operable, server-rendered. Each
 * evidence reference links to the original page and shows the extracted snippet,
 * so a reader can walk Conclusion → Evidence → Original webpage.
 */
function ConclusionCard({ c }: { c: EvidenceConclusionView }) {
  return (
    <details className={styles.evCard}>
      <summary className={styles.evSummary}>
        <span className={styles.evTitle}>{c.label}</span>
        <span className={styles.evChips}>
          {c.supportLabel ? (
            <Badge tone={c.tone}>{c.supportLabel}</Badge>
          ) : (
            <Badge tone={c.tone}>{c.findingKind === "weakness" ? "Weakness" : "Strength"}</Badge>
          )}
          <span className={styles.mono}>conf {c.confidence}</span>
          <span className={styles.mono}>
            {c.evidence.length} evidence{c.survives ? "" : " · dropped"}
          </span>
        </span>
      </summary>
      <div className={styles.evBody}>
        {c.reasonText ? <p className={styles.evReason}>{c.reasonText}</p> : null}
        {c.evidence.length === 0 ? (
          <p className={styles.evReason}>No evidence linked to this conclusion.</p>
        ) : (
          <ul className={styles.evList}>
            {c.evidence.map((e, i) => (
              <li key={`${e.id}-${i}`} className={styles.evItem}>
                <div className={styles.evItemHead}>
                  <Badge status={e.state === "observed" ? "active" : "pending"}>{e.state}</Badge>
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className={styles.evUrl}>
                      {e.title ?? e.url}
                    </a>
                  ) : (
                    <span className={styles.mono}>{e.id}</span>
                  )}
                </div>
                {e.snippet ? <p className={styles.evSnippet}>“{e.snippet}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/**
 * Evidence Validation (Sprint C-EV) — the traceability surface.
 *
 * Replaces the former "no runtime implementation yet" placeholder. Shows the
 * validation outcome (progress, evidence count, supported/rejected, average
 * confidence) and lets the operator expand any conclusion to the evidence and
 * the source pages behind it. Every value is DERIVED from validated artifacts;
 * nothing here is fabricated.
 */
export function EvidenceValidationPanel({ view }: { view: EvidenceValidationView }) {
  if (!view.present) {
    return (
      <OperationalPanel>
        <SectionRule index="07" label="Evidence validation" meta="not run" />
        <EmptyWorkspace
          icon="layers"
          title="Nothing validated yet"
          body="Run the pipeline through finding synthesis. Every conclusion is then traced back to the evidence collected from the website — no unsupported claims."
        />
      </OperationalPanel>
    );
  }

  return (
    <OperationalPanel>
      <SectionRule index="07" label="Evidence validation" meta={view.statusLabel} />
      <p className={styles.stageReason}>{view.summary}</p>

      <div className={styles.metrics}>
        <MetricCard label="Evidence items" value={view.evidenceCount} icon="layers" />
        <MetricCard label="Findings" value={view.findings.length} icon="check-circle" emphasis="hero" />
        {view.providerAttempted ? <MetricCard label="Claims validated" value={view.surviving} icon="check-circle" /> : null}
        {view.providerAttempted ? <MetricCard label="Rejected" value={view.unsupported + view.contradicted} icon="x" /> : null}
        {view.providerAttempted ? <MetricCard label="Avg confidence" value={view.averageConfidence} icon="bell" /> : null}
      </div>

      {view.contradicted > 0 ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Alert tone="danger" title="Contradicted claims present">
            {view.contradicted} claim(s) rest on evidence that could not be observed or that conflicts with the record. They do not carry forward.
          </Alert>
        </div>
      ) : null}

      {view.findings.length > 0 ? (
        <section className={styles.evSection}>
          <h3 className={styles.evHeading}>Findings · evidence-linked</h3>
          {view.findings.map((c) => (
            <ConclusionCard key={c.id} c={c} />
          ))}
        </section>
      ) : null}

      {view.claims.length > 0 ? (
        <section className={styles.evSection}>
          <h3 className={styles.evHeading}>Validated provider claims</h3>
          {view.claims.map((c) => (
            <ConclusionCard key={c.id} c={c} />
          ))}
        </section>
      ) : null}

      {view.rejectedClaims.length > 0 ? (
        <section className={styles.evSection}>
          <h3 className={styles.evHeading}>Rejected claims · did not survive validation</h3>
          {view.rejectedClaims.map((c) => (
            <ConclusionCard key={c.id} c={c} />
          ))}
        </section>
      ) : null}
    </OperationalPanel>
  );
}
