import { Icon } from "../components/Icon";
import { canCopy, canRetry, formatConfidence, resultTone } from "./state";
import type { AiActionOutcome, AiExecutable } from "./types";
import styles from "./ai.module.css";

const TONE_VAR: Record<string, string> = {
  info: "var(--info)",
  caution: "var(--caution)",
  critical: "var(--critical)",
  positive: "var(--positive)",
};
const KIND_ICON: Record<string, string> = {
  summary: "book-open",
  explanation: "lightbulb",
  risk: "bell",
  recommendation: "target",
  comparison: "git-branch",
  forecast: "trending-up",
  "action-plan": "route",
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
        <span className={styles.stateIcon}><Icon name="lock" size={16} /></span>
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
        <span className={styles.stateIcon}><Icon name="lightbulb" size={16} /></span>
        <div className={styles.stateBody}>
          <div className={styles.stateTitle}>AI assistance isn’t available here yet</div>
          <div className={styles.stateText}>{outcome.reason}</div>
          {outcome.futurePhase ? (
            <span className={styles.futureTag}>Future phase</span>
          ) : (
            onRetry && (
              <div className={styles.foot}>
                <button type="button" className={styles.footBtn} onClick={onRetry}><Icon name="activity" size={12} /> Retry</button>
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
        <span className={styles.stateIcon}><Icon name="bell" size={16} /></span>
        <div className={styles.stateBody}>
          <div className={styles.stateTitle}>Something went wrong</div>
          <div className={styles.stateText}>{outcome.message}</div>
          {onRetry && (
            <div className={styles.foot}>
              <button type="button" className={styles.footBtn} onClick={onRetry}><Icon name="activity" size={12} /> Retry</button>
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
        <span className={styles.icon}><Icon name={KIND_ICON[r.kind] ?? "sparkles"} size={16} /></span>
        <h4 className={styles.title}>{r.title}</h4>
        <span className={styles.badges}>
          {r.demo && <span className={styles.demoBadge}>Demo</span>}
          <span className={styles.advisoryBadge}>{r.advisory ? "Advisory" : "Proposal"}</span>
        </span>
      </div>

      <p className={styles.body}>{r.body}</p>

      <div className={styles.meta}>
        {r.capability && <span className={styles.metaItem}><Icon name="sparkles" size={11} /> {r.capability}</span>}
        {conf && <span className={styles.metaItem}><Icon name="gauge" size={11} /> {conf}</span>}
        <span className={styles.metaItem}><Icon name="clock" size={11} /> {new Date(r.generatedAt).toLocaleString()}</span>
      </div>

      {r.evidence.length > 0 && (
        <div className={styles.evidence}>
          <div className={styles.evidenceLabel}>Evidence</div>
          <ul className={styles.evidenceList}>
            {r.evidence.map((e) => (
              <li key={e.label} className={styles.evidenceItem}>
                <Icon name="check" size={12} />
                {e.href ? <a className={styles.evidenceLink} href={e.href}>{e.label}</a> : <span>{e.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.foot}>
        {canCopy(outcome) && onCopy && (
          <button type="button" className={styles.footBtn} onClick={onCopy}>
            <Icon name={copied ? "check" : "external-link"} size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        )}
        {canRetry(outcome) && onRetry && (
          <button type="button" className={styles.footBtn} onClick={onRetry}><Icon name="activity" size={12} /> Retry</button>
        )}
        {r.executable && onExecute && (
          <button type="button" className={`${styles.footBtn} ${styles.executeBtn}`} onClick={() => onExecute(r.executable!)}>
            <Icon name="arrow-up-right" size={12} /> {r.executable.label}
            {r.executable.requiresApproval ? " (needs approval)" : ""}
          </button>
        )}
      </div>
    </div>
  );
}
