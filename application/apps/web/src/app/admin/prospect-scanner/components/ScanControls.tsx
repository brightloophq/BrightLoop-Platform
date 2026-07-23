"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, OperationalPanel, SectionRule } from "@brightloop/ui";
import { buildExecutionView, type ExecutionView, type NextStageView, type ReasoningReadinessView, type RuntimeFlags } from "@/lib/prospect-scanner";
import { ExecutionResult } from "./ExecutionResult";
import styles from "../scanner.module.css";

export interface ScanControlsProps {
  runId: string;
  clientId: string | null;
  next: NextStageView;
  readiness: ReasoningReadinessView;
  flags: RuntimeFlags;
  canCancel: boolean;
  canRetry: boolean;
  cancelAction: (formData: FormData) => void;
  retryAction: (formData: FormData) => void;
}

/**
 * Stage control (§4).
 *
 * ONE click executes AT MOST ONE stage through the C2.1 internal entry point
 * (`POST /api/internal/runtime/run-once`). There is no loop, no interval, no
 * polling and no auto-advance: the operator drives every turn. A paid reasoning
 * turn additionally requires an explicit confirmation AND `readiness.canExecute`.
 *
 * Duplicate submission is prevented twice over — an in-flight ref guard (which
 * survives fast double-clicks before React re-renders) and the disabled button.
 */
export function ScanControls({ runId, clientId, next, readiness, flags, canCancel, canRetry, cancelAction, retryAction }: ScanControlsProps) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [execution, setExecution] = useState<ExecutionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isReasoning = next.isReasoning;
  // A reasoning stage additionally needs full readiness — a paid call is never
  // offered when anything is missing.
  const executable = next.support === "supported" && (!isReasoning || readiness.canExecute);

  const execute = useCallback(async () => {
    if (inFlight.current || !executable) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setConfirming(false);

    try {
      const res = await fetch("/api/internal/runtime/run-once", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body && typeof (body as { error?: { message?: unknown } }).error?.message === "string"
            ? (body as { error: { message: string } }).error.message
            : `The turn could not run (${res.status}).`;
        setError(message);
        return;
      }

      const result = typeof body === "object" && body !== null ? (body as { result?: unknown }).result : null;
      setExecution(buildExecutionView(result ?? null));
      // Re-read server state ONCE after the turn. This is not polling.
      router.refresh();
    } catch {
      setError("The turn could not be sent. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [clientId, executable, router]);

  return (
    <OperationalPanel>
      <SectionRule index="01" label="Stage control" meta={pending ? "running…" : "idle"} />

      <div className={styles.controls}>
        <div className={[styles.stageCallout, executable ? null : styles.stageCalloutMuted].filter(Boolean).join(" ")}>
          <span className={styles.stageLabel}>Next · {next.label}</span>
          <span className={styles.stageReason}>
            {executable ? "One click executes exactly one stage." : next.reason ?? readiness.explanation}
          </span>
        </div>

        {isReasoning && confirming ? (
          <Button variant="primary" onClick={execute} disabled={pending} loading={pending}>
            Confirm &amp; run one paid turn
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={isReasoning ? () => setConfirming(true) : execute}
            disabled={!executable || pending}
            loading={pending && !isReasoning}
          >
            {pending ? "Executing…" : isReasoning ? "Run reasoning turn…" : "Execute next stage"}
          </Button>
        )}

        {confirming ? (
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
            Cancel
          </Button>
        ) : null}

        {canCancel ? (
          <form action={cancelAction} className={styles.controlForm}>
            <input type="hidden" name="runId" value={runId} />
            <Button type="submit" variant="secondary" disabled={pending}>
              Cancel scan
            </Button>
          </form>
        ) : null}

        {canRetry ? (
          <form action={retryAction} className={styles.controlForm}>
            <input type="hidden" name="runId" value={runId} />
            <Button type="submit" variant="secondary" disabled={pending}>
              Retry scan
            </Button>
          </form>
        ) : null}
      </div>

      {isReasoning && confirming ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Alert tone="warning" title="This turn calls the live provider and spends credit">
            Model <strong>{flags.modelId ?? "not configured"}</strong> · up to{" "}
            <strong>{flags.maxOutputTokens?.toLocaleString() ?? "—"}</strong> output tokens · estimated maximum{" "}
            <strong>{flags.estimatedMaxCostUsd === null ? "—" : `$${flags.estimatedMaxCostUsd.toFixed(2)}`}</strong> for this single turn. Exactly one
            turn will run.
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: "var(--space-4)" }} role="alert">
          <Alert tone="danger" title="The turn didn't run">
            {error}
          </Alert>
        </div>
      ) : null}

      {execution ? (
        <div style={{ marginTop: "var(--space-4)" }} aria-live="polite">
          <ExecutionResult execution={execution} />
        </div>
      ) : null}

      <div className={styles.railFoot}>
        <span>Manual execution · one stage per turn</span>
        <span>No worker, no scheduler, no auto-advance</span>
      </div>
    </OperationalPanel>
  );
}
