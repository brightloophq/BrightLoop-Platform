/* =============================================================================
 * One-click auto-run — bounded queue-driving loop (Phase C · Sprint C6).
 *
 * "Run Full Scan" drives the EXISTING runtime to completion by repeating the
 * EXISTING one-turn driver (`runQueueTurn`) inside a bounded server window, then
 * telling the browser whether to poll again. It creates NO new engine, leases
 * through the SAME queue, and respects the SAME retry/backoff/dead-letter policy:
 * every turn is exactly the controlled `run-once`, just called in a bounded loop.
 *
 * This module is PURE + dependency-light (it takes an injected driver + clock),
 * so the loop, the outcome classification, and the response mapping are all
 * exhaustively unit-testable without a runtime, a network, or a provider.
 * ========================================================================== */

import { PIPELINE_STAGE_ORDER } from "@brightloop/domain";
import type { DriverOutcome, DriverResult } from "@brightloop/providers";
import { stageLabel } from "./prospect-scanner";

/* ---- bounds (kept well under the serverless execution window) --------------- */
export const AUTO_RUN_DEFAULT_MAX_TURNS = 12;
export const AUTO_RUN_MAX_TURNS_CEIL = 25;
export const AUTO_RUN_DEFAULT_MAX_MS = 8_000;
export const AUTO_RUN_MAX_MS_CEIL = 9_000;
/** Delay before the browser polls again when there is more work right now. */
export const AUTO_RUN_CONTINUE_MS = 250;
/** Delay when idle/waiting and the exact backoff is unknown. */
export const AUTO_RUN_DEFAULT_WAIT_MS = 2_000;

const clampInt = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.floor(n)));

/* ---- outcome classification ------------------------------------------------- */
/**
 * What the loop should do after one driver turn:
 *   continue — a downstream stage was enqueued and is ready right now;
 *   wait     — nothing is leaseable yet (a retry is backing off, or idle);
 *   terminal — the run finished, failed, was cancelled, or hit its deadline/budget;
 *   blocked  — a dependency (crawler/provider) is off; re-running would just loop.
 */
export type AutoRunDecision = "continue" | "wait" | "terminal" | "blocked";

export function classifyAutoRunOutcome(outcome: DriverOutcome): AutoRunDecision {
  switch (outcome) {
    case "advanced":
      return "continue";
    case "no_job_available":
    case "retried":
      return "wait";
    case "blocked":
    case "provider_disabled":
      return "blocked";
    case "completed":
    case "failed":
    case "cancelled":
    case "deadline_exceeded":
    case "budget_exhausted":
      return "terminal";
  }
}

/* ---- the bounded loop -------------------------------------------------------- */
/** The minimum a driver must expose for the loop — one controlled turn. */
export interface AutoRunDriver {
  runQueueTurn(options: { owner?: string; clientId?: string | null }): Promise<DriverResult>;
}

export interface RunUntilWaitOptions {
  clientId: string | null;
  owner: string;
  /** Monotonic ms clock — injected for deterministic tests. */
  now: () => number;
  maxTurns?: number;
  maxMillis?: number;
}

export interface AutoRunLoopResult {
  turnsExecuted: number;
  /** Turns that actually executed a stage (advanced/blocked/failed/retried). */
  stageExecutions: number;
  /** Turns that leased nothing (`no_job_available`) — waits, not work. */
  emptyPolls: number;
  last: DriverResult | null;
  decision: AutoRunDecision;
  /** True when the loop stopped only because it hit its turn/time bound while
   * still advancing — the caller should poll again promptly. */
  budgetReached: boolean;
}

/**
 * Drive the queue with the existing one-turn driver until it is no longer
 * immediately advancing (or the bounded window is spent). Leases through the SAME
 * queue as the manual path; the coordinator owns lease/retry/backoff/dead-letter.
 */
