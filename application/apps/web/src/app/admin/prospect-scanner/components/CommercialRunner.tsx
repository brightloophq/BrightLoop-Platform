"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, SectionRule } from "@brightloop/ui";
import styles from "../scanner.module.css";

/** Mirrors the server DTO from `run-commercial-until-wait` (structural, no import). */
interface CommercialRunResponse {
  runId: string;
  status: "core_incomplete" | "running" | "ready_for_review" | "failed" | "blocked";
  currentStage: string | null;
  nextAction: "continue" | "done";
  retryAfterMs: number;
}

export interface CommercialRunnerProps {
  runId: string;
  /** The core scan has completed — the commercial workflow can run. */
  coreCompleted: boolean;
  /** Server-rendered package state — drives auto-resume on mount. */
  packageState: string;
}

type Phase = "idle" | "running" | "done" | "failed" | "blocked" | "error";

const STAGE_LABEL: Record<string, string> = {
  competitor_intelligence: "Competitor intelligence",
  proposal_generation: "Proposal draft",
  narrative_generation: "Client narrative",
};

/**
 * Drives the post-scan COMMERCIAL workflow to completion after a core scan finishes.
 *
 * It NEVER enqueues from the browser — it only asks the server to take bounded,
 * resumable turns via `run-commercial-until-wait` (which itself ensures the workflow
 * is kicked off). This is the resume-on-refresh seam: whenever a completed scan is
 * opened with an unfinished package, this component picks the workflow back up
 * automatically — repairing the exact single-shot failure seen on the live preview.
 * Single request in flight, backoff between polls, clean teardown on navigation.
 */
export function CommercialRunner(props: CommercialRunnerProps) {
  const router = useRouter();
  const running = useRef(false);
  const stopped = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resume when the package is still in flight; a terminal package needs no driver.
  const resumable = props.coreCompleted && (props.packageState === "not_started" || props.packageState === "running");
  const [phase, setPhase] = useState<Phase>(resumable ? "running" : props.packageState === "blocked" ? "blocked" : "idle");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch("/api/internal/runtime/run-commercial-until-wait", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: props.runId }),
        signal: ctrl.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (stopped.current) return;

      if (!res.ok || data === null || typeof data !== "object") {
        setError(res.status === 403 ? "You don't have permission to run the commercial workflow." : `The commercial step could not run (${res.status}).`);
        setPhase("error");
        running.current = false;
        return;
      }

      const r = data as CommercialRunResponse;
      setStage(r.currentStage);

      if (r.nextAction === "continue") {
        setPhase("running");
        timer.current = setTimeout(() => void poll(), Math.max(300, r.retryAfterMs));
        return;
      }

      running.current = false;
      setPhase(r.status === "ready_for_review" ? "done" : r.status === "failed" ? "failed" : r.status === "blocked" ? "blocked" : "done");
      router.refresh(); // pull the freshly-persisted package into the server-rendered panels
    } catch {
      if (ctrl.signal.aborted || stopped.current) return;
      setError("Lost connection while assembling the prospect package. Click Resume to continue.");
      setPhase("error");
      running.current = false;
    }
  }, [props.runId, router]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    stopped.current = false;
    setError(null);
    setPhase("running");
    void poll();
  }, [poll]);

  useEffect(() => {
    if (resumable) start();
    return () => teardown();
  }, [resumable, start, teardown]);

  if (!props.coreCompleted) return null;

  const active = phase === "running";
  return (
    <div className={styles.commercialRunner} aria-live="polite">
      <SectionRule index="06" label="Commercial workflow" meta={active ? "AUTOMATIC · RESUMABLE" : phase} />
      <div className={styles.autorunMeta}>
        <Badge status={active ? "active" : phase === "done" ? "active" : phase === "failed" ? "danger" : "pending"}>
          {active ? "Running" : phase === "done" ? "Ready for review" : phase === "failed" ? "Failed" : phase === "blocked" ? "Blocked" : "Idle"}
        </Badge>
        <span className={styles.stageReason}>
          {active
            ? `Assembling the prospect package${stage ? ` · ${STAGE_LABEL[stage] ?? stage}` : ""}… you can leave and come back.`
            : phase === "done"
              ? "Competitor, proposal and narrative are assembled — the package is ready for review below."
              : phase === "blocked"
                ? "The workflow stopped before the package was complete — see the package panel for the reason."
                : phase === "failed"
                  ? "The commercial workflow failed. Resume to retry from the last checkpoint."
                  : "The commercial workflow has not started."}
        </span>
      </div>

      {(phase === "idle" || phase === "error" || phase === "failed" || phase === "blocked") ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Button variant="secondary" onClick={start}>
            {phase === "idle" ? "Run commercial workflow" : "Resume commercial workflow"}
          </Button>
        </div>
      ) : null}

      {error && phase === "error" ? (
        <div style={{ marginTop: "var(--space-3)" }} role="alert">
          <Alert tone="danger" title="Connection interrupted">
            {error}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
