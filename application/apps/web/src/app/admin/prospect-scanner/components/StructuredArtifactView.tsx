import { EmptyWorkspace, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { StructuredView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

export interface StructuredArtifactViewProps {
  view: StructuredView;
  index: string;
  label: string;
  emptyTitle: string;
  emptyBody: string;
  footNote: string;
}

/**
 * Renders an allowlisted, sectioned artifact (report or proposal) as bounded
 * plain-text lines. The envelope is never spread and never rendered as markup —
 * only sections named in the allowlist appear, so an unexpected key (or a
 * model-shaped blob) cannot reach the screen.
 */
export function StructuredArtifactView({ view, index, label, emptyTitle, emptyBody, footNote }: StructuredArtifactViewProps) {
  if (!view.present || view.sections.length === 0) {
    return (
      <OperationalPanel>
        <SectionRule index={index} label={label} meta="unavailable" />
        <EmptyWorkspace icon="file" title={emptyTitle} body={emptyBody} />
      </OperationalPanel>
    );
  }

  return (
    <OperationalPanel>
      <SectionRule index={index} label={label} meta={`v${view.version ?? 1} · ${view.status ?? "unknown"}`} />
      <div className={styles.sectionList}>
        {view.sections.map((section) => (
          <section key={section.key} className={styles.sectionBlock}>
            <h3 className={styles.sectionLabel}>{section.label}</h3>
            <ul className={styles.sectionLines}>
              {section.lines.map((line, i) => (
                <li key={`${section.key}-${i}`}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className={styles.railFoot}>
        <span>{footNote}</span>
        <span>{view.createdAt ? new Date(view.createdAt).toLocaleString() : ""}</span>
      </div>
    </OperationalPanel>
  );
}

/** §10 — the internal intelligence report review surface. */
export function InternalReportView({ view }: { view: StructuredView }) {
  return (
    <StructuredArtifactView
      view={view}
      index="08"
      label="Internal report"
      emptyTitle="No approved report yet"
      emptyBody="A report appears once the pipeline reaches report assembly and the artifact validates. Nothing is drafted before then."
      footNote="Internal review surface · structured artifact only"
    />
  );
}

/** §11 — the proposal review surface. No prices, no contract, no send action. */
export function ProposalReview({ view }: { view: StructuredView }) {
  return (
    <StructuredArtifactView
      view={view}
      index="09"
      label="Proposal"
      emptyTitle="No proposal yet"
      emptyBody="A proposal artifact appears once the pipeline produces one. Pricing, contracts and sending are out of scope for this sprint."
      footNote="Structure only · no pricing, contract, or send"
    />
  );
}
