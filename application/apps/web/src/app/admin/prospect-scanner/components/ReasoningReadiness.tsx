import { Alert, Badge, OperationalPanel, SectionRule } from "@brightloop/ui";
import type { ReasoningReadinessView, RuntimeFlags } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

const TONE: Record<ReasoningReadinessView["state"], "success" | "warning" | "danger" | "info" | "neutral"> = {
  ready: "success",
  blocked_by_discovery: "warning",
  blocked_by_evidence: "warning",
  provider_disabled: "neutral",
  provider_unavailable: "warning",
  budget_exhausted: "danger",
  deadline_exceeded: "danger",
  already_complete: "info",
};

export interface ReasoningReadinessProps {
  readiness: ReasoningReadinessView;
  flags: RuntimeFlags;
}

/**
 * The gate in front of a PAID provider turn. Every factor is shown so the
 * operator can see exactly what is missing; a turn is only offered when the
 * overall state is `ready` (enforced in `ScanControls`, decided here).
 */
export function ReasoningReadiness({ readiness, flags }: ReasoningReadinessProps) {
  return (
    <OperationalPanel>
      <SectionRule index="05" label="Reasoning readiness" meta={readiness.state} />

      <div className={styles.badgeRow}>
        <Badge status={readiness.canExecute ? "active" : "pending"}>{readiness.label}</Badge>
        {flags.modelId ? <span className={styles.mono}>Model · {flags.modelId}</span> : null}
        {flags.maxOutputTokens !== null ? <span className={styles.mono}>Max output · {flags.maxOutputTokens.toLocaleString()} tokens</span> : null}
        {flags.estimatedMaxCostUsd !== null ? <span className={styles.mono}>Est. max ≈ ${flags.estimatedMaxCostUsd.toFixed(2)}</span> : null}
      </div>

      <div className={styles.factorGrid}>
        {readiness.factors.map((f) => (
          <div key={f.label} className={[styles.factor, f.ok ? styles.factorOk : styles.factorGap].join(" ")}>
            <span className={styles.factorLabel}>{f.label}</span>
            <span className={styles.factorValue}>{f.value}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Alert tone={TONE[readiness.state]} title={readiness.canExecute ? "A controlled turn may run" : "Reasoning is not available"}>
          {readiness.explanation}
        </Alert>
      </div>
    </OperationalPanel>
  );
}
