import { describe, it, expect } from "vitest";
import type { CommercialCoordinator } from "@brightloop/domain";
import { ensureCommercialWorkflowStarted, driveCommercialUntilWait, COMMERCIAL_MAX_TURNS } from "./commercial-run";

/** A minimal fake coordinator — only the methods the helpers call. */
function fakeCoordinator(overrides: Partial<Record<"runCommercialOnce" | "ensureStarted", unknown>> = {}): {
  coordinator: CommercialCoordinator;
  ensureCalls: unknown[];
} {
  const ensureCalls: unknown[] = [];
  const coordinator = {
    ensureStarted: async (input: unknown) => {
      ensureCalls.push(input);
      return { ok: true, code: "created", value: { id: "job_1" } };
    },
    runCommercialOnce: async () => ({ ok: true, code: "found", value: null }),
    ...overrides,
  } as unknown as CommercialCoordinator;
  return { coordinator, ensureCalls };
}

const stageResult = (stage: string) => ({ ok: true, code: "found", value: { stage, status: "ready", persisted: "created" } });

describe("ensureCommercialWorkflowStarted", () => {
  it("forwards the target to the coordinator's ensureStarted seam", async () => {
    const { coordinator, ensureCalls } = fakeCoordinator();
    const res = await ensureCommercialWorkflowStarted(coordinator, { runId: "r1", scanId: "s1", clientId: null });
    expect(res).toMatchObject({ ok: true, code: "created" });
    expect(ensureCalls).toEqual([{ runId: "r1", scanId: "s1", clientId: null }]);
  });
});

describe("driveCommercialUntilWait", () => {
  it("stops as soon as the queue is idle (null turn) and reports idle", async () => {
    const { coordinator } = fakeCoordinator();
    const out = await driveCommercialUntilWait(coordinator, "owner");
    expect(out.idle).toBe(true);
    expect(out.results).toHaveLength(0);
    expect(out.turns).toBe(0);
  });

  it("collects stage results until idle", async () => {
    const stages = ["competitor_intelligence", "proposal_generation", "narrative_generation"];
    let i = 0;
    const { coordinator } = fakeCoordinator({
      runCommercialOnce: async () => (i < stages.length ? stageResult(stages[i++]!) : { ok: true, code: "found", value: null }),
    });
    const out = await driveCommercialUntilWait(coordinator, "owner");
    expect(out.results.map((r) => r.stage)).toEqual(stages);
    expect(out.idle).toBe(true);
  });

  it("stops on a stage failure and does NOT mark idle", async () => {
    const { coordinator } = fakeCoordinator({
      runCommercialOnce: async () => ({ ok: false, code: "not_found", message: "missing" }),
    });
    const out = await driveCommercialUntilWait(coordinator, "owner");
    expect(out.idle).toBe(false);
    expect(out.results).toHaveLength(0);
  });

  it("respects the turn bound (never leases unboundedly)", async () => {
    let calls = 0;
    const { coordinator } = fakeCoordinator({
      runCommercialOnce: async () => {
        calls += 1;
        return stageResult("competitor_intelligence"); // never idle
      },
    });
    const out = await driveCommercialUntilWait(coordinator, "owner", { maxTurns: 2, maxMillis: 999_999 });
    expect(out.turns).toBe(2);
    expect(calls).toBe(2);
  });

  it("respects the time box via the injected clock", async () => {
    let t = 0;
    const { coordinator } = fakeCoordinator({
      runCommercialOnce: async () => stageResult("competitor_intelligence"),
    });
    // Clock jumps past the time box after the first turn.
    const out = await driveCommercialUntilWait(coordinator, "owner", { maxTurns: COMMERCIAL_MAX_TURNS, maxMillis: 5, now: () => (t += 4) });
    expect(out.turns).toBeLessThan(COMMERCIAL_MAX_TURNS);
  });
});