export async function runUntilWait(driver: AutoRunDriver, opts: RunUntilWaitOptions): Promise<AutoRunLoopResult> {
  const maxTurns = clampInt(opts.maxTurns ?? AUTO_RUN_DEFAULT_MAX_TURNS, 1, AUTO_RUN_MAX_TURNS_CEIL);
  const maxMillis = clampInt(opts.maxMillis ?? AUTO_RUN_DEFAULT_MAX_MS, 500, AUTO_RUN_MAX_MS_CEIL);
  const start = opts.now();

  let turnsExecuted = 0;
  let stageExecutions = 0;
  let emptyPolls = 0;
  let last: DriverResult | null = null;
  let decision: AutoRunDecision = "terminal";

  while (turnsExecuted < maxTurns && opts.now() - start < maxMillis) {
    last = await driver.runQueueTurn({ owner: opts.owner, clientId: opts.clientId });
    turnsExecuted += 1;
    if (last.outcome === "no_job_available") emptyPolls += 1;
    else stageExecutions += 1;
    decision = classifyAutoRunOutcome(last.outcome);
    if (decision !== "continue") break;
  }

  // If we exited while the last turn was still "continue", we stopped only because
  // the bound was reached — there is more work waiting for the next poll.
  return { turnsExecuted, stageExecutions, emptyPolls, last, decision, budgetReached: decision === "continue" };
}

/* ---- response mapping -------------------------------------------------------- */
export type AutoRunNextAction = "continue" | "done" | "blocked";

/** The safe DTO the browser polls. No provider content, no keys, no raw output. */
export interface AutoRunResponse {
  runId: string;
  /** The scan lifecycle (pending | running | completed | failed | cancelled | blocked). */
  status: string;
  currentStage: string | null;
  currentStageLabel: string;
  completedStages: number;
  totalStages: number;
  progress: number;
  /** Total driver turns this request (executions + empty polls) — kept for compat. */
  turnsExecuted: number;
  /** Turns that actually executed a stage. */
  stageExecutions: number;
  /** Turns that leased nothing (waits, not work). */
  polls: number;
  /** continue → poll again after retryAfterMs; done → stop; blocked → stop + surface. */
  nextAction: AutoRunNextAction;
  retryAfterMs: number;
  failureCode: string | null;
  blockedReason: string | null;
  lastOutcome: string;
}

export interface BuildAutoRunResponseInput {
  runId: string;
  scanStatus: string;
  currentStage: string | null;
  progress: number;
  loop: AutoRunLoopResult;
  /** Exact backoff (ms) for the next poll when waiting; falls back to a default. */
  retryAfterMs?: number;
}

const TERMINAL_SCAN_STATUSES = new Set(["completed", "failed", "cancelled"]);

/** Map the loop result + current scan status into the browser-facing DTO. */
export function buildAutoRunResponse(input: BuildAutoRunResponseInput): AutoRunResponse {
  const total = PIPELINE_STAGE_ORDER.length;
  const scanTerminal = TERMINAL_SCAN_STATUSES.has(input.scanStatus);

  // A terminal run NEVER asks the browser to keep polling, whatever the last turn
  // reported (e.g. `no_job_available` on an already-completed run means "done").
  const nextAction: AutoRunNextAction = scanTerminal
    ? "done"
    : input.loop.decision === "blocked"
      ? "blocked"
      : input.loop.decision === "terminal"
        ? "done"
        : "continue";

  const completedStages =
    input.scanStatus === "completed"
      ? total
      : Math.max(0, (PIPELINE_STAGE_ORDER as readonly string[]).indexOf(input.currentStage ?? ""));

  const retryAfterMs =
    nextAction !== "continue"
      ? 0
      : input.loop.budgetReached
        ? AUTO_RUN_CONTINUE_MS
        : Math.max(AUTO_RUN_CONTINUE_MS, input.retryAfterMs ?? AUTO_RUN_DEFAULT_WAIT_MS);

  return {
    runId: input.runId,
    status: input.scanStatus,
    currentStage: input.currentStage,
    currentStageLabel: stageLabel(input.currentStage),
    completedStages,
    totalStages: total,
    progress: input.progress,
    turnsExecuted: input.loop.turnsExecuted,
    stageExecutions: input.loop.stageExecutions,
    polls: input.loop.emptyPolls,
    nextAction,
    retryAfterMs,
    failureCode: input.loop.last?.failureCode ?? null,
    blockedReason: input.loop.last?.blockedReason ?? null,
    lastOutcome: input.loop.last?.outcome ?? "no_job_available",
  };
}
