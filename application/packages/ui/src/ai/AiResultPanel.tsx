import { canCopy, canRetry, formatConfidence, resultTone } from "./state";
import type { AiActionOutcome, AiExecutable } from "./types";
import styles from "./ai.module.css";

const TONE_VAR: Record<string, string> = {
  info: "var(--info)",
  caution: "var(--caution)",
  critical: "var(--critical)",
  positive: "var(--positive)",
};
/* The result kind, spelled out. It used to be a pictogram beside the title,
   which meant the kind was only legible to someone who had learnt the set;
   as a word it is legible and announced without an aria-label. */
const KIND_WORD: Record<string, string> = {
  summary: "Summary",
  explanation: "Explanation",
  risk: "Risk",
  recommendation: "Recommendation",
  comparison: "Comparison",
  forecast: "Forecast",
  "action-plan": "Action plan",
};

export interface AiResultPanelProps {
  readonly outcome: AiActionOutcome;
  readonly onRetry?: () => void;
  readonly onExecute?: (exec: AiExecutable) => void;
  readonly onCopy?: () => void;
  readonly copied?: boolean;
}

/**
 * AiResultPanel — the consistent result surface for every AI action (PX.1e):
 * summaries, explanations, risk, recommendations, comparisons, forecasts, action
 * plans. Renders the evidence/trust row (capability · generated-at · confidence ·
 * advisory-vs-executable), a clear Demo badge, copy/retry, and honest denied /
 * unavailable / error states. Token-only; `aria-live` so results are announced.
 */
export function AiResultPanel({ outcome, onRetry, onExecute, onCopy, copied }: AiResultPanelProps) {
  if (outcome.status === "denied") {
    return (
      <div className={styles.stateCard} role="status">
        <span className={styles.stateRule} aria-hidden="true" />
        <div className={styles.stateBody}>
          <div className={styles.stateTitle}>Not permitted</div>
          <div className={styles.stateText}>{outcome.message}</div>
        </div>
      </div>
    );
  }

  if (outcome.status === "unavailable") {
    return (
      <div className={styles.stateCard} role="status">
        <span className={styles.stateRule} aria-hidden="true" />
        <div className={styles.stateBody}>
          <div className={styles.stateTitle}>AI assistance isn’t available here yet</div>
          <div className={styles.stateText}>{outcome.reason}</div>
          {outcome.futurePhase ? (
            <span className={styles.futureTag}>Future phase</span>
          ) : (
            onRetry && (
              <div className={styles.foot}>
                <button type="button" className={styles.footBtn} onClick={onRetry}>Retry</button>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  if (outcome.status === "error") {
    return (
      <div className={styles.stateCard} role="alert">
        <span className={styles.stateRule} aria-hidden="true" />
        <div className={styles.stateBody}>
          <div className={styles.stateTitle}>Something went wrong</div>
          <div className={styles.stateText}>{outcome.message}</div>
          {onRetry && (
            <div className={styles.foot}>
              <button type="button" className={styles.footBtn} onClick={onRetry}>Retry</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const r = outcome.result;
  const accent = TONE_VAR[resultTone(r.kind)]!;
  const conf = formatConfidence(r.confidence);

  return (
    <div className={styles.panel} role="region" aria-live="polite" style={{ ["--panel-accent" as string]: accent }}>
      <div className={styles.head}>
        <span className={styles.kind}>{KIND_WORD[r.kind] ?? "Result"}</span>
        <h4 className={styles.title}>{r.title}</h4>
        <span className={styles.badges}>
          {r.demo && <span className={styles.demoBadge}>Demo</span>}
          <span className={styles.advisoryBadge}>{r.advisory ? "Advisory" : "Proposal"}</span>
        </span>
      </div>

      <p className={styles.body}>{r.body}</p>

      <div className={styles.meta}>
        {r.capability && <span className={styles.metaItem}>Capability: {r.capability}</span>}
        {conf && <span className={styles.metaItem}>Confidence: {conf}</span>}
        <span className={styles.metaItem}>Generated {new Date(r.generatedAt).toLocaleString()}</span>
      </div>

      {r.evidence.length > 0 && (
        <div className={styles.evidence}>
          <div className={styles.evidenceLabel}>Evidence</div>
          <ul className={styles.evidenceList}>
            {r.evidence.map((e) => (
              <li key={e.label} className={styles.evidenceItem}>
                <span className={styles.evidenceMark} aria-hidden="true" />
                {e.href ? <a className={styles.evidenceLink} href={e.href}>{e.label}</a> : <span>{e.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.foot}>
        {canCopy(outcome) && onCopy && (
          <button type="button" className={styles.footBtn} onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {canRetry(outcome) && onRetry && (
          <button type="button" className={styles.footBtn} onClick={onRetry}>Retry</button>
        )}
        {r.executable && onExecute && (
          <button type="button" className={`${styles.footBtn} ${styles.executeBtn}`} onClick={() => onExecute(r.executable!)}>
            {r.executable.label}
            {r.executable.requiresApproval ? " (needs approval)" : ""}
          </button>
        )}
      </div>
    </div>
  );
}
