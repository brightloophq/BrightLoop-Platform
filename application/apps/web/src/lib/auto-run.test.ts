/* =============================================================================
 * One-click auto-run tests — the bounded loop, outcome classification, and the
 * browser DTO mapping. Pure: a fake driver + an injected clock, no runtime, no
 * network, no provider.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { DriverOutcome, DriverResult } from "@brightloop/providers";
import {
  AUTO_RUN_CONTINUE_MS,
  AUTO_RUN_DEFAULT_WAIT_MS,
  buildAutoRunResponse,
  classifyAutoRunOutcome,
  runUntilWait,
  type AutoRunDriver,
  type AutoRunLoopResult,
} from "./auto-run";

const dr = (outcome: DriverOutcome, over: Partial<DriverResult> = {}): DriverResult => ({
  executionId: "e", correlationId: "c", runId: "run_1", queueJobId: "job_1", stage: "graph_assembly",
  providerId: null, modelId: null, outcome, artifactIds: [], checkpointId: null, downstreamJobId: null,
  retryDisposition: null, blockedReason: null, failureCode: null, latencyMs: null, usage: null,
  validationStatus: null, startedAt: "t", completedAt: "t", durationMs: 0, warnings: [], ...over,
});

/** A driver that replays a scripted list of outcomes (last repeats) and advances the clock. */
function scriptedDriver(outcomes: DriverOutcome[], clock: { t: number }, perTurnMs = 100) {
  let i = 0;
  let calls = 0;
  const driver: AutoRunDriver = {
    async runQueueTurn() {
      calls += 1;
      clock.t += perTurnMs;
      const o = outcomes[Math.min(i, outcomes.length - 1)]!;
      i += 1;
      return dr(o);
    },
  };
  return { driver, get calls() { return calls; } };
}

const now = (clock: { t: number }) => () => clock.t;

describe("classifyAutoRunOutcome", () => {
  it("maps every driver outcome to a loop decision", () => {
    expect(classifyAutoRunOutcome("advanced")).toBe("continue");
    expect(classifyAutoRunOutcome("no_job_available")).toBe("wait");
    expect(classifyAutoRunOutcome("retried")).toBe("wait");
    expect(classifyAutoRunOutcome("blocked")).toBe("blocked");
    expect(classifyAutoRunOutcome("provider_disabled")).toBe("blocked");
    for (const o of ["completed", "failed", "cancelled", "deadline_exceeded", "budget_exhausted"] as const) {
      expect(classifyAutoRunOutcome(o)).toBe("terminal");
    }
  });
});

describe("runUntilWait", () => {
  it("advances through several stages then stops on completion", async () => {
    const clock = { t: 0 };
    const h = scriptedDriver(["advanced", "advanced", "advanced", "completed"], clock);
    const r = await runUntilWait(h.driver, { clientId: "c1", owner: "o", now: now(clock) });
    expect(r.turnsExecuted).toBe(4);
    expect(r.decision).toBe("terminal");
    expect(r.budgetReached).toBe(false);
    expect(r.last?.outcome).toBe("completed");
  });

  it("stops immediately on a waiting (retried) turn", async () => {
    const clock = { t: 0 };
    const { driver } = scriptedDriver(["retried"], clock);
    const r = await runUntilWait(driver, { clientId: "c1", owner: "o", now: now(clock) });
    expect(r.turnsExecuted).toBe(1);
    expect(r.decision).toBe("wait");
  });

  it("separates real stage executions from empty polls in the metrics", async () => {
    const clock = { t: 0 };
    // advance, advance, then an empty poll (no_job_available) which stops the loop
    const { driver } = scriptedDriver(["advanced", "advanced", "no_job_available"], clock);
    const r = await runUntilWait(driver, { clientId: "c1", owner: "o", now: now(clock) });
    expect(r.stageExecutions).toBe(2);
    expect(r.emptyPolls).toBe(1);
    expect(r.turnsExecuted).toBe(3);
  });

  it("stops on a blocked turn (never loops on it)", async () => {
    const clock = { t: 0 };
    const { driver } = scriptedDriver(["advanced", "provider_disabled"], clock);
    const r = await runUntilWait(driver, { clientId: "c1", owner: "o", now: now(clock) });
    expect(r.turnsExecuted).toBe(2);
    expect(r.decision).toBe("blocked");
  });

  it("respects the turn bound and reports budgetReached when still advancing", async () => {
    const clock = { t: 0 };
    const h = scriptedDriver(["advanced"], clock, 1); // always advances
    const r = await runUntilWait(h.driver, { clientId: "c1", owner: "o", now: now(clock), maxTurns: 5 });
    expect(r.turnsExecuted).toBe(5);
    expect(h.calls).toBe(5);
    expect(r.decision).toBe("continue");
    expect(r.budgetReached).toBe(true);
  });

  it("respects the time bound", async () => {
    const clock = { t: 0 };
    const { driver } = scriptedDriver(["advanced"], clock, 300); // 300ms per turn
    const r = await runUntilWait(driver, { clientId: "c1", owner: "o", now: now(clock), maxMillis: 1000, maxTurns: 100 });
    // 1000ms / 300ms ≈ 3-4 turns before the window closes
    expect(r.turnsExecuted).toBeLessThanOrEqual(4);
    expect(r.budgetReached).toBe(true);
  });

  it("clamps maxTurns to the ceiling", async () => {
    const clock = { t: 0 };
    const { driver } = scriptedDriver(["advanced"], clock, 1);
    const r = await runUntilWait(driver, { clientId: "c1", owner: "o", now: now(clock), maxTurns: 9999, maxMillis: 9999 });
    expect(r.turnsExecuted).toBeLessThanOrEqual(25);
  });
});

