import { Alert, Badge, MetricCard } from "@brightloop/ui";
import { formatDuration, type ExecutionView } from "@/lib/prospect-scanner";
import styles from "../scanner.module.css";

const TITLE: Record<string, string> = {
  completed: "Stage completed",
  advanced: "Stage completed — next stage queued",
  blocked: "Stage blocked",
  provider_disabled: "Reasoning is disabled",
  no_job_available: "Nothing to run",
  retried: "Stage failed — rescheduled",
  failed: "Stage failed",
  cancelled: "Run cancelled",
  deadline_exceeded: "Deadline exceeded",
  budget_exhausted: "Budget exhausted",
};

const NEXT_ACTION: Record<string, string> = {
  completed: "The pipeline reached its final stage for this run.",
  advanced: "Execute the next stage when you're ready.",
  blocked: "Resolve the blocking reason, then execute again. No attempt was consumed.",
  provider_disabled: "Enable the provider switches on the server to run a reasoning turn.",
  no_job_available: "No eligible job is queued for this tenant right now.",
  retried: "The runtime rescheduled the stage. Execute again to retry it.",
  failed: "Review the failure code, then retry the scan if it is eligible.",
  cancelled: "This run was cancelled; start a new scan to continue.",
  deadline_exceeded: "The run passed its deadline. Start a new scan.",
  budget_exhausted: "The reasoning budget is spent for this run.",
};

/**
 * The safe result of ONE controlled turn.
 *
 * Every field comes from the allowlisted `ExecutionView`: outcome, timings,
 * token counts, validation status and ids. The raw provider response, the
 * prompt, hidden reasoning, keys and provider headers are structurally absent —
 * they are never returned by the driver and never picked here.
 */
export function ExecutionResult({ execution }: { execution: ExecutionView }) {
  return (
    <div>
      <Alert tone={execution.tone === "success" ? "success" : execution.tone === "danger" ? "danger" : execution.tone === "warning" ? "warning" : "neutral"} title={TITLE[execution.outcome] ?? "Turn complete"}>
        {NEXT_ACTION[execution.outcome] ?? "The turn finished."}
      </Alert>

      <div className={styles.badgeRow} style={{ marginTop: "var(--space-3)" }}>
        <Badge status={execution.tone === "success" ? "active" : execution.tone === "danger" ? "failed" : "pending"}>{execution.outcome}</Badge>
        <span className={styles.mono}>{execution.stageLabel}</span>
        {execution.providerId ? <span className={styles.mono}>{execution.providerId}</span> : null}
        {execution.modelId ? <span className={styles.mono}>{execution.modelId}</span> : null}
        {execution.validationStatus ? <span className={styles.mono}>validation · {execution.validationStatus}</span> : null}
        {execution.retryDisposition ? <span className={styles.mono}>retry · {execution.retryDisposition}</span> : null}
      </div>

      <div className={styles.execGrid}>
        <MetricCard label="Turn duration" value={formatDuration(execution.durationMs)} icon="clock" />
        <MetricCard label="Provider latency" value={execution.latencyMs === null ? null : formatDuration(execution.latencyMs)} icon="activity" emptyLabel="n/a" />
        <MetricCard
          label="Input tokens"
          value={execution.inputTokens}
          icon="layers"
          emptyLabel="n/a"
          caption={execution.usageEstimated === null ? undefined : execution.usageEstimated ? "estimated" : "actual"}
        />
        <MetricCard label="Output tokens" value={execution.outputTokens} icon="layers" emptyLabel="n/a" />
        <MetricCard label="Artifacts" value={execution.artifactIds.length} icon="check-circle" />
        <MetricCard label="Downstream job" value={execution.downstreamJobId === null ? null : "queued"} icon="activity" emptyLabel="none" />
      </div>

      {execution.blockedReason ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="warning" title="Blocked reason">
            {execution.blockedReason}
          </Alert>
        </div>
      ) : null}
      {execution.failureCode ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="danger" title="Failure code">
            {execution.failureCode}
          </Alert>
        </div>
      ) : null}
      {execution.warnings.length > 0 ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="neutral" title="Warnings">
            <ul className={styles.gapList}>
              {execution.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
