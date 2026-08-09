"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, OperationalPanel, SectionRule } from "@brightloop/ui";
import { stageLabel } from "@/lib/prospect-scanner";
import type { AutoRunResponse } from "@/lib/auto-run";
import styles from "../scanner.module.css";

export interface FullScanRunnerProps {
  runId: string;
  clientId: string | null;
  /** Server-rendered lifecycle — drives resume-on-mount. */
  initialStatus: string;
  initialStage: string | null;
  initialProgress: number;
  totalStages: number;
  crawlerEnabled: boolean;
  providerEnabled: boolean;
  canCancel: boolean;
  /** The existing cancel server action (also stops the client loop). */
  cancelAction: (formData: FormData) => void | Promise<void>;
}

type Phase = "idle" | "running" | "waiting" | "done" | "failed" | "cancelled" | "blocked" | "error";

interface Progress {
  currentStage: string | null;
  completedStages: number;
  totalStages: number;
  progress: number;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Run Full Scan — one click drives the whole 13-stage pipeline to completion by
 * polling the bounded auto-run endpoint. It reuses the existing runtime end to
 * end: every server turn is the SAME controlled `run-once` through the SAME queue,
 * so retry/backoff/dead-letter/idempotency/budget all still apply.
 *
 * Client guarantees: exactly ONE request in flight (an in-flight ref + an
 * AbortController), automatic backoff between polls, safe resume when the page is
 * reopened mid-run, and clean teardown on navigation. It starts no work the queue
 * would not — duplicate polls are harmless because the queue lease serializes them.
 */
export function FullScanRunner(props: FullScanRunnerProps) {
  const router = useRouter();
  const running = useRef(false); // a poll loop is active (single in-flight)
  const stopped = useRef(false); // signal to halt the loop
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>(TERMINAL.has(props.initialStatus) ? (props.initialStatus === "completed" ? "done" : props.initialStatus === "failed" ? "failed" : "cancelled") : "idle");
  const [progress, setProgress] = useState<Progress>({ currentStage: props.initialStage, completedStages: 0, totalStages: props.totalStages, progress: props.initialProgress });
  const [execs, setExecs] = useState(0);
  const [polls, setPolls] = useState(0);
  const [retryInSec, setRetryInSec] = useState<number | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const teardown = useCallback(() => {
    stopped.current = true;
    running.current = false;
    abort.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const poll = useCallback(async () => {
    if (stopped.current) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/internal/runtime/run-until-wait", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: props.runId, clientId: props.clientId }),
        signal: ctrl.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (stopped.current) return;

      if (!res.ok || data === null || typeof data !== "object") {
        const message = res.status === 403 ? "You don't have permission to run this scan." : `The scan step could not run (${res.status}).`;
        setError(message);
        setPhase("error");
        running.current = false;
        return;
      }

      const r = data as AutoRunResponse;
      if (startedAt.current !== null) setElapsedMs(Date.now() - startedAt.current);
      setProgress({ currentStage: r.currentStage, completedStages: r.completedStages, totalStages: r.totalStages, progress: r.progress });
      setExecs((prev) => prev + r.stageExecutions);
      setPolls((prev) => prev + r.polls);
      setFailureCode(r.failureCode);

      if (r.nextAction === "continue") {
        const waiting = r.lastOutcome === "retried" || r.lastOutcome === "no_job_available";
        setPhase(waiting ? "waiting" : "running");
        setRetryInSec(waiting ? Math.max(1, Math.round(r.retryAfterMs / 1000)) : null);
        timer.current = setTimeout(() => void poll(), r.retryAfterMs);
        return;
      }

      // terminal or blocked — stop the loop and re-read the server state.
      running.current = false;
      setRetryInSec(null);
      if (r.nextAction === "blocked") {
        setPhase("blocked");
        setBlockedReason(r.blockedReason);
      } else {
        setPhase(r.status === "failed" ? "failed" : r.status === "cancelled" ? "cancelled" : "done");
      }
      router.refresh();
    } catch {
      if (ctrl.signal.aborted || stopped.current) return; // an intentional stop, not an error
      setError("Lost connection while running the scan. Click Resume to continue.");
      setPhase("error");
      running.current = false;
    }
  }, [props.runId, props.clientId, router]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    stopped.current = false;
    startedAt.current = Date.now();
    setError(null);
    setBlockedReason(null);
    setPhase("running");
    void poll();
  }, [poll]);

  // Resume-on-mount: if the run is already executing, pick the loop back up
  // automatically (survives refresh + navigation). Never restarts from Discovery —
  // it just resumes driving the run's next queued job.
  useEffect(() => {
    if (props.initialStatus === "running") start();
    return () => teardown();
  }, [props.initialStatus, start, teardown]);

  const active = phase === "running" || phase === "waiting";
  const pct = Math.max(0, Math.min(100, progress.progress));

  return (
    <OperationalPanel>
      <SectionRule index="01" label="Run full scan" meta={active ? "AUTOMATIC · CHECKPOINTED" : phase} />

      <div className={styles.controls}>
        <div className={[styles.stageCallout, active ? null : styles.stageCalloutMuted].filter(Boolean).join(" ")}>
          <span className={styles.stageLabel}>{active ? `Stage ${progress.completedStages + 1} of ${progress.totalStages} · ${stageLabel(progress.currentStage)}` : phase === "done" ? "Scan complete" : phase === "idle" ? "Ready to run the full scan" : stageLabel(progress.currentStage)}</span>
          <span className={styles.stageReason}>
            {active
              ? "Auxion is running every stage automatically — you can leave this page and come back."
              : phase === "done"
                ? "All 13 stages executed. The report is ready below."
                : phase === "failed"
                  ? `The scan stopped: ${failureCode ?? "an error occurred"}.`
                  : phase === "blocked"
                    ? `Paused: ${blockedReason ?? "a dependency is unavailable"}.`
                    : "One click runs the whole pipeline: discovery → evidence → reasoning → report."}
          </span>
        </div>

        {phase === "idle" || phase === "error" ? (
          <Button variant="primary" onClick={start}>
            {phase === "error" ? "Resume scan" : "Run full scan"}
          </Button>
        ) : null}

        {active ? (
          <Button variant="secondary" disabled loading>
            Running…
          </Button>
        ) : null}

        {props.canCancel && active ? (
          // A real form so Next handles the server action's redirect natively; the
          // loop is torn down on submit so no further poll fires after cancel.
          <form action={props.cancelAction} onSubmit={teardown} className={styles.controlForm}>
            <input type="hidden" name="runId" value={props.runId} />
            <Button type="submit" variant="secondary">
              Cancel scan
            </Button>
          </form>
        ) : null}
      </div>

      {/* progress bar */}
      <div className={styles.autorunProgress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Scan progress">
        <div className={styles.autorunBar} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.autorunMeta}>
        <Badge status={props.crawlerEnabled ? "active" : "pending"}>Crawler {props.crawlerEnabled ? "on" : "off"}</Badge>
        <Badge status={props.providerEnabled ? "active" : "pending"}>Provider {props.providerEnabled ? "on" : "off"}</Badge>
        <span className={styles.mono}>{progress.completedStages}/{progress.totalStages} stages</span>
        {active ? <span className={styles.mono}>{Math.round(elapsedMs / 1000)}s elapsed</span> : null}
        {execs > 0 ? <span className={styles.mono}>{execs} execution{execs === 1 ? "" : "s"}</span> : null}
        {polls > 0 ? <span className={styles.mono}>{polls} wait{polls === 1 ? "" : "s"}</span> : null}
      </div>

      {phase === "waiting" && retryInSec !== null ? (
        <div style={{ marginTop: "var(--space-3)" }} aria-live="polite">
          <Alert tone="info" title="Waiting for the runtime">
            Retrying in {retryInSec} second{retryInSec === 1 ? "" : "s"}… the scan continues automatically.
          </Alert>
        </div>
      ) : null}

      {phase === "blocked" ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="warning" title="Scan paused">
            {blockedReason === "provider_disabled"
              ? "Live reasoning is switched off (AUXION_LIVE_AI_ENABLED / AUXION_ANTHROPIC_ENABLED). Enable it, then run again."
              : blockedReason === "crawler_disabled"
                ? "The crawler is switched off (AUXION_CRAWLER_ENABLED). Enable it, then run again."
                : `The scan can't continue right now (${blockedReason ?? "unknown"}).`}
          </Alert>
        </div>
      ) : null}

      {phase === "failed" ? (
        <div style={{ marginTop: "var(--space-3)" }} role="alert">
          <Alert tone="danger" title="The scan didn't finish">
            {failureCode ? `Failure: ${failureCode}.` : "The scan stopped with an error."} Use Advanced → Retry scan to resume from the last checkpoint.
          </Alert>
        </div>
      ) : null}

      {phase === "done" ? (
        <div style={{ marginTop: "var(--space-3)" }} aria-live="polite">
          <Alert tone="success" title="Scan complete">
            All stages finished. The report and recommendations are ready below.
          </Alert>
        </div>
      ) : null}

      {error && phase === "error" ? (
        <div style={{ marginTop: "var(--space-3)" }} role="alert">
          <Alert tone="danger" title="Connection interrupted">
            {error}
          </Alert>
        </div>
      ) : null}

      <div className={styles.railFoot}>
        <span>One click · the full pipeline runs automatically</span>
        <span>Reuses the queue — same retries, budget, and checkpoints</span>
      </div>
    </OperationalPanel>
  );
}