describe("buildAutoRunResponse", () => {
  const loop = (over: Partial<AutoRunLoopResult>): AutoRunLoopResult => ({ turnsExecuted: 1, stageExecutions: 1, emptyPolls: 0, last: dr("advanced"), decision: "continue", budgetReached: false, ...over });

  it("continues (poll again) with the exact backoff when waiting", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "running", currentStage: "provider_execution", progress: 60, loop: loop({ decision: "wait", last: dr("retried") }), retryAfterMs: 12000 });
    expect(r.nextAction).toBe("continue");
    expect(r.retryAfterMs).toBe(12000);
  });

  it("continues promptly when the server window closed mid-progress", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "running", currentStage: "graph_assembly", progress: 40, loop: loop({ decision: "continue", budgetReached: true }) });
    expect(r.nextAction).toBe("continue");
    expect(r.retryAfterMs).toBe(AUTO_RUN_CONTINUE_MS);
  });

  it("uses the default wait when no backoff is known", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "running", currentStage: "provider_execution", progress: 60, loop: loop({ decision: "wait", last: dr("no_job_available") }) });
    expect(r.retryAfterMs).toBe(AUTO_RUN_DEFAULT_WAIT_MS);
  });

  it("reports done for a completed run — never asks to keep polling", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "completed", currentStage: null, progress: 100, loop: loop({ decision: "wait", last: dr("no_job_available") }) });
    expect(r.nextAction).toBe("done");
    expect(r.retryAfterMs).toBe(0);
    expect(r.completedStages).toBe(r.totalStages);
  });

  it("reports blocked with a reason and stops", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "running", currentStage: "provider_execution", progress: 60, loop: loop({ decision: "blocked", last: dr("provider_disabled", { blockedReason: "provider_disabled" }) }) });
    expect(r.nextAction).toBe("blocked");
    expect(r.blockedReason).toBe("provider_disabled");
    expect(r.retryAfterMs).toBe(0);
  });

  it("surfaces a structured failure code on a failed run", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "failed", currentStage: "provider_execution", progress: 60, loop: loop({ decision: "terminal", last: dr("failed", { failureCode: "reasoning_output_truncated" }) }) });
    expect(r.nextAction).toBe("done");
    expect(r.failureCode).toBe("reasoning_output_truncated");
  });

  it("computes completed stages from the current stage", () => {
    const r = buildAutoRunResponse({ runId: "run_1", scanStatus: "running", currentStage: "graph_snapshot", progress: 45, loop: loop({}) });
    // graph_snapshot is index 5 → 5 stages completed before it
    expect(r.completedStages).toBe(5);
    expect(r.totalStages).toBe(13);
  });
});
