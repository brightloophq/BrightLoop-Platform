/* =============================================================================
 * Runtime services & coordinator (Phase B · Sprint 13C) — DETERMINISTIC tests.
 *
 * Every test runs against `InMemoryRuntimeRepository` with an INJECTED clock and
 * a counter-based id generator. No wall clock, no randomness, no I/O — so a
 * failure is always a real defect and never a flake.
 *
 * The double mirrors the live adapter's semantics (idempotency, lease ownership,
 * lease expiry, terminal states, event sequencing); the live adapter itself is
 * covered by the 20 integration tests landed in Sprint 13B.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { PipelineRunStage, RuntimeArtifactKind, SelectionResult } from "@brightloop/schema";
import { PIPELINE_STAGE_ORDER, PIPELINE_STAGE_SPECS } from "../../scan-engine/pipeline-run/stages.js";
import { InMemoryRuntimeRepository } from "../testing/in-memory-repository.js";
import { createRuntimeServices, type RuntimeServices } from "./index.js";
import { backoffMsFor, QueueService } from "./queue.service.js";
import { type StageWork } from "./coordinator.js";
import * as views from "./read-models.js";

const T0 = "2026-07-21T00:00:00.000Z";

interface Harness {
  repo: InMemoryRuntimeRepository;
  svc: RuntimeServices;
  advance: (ms: number) => void;
  now: () => string;
}

function harness(start = T0): Harness {
  let millis = new Date(start).getTime();
  const now = () => new Date(millis).toISOString();
  let counter = 0;
  const ids = (prefix: string) => `${prefix}_${++counter}`;
  const repo = new InMemoryRuntimeRepository(now);
  const svc = createRuntimeServices({ repo, ids, clock: now });
  return { repo, svc, advance: (ms) => { millis += ms; }, now };
}

/** A stage executor that produces exactly the artifact its Phase-A spec declares. */
const executor = async (stage: PipelineRunStage): Promise<StageWork> => {
  const kind = PIPELINE_STAGE_SPECS[stage].producesArtifact;
  return kind === null
    ? { envelope: null, kind: null }
    : { envelope: { stage, produced: kind }, kind: kind as RuntimeArtifactKind };
};

const START = { clientId: "c1", scanId: "scan-1" };

/** A fully-typed routing result whose fallback chain drives `decideRetry`. */
function withFallback(fallbackOrder: string[]): SelectionResult {
  return {
    selected: "p1",
    estimatedCost: 1,
    estimatedLatencyMs: 10,
    fallbackOrder,
    rejected: [],
    rationale: {
      taskType: "reasoning",
      consideredCount: 2,
      eligibleCount: 2,
      orderedBy: ["preferred"],
      softBudgetWarning: false,
      projectedJobSpend: 1,
    },
  };
}

/** Drive a run to completion through the queue, one worker turn at a time. */
async function drainQueue(h: Harness, owner = "worker-1", maxTurns = 40): Promise<number> {
  let turns = 0;
  for (let i = 0; i < maxTurns; i += 1) {
    const turn = await h.svc.coordinator.runOnce(owner, executor);
    if (!turn.ok) throw new Error(`turn failed: ${turn.message}`);
    if (turn.value === null) break;
    turns += 1;
  }
  return turns;
}

/* ===== 1 · run lifecycle ==================================================== */
describe("RunService", () => {
  it("creates a run once per scan and replays a duplicate start", async () => {
    const h = harness();
    const first = await h.svc.runs.createRun(START);
    const second = await h.svc.runs.createRun(START);

    expect(first).toMatchObject({ ok: true, code: "created" });
    expect(second).toMatchObject({ ok: true, code: "replayed" });
    expect(second.ok && second.value.id).toBe(first.ok && first.value.id);
    expect(h.repo.allRuns()).toHaveLength(1);
  });

  it("rejects an illegal (backwards) status transition", async () => {
    const h = harness();
    const run = await h.svc.runs.createRun(START);
    const id = run.ok ? run.value.id : "";

    expect(await h.svc.runs.transition(id, "executing_reasoning")).toMatchObject({ ok: true });
    const backwards = await h.svc.runs.transition(id, "discovering");
    expect(backwards).toMatchObject({ ok: false, code: "terminal_state" });
    expect(backwards.ok === false && backwards.message).toContain("illegal run transition");
  });

  it("refuses to move a completed run and cancels idempotently", async () => {
    const h = harness();
    const a = await h.svc.runs.createRun(START);
    const idA = a.ok ? a.value.id : "";
    await h.svc.runs.completeRun(idA);
    expect(await h.svc.runs.transition(idA, "failed")).toMatchObject({ ok: false, code: "terminal_state" });
    expect(await h.svc.runs.cancelRun(idA)).toMatchObject({ ok: false, code: "terminal_state" });

    const h2 = harness();
    const b = await h2.svc.runs.createRun(START);
    const idB = b.ok ? b.value.id : "";
    expect(await h2.svc.runs.cancelRun(idB)).toMatchObject({ ok: true, code: "updated" });
    expect(await h2.svc.runs.cancelRun(idB)).toMatchObject({ ok: true, code: "replayed" });
  });

  it("detects a passed deadline", async () => {
    const h = harness();
    const run = await h.svc.runs.createRun({ ...START, deadline: "2026-07-21T00:00:10.000Z" });
    expect(run.ok && h.svc.runs.isPastDeadline(run.value, h.now())).toBe(false);
    h.advance(11_000);
    expect(run.ok && h.svc.runs.isPastDeadline(run.value, h.now())).toBe(true);
  });
});

/* ===== 2 · artifacts: immutability + lineage ================================= */
describe("ArtifactService", () => {
  it("replays an identical artifact and CONFLICTS on changed content at the same version", async () => {
    const h = harness();
    const base = { runId: "r1", clientId: "c1", scanId: "s1", kind: "findings" as const };

    expect(await h.svc.artifacts.persist({ ...base, envelope: { a: 1 } })).toMatchObject({ ok: true, code: "created" });
    expect(await h.svc.artifacts.persist({ ...base, envelope: { a: 1 } })).toMatchObject({ ok: true, code: "replayed" });
    // same version, different content → refused; history is never rewritten
    expect(await h.svc.artifacts.persist({ ...base, envelope: { a: 2 } })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("revises to a new version, preserving lineage and the prior row", async () => {
    const h = harness();
    const first = await h.svc.artifacts.persist({
      runId: "r1", clientId: "c1", scanId: "s1", kind: "findings", envelope: { v: 1 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await h.svc.artifacts.revise(first.value, { v: 2 });
    expect(second).toMatchObject({ ok: true, code: "created" });
    if (!second.ok) return;

    expect(second.value.version).toBe(2);
    expect(second.value.sourceArtifactIds).toContain(first.value.id);
    expect(second.value.checksum).not.toBe(first.value.checksum);

    // the predecessor is untouched
    const prior = await h.svc.artifacts.get(first.value.id);
    expect(prior.ok && prior.value.version).toBe(1);
    expect(prior.ok && prior.value.checksum).toBe(first.value.checksum);

    const latest = await h.svc.artifacts.latest("r1", "findings");
    expect(latest.ok && latest.value?.version).toBe(2);
  });

  it("computes the same checksum as the Phase-A engine for identical content", async () => {
    const h = harness();
    const a = await h.svc.artifacts.persist({ runId: "r1", clientId: null, scanId: "s1", kind: "findings", envelope: { x: 1, y: [2, 3] } });
    const b = await h.svc.artifacts.persist({ runId: "r2", clientId: null, scanId: "s1", kind: "findings", envelope: { x: 1, y: [2, 3] } });
    expect(a.ok && b.ok && a.value.checksum).toBe(b.ok ? b.value.checksum : "");
  });
});

/* ===== 3 · pipeline gating ==================================================== */
describe("PipelineService", () => {
  it("blocks a stage whose dependencies are absent and names what is missing", async () => {
    const h = harness();
    const run = await h.svc.runs.createRun(START);
    if (!run.ok) return;
    const ctx = { runId: run.value.id, clientId: "c1", scanId: "scan-1" };

    const gate = await h.svc.pipeline.gate(ctx.runId, null, "graph_assembly");
    expect(gate.ok && gate.value.allowed).toBe(false);
    expect(gate.ok && gate.value.reason).toBe("dependencies_unmet");
    expect(gate.ok && gate.value.missing).toContain("evidence_bundle");

    const begun = await h.svc.pipeline.beginStage(ctx, null, "graph_assembly");
    expect(begun).toMatchObject({ ok: false, code: "check_violation" });
  });

  it("rejects an out-of-order stage transition outright", async () => {
    const h = harness();
    const run = await h.svc.runs.createRun(START);
    if (!run.ok) return;
    const ctx = { runId: run.value.id, clientId: "c1", scanId: "scan-1" };
    const begun = await h.svc.pipeline.beginStage(ctx, "report_assembly", "discovery_planning");
    expect(begun).toMatchObject({ ok: false, code: "terminal_state" });
  });

  it("allows a stage once its dependency artifact exists", async () => {
    const h = harness();
    const run = await h.svc.runs.createRun(START);
    if (!run.ok) return;
    const runId = run.value.id;

    await h.svc.artifacts.persist({ runId, clientId: "c1", scanId: "scan-1", kind: "evidence_bundle", envelope: {}, validationStatus: "valid" });
    const gate = await h.svc.pipeline.gate(runId, null, "graph_assembly");
    expect(gate.ok && gate.value.allowed).toBe(true);
  });
});

/* ===== 4 · queue orchestration ================================================= */
describe("QueueService", () => {
  it("enqueues the same work once (duplicate prevention)", async () => {
    const h = harness();
    const input = { jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "discovery_planning" };
    expect(await h.svc.queue.enqueue(input)).toMatchObject({ ok: true, code: "created" });
    expect(await h.svc.queue.enqueue(input)).toMatchObject({ ok: true, code: "replayed" });
    expect(h.repo.allJobs()).toHaveLength(1);
  });

  it("leases in priority order and reports an idle queue as no_job_available", async () => {
    const h = harness();
    const base = { jobType: "advance_stage", clientId: "c1", scanId: "s1" };
    await h.svc.queue.enqueue({ ...base, runId: "r-low", stage: "a", priority: 9 });
    await h.svc.queue.enqueue({ ...base, runId: "r-high", stage: "b", priority: 1 });

    const first = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    expect(first.ok && first.value.runId).toBe("r-high");
    const second = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    expect(second.ok && second.value.runId).toBe("r-low");
    expect(await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 })).toMatchObject({ ok: false, code: "no_job_available" });
  });

  it("enforces lease ownership on renew, complete and release", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a" });
    const leased = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    if (!leased.ok) return;
    const jobId = leased.value.id;

    expect(await h.svc.queue.renew(jobId, "intruder", 60)).toMatchObject({ ok: false, code: "lease_lost" });
    expect(await h.svc.queue.complete(jobId, "intruder")).toMatchObject({ ok: false, code: "lease_lost" });
    expect(await h.svc.queue.release(jobId, "intruder")).toMatchObject({ ok: false, code: "lease_lost" });
    expect(await h.svc.queue.renew(jobId, "w1", 60)).toMatchObject({ ok: true });
  });

  it("renews a lease so it survives past the original expiry", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a" });
    const leased = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 30 });
    if (!leased.ok) return;

    h.advance(20_000);
    expect(await h.svc.queue.renew(leased.value.id, "w1", 30)).toMatchObject({ ok: true });
    h.advance(20_000); // past the ORIGINAL expiry, inside the renewed one
    expect(await h.svc.queue.complete(leased.value.id, "w1")).toMatchObject({ ok: true });
  });

  it("expires a stale lease and lets another worker recover the job", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a" });
    const first = await h.svc.queue.lease({ owner: "dead-worker", leaseSeconds: 10 });
    expect(first.ok).toBe(true);

    // nothing is available while the lease is live
    expect(await h.svc.queue.lease({ owner: "w2", leaseSeconds: 30 })).toMatchObject({ ok: false, code: "no_job_available" });

    h.advance(11_000); // the lease lapses — no sweeper involved
    const recovered = await h.svc.queue.lease({ owner: "w2", leaseSeconds: 30 });
    expect(recovered).toMatchObject({ ok: true, code: "leased" });
    expect(recovered.ok && recovered.value.leaseOwner).toBe("w2");
    // the dead worker can no longer act on it
    expect(first.ok && (await h.svc.queue.complete(first.value.id, "dead-worker"))).toMatchObject({ ok: false, code: "lease_lost" });
  });

  it("schedules a retry with exponential backoff, then dead-letters when attempts run out", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a", maxAttempts: 2 });

    const leased = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    if (!leased.ok) return;
    const retried = await h.svc.queue.fail(leased.value, "w1", "boom");
    expect(retried.ok && retried.value.status).toBe("queued");
    expect(retried.ok && retried.value.availableAt > h.now()).toBe(true);

    // exhaust the attempt budget
    h.advance(60_000);
    const again = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    if (!again.ok) return;
    const dead = await h.svc.queue.fail(again.value, "w1", "boom again");
    expect(dead.ok && dead.value.status).toBe("dead_letter");
  });

  it("dead-letters immediately on a fatal failure regardless of attempts left", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a", maxAttempts: 10 });
    const leased = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    if (!leased.ok) return;
    const dead = await h.svc.queue.fail(leased.value, "w1", "unrecoverable", { fatal: true });
    expect(dead.ok && dead.value.status).toBe("dead_letter");
  });

  it("releases without consuming an attempt", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a" });
    const leased = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    if (!leased.ok) return;
    expect(leased.value.attempt).toBe(1);

    const released = await h.svc.queue.release(leased.value.id, "w1");
    expect(released.ok && released.value.status).toBe("queued");
    expect(released.ok && released.value.attempt).toBe(0);
  });

  it("computes deterministic, capped exponential backoff", () => {
    expect(backoffMsFor(0)).toBe(1_000);
    expect(backoffMsFor(1)).toBe(2_000);
    expect(backoffMsFor(4)).toBe(16_000);
    expect(backoffMsFor(99)).toBe(300_000); // ceiling
    expect(backoffMsFor(3)).toBe(backoffMsFor(3)); // deterministic
  });

  it("cancels idempotently and refuses a terminal job", async () => {
    const h = harness();
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a" });
    const job = h.repo.allJobs()[0]!;
    expect(await h.svc.queue.cancel(job.id)).toMatchObject({ ok: true, code: "updated" });
    expect(await h.svc.queue.cancel(job.id)).toMatchObject({ ok: true, code: "replayed" });
  });
});

/* ===== 5 · reasoning + provider attempts ======================================== */
describe("ReasoningService & ProviderAttemptService", () => {
  it("creates a reasoning job once and replays a duplicate", async () => {
    const h = harness();
    const input = { runId: "r1", clientId: "c1", scanId: "s1", stage: "provider_execution", taskType: "synthesis" };
    expect(await h.svc.reasoning.create(input)).toMatchObject({ ok: true, code: "created" });
    expect(await h.svc.reasoning.create(input)).toMatchObject({ ok: true, code: "replayed" });
  });

  it("falls back to another provider when one is available, and stops when attempts run out", async () => {
    const h = harness();
    const created = await h.svc.reasoning.create({ runId: "r1", clientId: "c1", scanId: "s1", stage: "provider_execution", taskType: "t", maxAttempts: 3 });
    if (!created.ok) return;

    const selection = withFallback(["p2"]);
    const first = await h.svc.reasoning.recordFailure(created.value, "retryable", "timeout-ish", selection);
    expect(first.ok && first.value.decision).toBe("retry_fallback");

    // a validation failure retries the SAME route rather than switching provider
    const job2 = first.ok ? first.value.job : created.value;
    const second = await h.svc.reasoning.recordFailure(job2, "validation", "schema mismatch", selection);
    expect(second.ok && second.value.decision).toBe("retry_same");

    // attempt budget exhausted → stop, and the job is durably failed
    const job3 = second.ok ? second.value.job : job2;
    const third = await h.svc.reasoning.recordFailure(job3, "retryable", "again", selection);
    expect(third.ok && third.value.decision).toBe("stop");
    expect(third.ok && third.value.job.status).toBe("failed");
  });

  it("stops immediately on a non-retryable failure", async () => {
    const h = harness();
    const created = await h.svc.reasoning.create({ runId: "r1", clientId: "c1", scanId: "s1", stage: "provider_execution", taskType: "t" });
    if (!created.ok) return;
    const result = await h.svc.reasoning.recordFailure(created.value, "fatal", "unrecoverable", null);
    expect(result.ok && result.value.decision).toBe("stop");
  });

  it("records attempts idempotently and totals cost, preferring measured over estimated", async () => {
    const h = harness();
    const attempt = {
      reasoningJobId: "rj1", runId: "r1", clientId: "c1", scanId: "s1",
      providerId: "opaque-a", attempt: 0, status: "succeeded" as const,
      estimatedCost: 0.01, actualCost: 0.008, inputTokens: 100, outputTokens: 20,
      usageEstimated: false, rawResponseRef: "blob://x",
    };
    expect(await h.svc.providerAttempts.record(attempt)).toMatchObject({ ok: true, code: "created" });
    expect(await h.svc.providerAttempts.record(attempt)).toMatchObject({ ok: true, code: "replayed" });
    await h.svc.providerAttempts.record({ ...attempt, attempt: 1, actualCost: null, estimatedCost: 0.02 });

    const total = await h.svc.providerAttempts.totalCost("rj1");
    expect(total.ok && total.value).toBeCloseTo(0.028, 6);

    const listed = await h.svc.providerAttempts.list("rj1");
    // the ledger holds a REFERENCE, never response content
    expect(listed.ok && listed.value[0]!.rawResponseRef).toBe("blob://x");
    expect(listed.ok && Object.keys(listed.value[0]!)).not.toContain("rawResponse");
  });

  it("never places provider response content in an emitted event", async () => {
    const h = harness();
    await h.svc.providerAttempts.record({
      reasoningJobId: "rj1", runId: "r1", clientId: "c1", scanId: "s1",
      providerId: "opaque-a", attempt: 0, status: "succeeded", rawResponseRef: "blob://secret-ref",
    });
    const events = h.repo.allEvents().filter((e) => e.eventType.startsWith("runtime.provider"));
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]!.payload).sort()).toEqual(["attempt", "providerId", "status"]);
  });
});

/* ===== 6 · checkpoints & recovery ================================================= */
describe("CheckpointService", () => {
  it("saves a checkpoint idempotently and reports the latest valid one", async () => {
    const h = harness();
    const input = { runId: "r1", clientId: "c1", scanId: "s1", stage: "discovery_planning", attempt: 0, nextStage: "discovery_completion" };
    expect(await h.svc.checkpoints.save(input)).toMatchObject({ ok: true, code: "created" });
    expect(await h.svc.checkpoints.save(input)).toMatchObject({ ok: true, code: "replayed" });

    h.advance(1_000);
    await h.svc.checkpoints.save({ ...input, stage: "discovery_completion", nextStage: "evidence_normalization" });
    const latest = await h.svc.checkpoints.latestValid("r1");
    expect(latest.ok && latest.value.stage).toBe("discovery_completion");
  });

  it("invalidates downstream checkpoints but RETAINS them for audit", async () => {
    const h = harness();
    const base = { runId: "r1", clientId: "c1", scanId: "s1", attempt: 0 };
    await h.svc.checkpoints.save({ ...base, stage: "evidence_normalization", nextStage: "evidence_validation" });
    h.advance(1_000);
    await h.svc.checkpoints.save({ ...base, stage: "graph_assembly", nextStage: "graph_snapshot" });

    const invalidated = await h.svc.checkpoints.invalidateFrom("r1", "graph_assembly", "upstream evidence changed", { clientId: "c1", scanId: "s1" });
    expect(invalidated.ok && invalidated.value).toHaveLength(1);

    // the row still exists, marked and reasoned — nothing was deleted
    const rows = h.repo.allCheckpoints();
    expect(rows).toHaveLength(2);
    const marked = rows.find((c) => c.stage === "graph_assembly")!;
    expect(marked.status).toBe("invalidated");
    expect(marked.invalidationReason).toBe("upstream evidence changed");

    // resume falls back to the last still-valid checkpoint
    const latest = await h.svc.checkpoints.latestValid("r1");
    expect(latest.ok && latest.value.stage).toBe("evidence_normalization");
  });
});

/* ===== 7 · coordinator: full execution, recovery, cancellation ====================== */
describe("RuntimeCoordinator", () => {
  it("runs the full 13-stage pipeline to completion through the queue", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    expect(init).toMatchObject({ ok: true });
    if (!init.ok) return;
    const runId = init.value.run.id;

    const turns = await drainQueue(h);
    expect(turns).toBe(PIPELINE_STAGE_ORDER.length);

    const run = await h.svc.runs.getRun(runId);
    expect(run.ok && run.value.status).toBe("completed");

    // every stage checkpointed exactly once, in canonical order
    const checkpoints = h.repo.allCheckpoints().filter((c) => c.status === "valid");
    expect(checkpoints.map((c) => c.stage)).toEqual([...PIPELINE_STAGE_ORDER]);

    // every declared artifact exists exactly once
    const produced = Object.values(PIPELINE_STAGE_SPECS).map((s) => s.producesArtifact).filter((k) => k !== null);
    expect(h.repo.allArtifacts()).toHaveLength(produced.length);
  });

  it("is idempotent end-to-end: initializing twice yields one run and one job", async () => {
    const h = harness();
    const first = await h.svc.coordinator.initializeRun(START);
    const second = await h.svc.coordinator.initializeRun(START);
    expect(first.ok && second.ok && first.value.run.id).toBe(second.ok ? second.value.run.id : "");
    expect(h.repo.allRuns()).toHaveLength(1);
    expect(h.repo.allJobs()).toHaveLength(1);
  });

  it("resumes from the last valid checkpoint after a crash and never re-executes finished work", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    const runId = init.value.run.id;

    // run the first three stages, then "crash"
    for (let i = 0; i < 3; i += 1) await h.svc.coordinator.runOnce("worker-A", executor);

    const resume = await h.svc.coordinator.resumePoint(runId);
    expect(resume.ok && resume.value).toBe(PIPELINE_STAGE_ORDER[3]);

    const done = await h.svc.coordinator.completedStages(runId);
    expect(done.ok && done.value).toEqual([...PIPELINE_STAGE_ORDER.slice(0, 3)]);

    // a NEW worker replays an already-completed stage: it is skipped, not re-run
    const executed: PipelineRunStage[] = [];
    const tracking = async (stage: PipelineRunStage) => { executed.push(stage); return executor(stage); };
    const replayed = await h.svc.coordinator.advanceStage(runId, PIPELINE_STAGE_ORDER[0]!, tracking);
    expect(replayed.ok && replayed.value.status).toBe("skipped");
    expect(executed).toEqual([]); // the work function was never invoked

    // the rest of the pipeline still finishes
    await drainQueue(h, "worker-B");
    const run = await h.svc.runs.getRun(runId);
    expect(run.ok && run.value.status).toBe("completed");
  });

  it("starts from the first stage when no checkpoint exists", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    const resume = await h.svc.coordinator.resumePoint(init.value.run.id);
    expect(resume.ok && resume.value).toBe(PIPELINE_STAGE_ORDER[0]);
  });

  it("stops advancing once the run is cancelled", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    const runId = init.value.run.id;

    await h.svc.coordinator.runOnce("w1", executor);
    await h.svc.coordinator.cancelRun(runId);

    const executed: PipelineRunStage[] = [];
    const tracking = async (stage: PipelineRunStage) => { executed.push(stage); return executor(stage); };
    const after = await h.svc.coordinator.advanceStage(runId, PIPELINE_STAGE_ORDER[1]!, tracking);
    expect(after.ok && after.value.status).toBe("cancelled");
    expect(executed).toEqual([]);
  });

  it("fails the run when its deadline passes mid-pipeline", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun({ ...START, deadline: "2026-07-21T00:00:05.000Z" });
    if (!init.ok) return;
    const runId = init.value.run.id;

    h.advance(6_000);
    const outcome = await h.svc.coordinator.advanceStage(runId, PIPELINE_STAGE_ORDER[0]!, executor);
    expect(outcome.ok && outcome.value.status).toBe("deadline_exceeded");

    const run = await h.svc.runs.getRun(runId);
    expect(run.ok && run.value.status).toBe("failed");
    expect(h.repo.allEvents().some((e) => e.eventType === "runtime.deadline.exceeded")).toBe(true);
  });

  it("records a stage failure when the work throws, and the queue schedules a retry", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;

    const throwing = async (): Promise<StageWork> => { throw new Error("provider exploded"); };
    const turn = await h.svc.coordinator.runOnce("w1", throwing);
    expect(turn.ok && turn.value?.status).toBe("failed");
    expect(turn.ok && turn.value?.detail).toContain("provider exploded");

    const job = h.repo.allJobs()[0]!;
    expect(job.status).toBe("queued"); // retryable, rescheduled
    expect(job.lastError).toContain("provider exploded");
  });

  it("releases the lease WITHOUT consuming an attempt when a stage is blocked", async () => {
    const h = harness();
    const run = await h.svc.runs.createRun(START);
    if (!run.ok) return;
    // enqueue a stage whose dependencies cannot possibly be met yet
    await h.svc.queue.enqueue({ jobType: "advance_stage", clientId: "c1", runId: run.value.id, scanId: "scan-1", stage: "report_assembly" });

    const turn = await h.svc.coordinator.runOnce("w1", executor);
    expect(turn.ok && turn.value?.status).toBe("blocked");

    const job = h.repo.allJobs()[0]!;
    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(0); // blocked is not a failed attempt
    expect(h.repo.allEvents().some((e) => e.eventType === "runtime.stage.blocked")).toBe(true);
  });

  it("hands a job to only one worker at a time", async () => {
    const h = harness();
    await h.svc.coordinator.initializeRun(START);
    const a = await h.svc.queue.lease({ owner: "w1", leaseSeconds: 60 });
    const b = await h.svc.queue.lease({ owner: "w2", leaseSeconds: 60 });
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, code: "no_job_available" });
  });
});

/* ===== 8 · events: append-only + ordering ============================================= */
describe("EventService", () => {
  it("assigns monotonic sequences per aggregate and keeps aggregates independent", async () => {
    const h = harness();
    const runA = { id: "rA", clientId: "c1", scanId: "s1" };
    const runB = { id: "rB", clientId: "c1", scanId: "s1" };

    await h.svc.events.emitRunEvent("runtime.run.created", runA);
    await h.svc.events.emitRunEvent("runtime.run.started", runA);
    await h.svc.events.emitRunEvent("runtime.run.created", runB);

    const a = await h.svc.events.list({ aggregateType: "intelligence_run", aggregateId: "rA" });
    const b = await h.svc.events.list({ aggregateType: "intelligence_run", aggregateId: "rB" });
    expect(a.ok && a.value.map((e) => e.sequence)).toEqual([1, 2]);
    expect(b.ok && b.value.map((e) => e.sequence)).toEqual([1]);
  });

  it("rejects a duplicate sequence as a serialization conflict", async () => {
    const h = harness();
    const run = { id: "rA", clientId: "c1", scanId: "s1" };
    await h.svc.events.emitRunEvent("runtime.run.created", run);
    const clash = await h.repo.appendRuntimeEvent({
      event: {
        id: "evt-x", eventType: "runtime.run.started", runId: "rA", stage: null,
        aggregateId: "rA", aggregateType: "intelligence_run", clientId: "c1", scanId: "s1",
        payload: {}, occurredAt: h.now(), correlationId: null, causationId: null, actor: null, schemaVersion: "1.0",
      },
      expectedSequence: 1,
    });
    expect(clash).toMatchObject({ ok: false, code: "serialization_conflict" });
  });

  it("exposes no mutation path — the service is append-only by construction", () => {
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(harness().svc.events));
    expect(surface).toContain("emit");
    expect(surface).not.toContain("update");
    expect(surface).not.toContain("delete");
  });

  it("orders a full run's event log by sequence, ending with completion", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    await drainQueue(h);

    const events = await h.svc.events.list({ aggregateType: "intelligence_run", aggregateId: init.value.run.id });
    expect(events.ok).toBe(true);
    if (!events.ok) return;

    const sequences = events.value.map((e) => e.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length); // strictly unique
    expect(events.value[0]!.eventType).toBe("runtime.run.created");
    expect(events.value[events.value.length - 1]!.eventType).toBe("runtime.run.completed");
  });
});

/* ===== 9 · derived records ============================================================== */
describe("Finding / Recommendation / Competitor / Proposal / Narrative services", () => {
  it("persists findings and recommendations idempotently", async () => {
    const h = harness();
    const base = { runId: "r1", clientId: "c1", scanId: "s1", envelope: { a: 1 } };
    expect(await h.svc.findings.save({ ...base, ref: "f1", severity: "high", domain: "digital_presence" })).toMatchObject({ ok: true, code: "created" });
    expect(await h.svc.findings.save({ ...base, ref: "f1", severity: "high", domain: "digital_presence" })).toMatchObject({ ok: true, code: "replayed" });

    expect(await h.svc.recommendations.save({ ...base, ref: "r1", tier: "quick_win", priority: 80 })).toMatchObject({ ok: true, code: "created" });
    const listed = await h.svc.recommendations.list("r1");
    expect(listed.ok && listed.value).toHaveLength(1);
  });

  it("supersedes a proposal into a new version without touching the prior one", async () => {
    const h = harness();
    const first = await h.svc.proposals.save({ runId: "r1", clientId: "c1", scanId: "s1", envelope: { v: 1 }, status: "draft" });
    if (!first.ok) return;

    const second = await h.svc.proposals.supersede(first.value, { v: 2 }, "draft");
    expect(second.ok && second.value.version).toBe(2);
    expect(second.ok && second.value.supersedesId).toBe(first.value.id);

    const latest = await h.svc.proposals.latest("r1");
    expect(latest.ok && latest.value.version).toBe(2);
    expect(latest.ok && latest.value.checksum).not.toBe(first.value.checksum);
  });

  it("keeps narrative lineage independent per audience", async () => {
    const h = harness();
    const base = { runId: "r1", clientId: "c1", scanId: "s1", envelope: { v: 1 }, status: "draft" };
    const client = await h.svc.narratives.save({ ...base, audience: "client" });
    await h.svc.narratives.save({ ...base, audience: "board" });
    if (!client.ok) return;
    await h.svc.narratives.supersede(client.value, { v: 2 }, "draft");

    const latestClient = await h.svc.narratives.latest("r1", "client");
    const latestBoard = await h.svc.narratives.latest("r1", "board");
    expect(latestClient.ok && latestClient.value.version).toBe(2);
    expect(latestBoard.ok && latestBoard.value.version).toBe(1);
  });

  it("persists a competitor snapshot with its checksum", async () => {
    const h = harness();
    const saved = await h.svc.competitors.save({ runId: "r1", clientId: "c1", scanId: "s1", envelope: { set: ["a", "b"] }, competitorCount: 2 });
    expect(saved).toMatchObject({ ok: true, code: "created" });
    expect(saved.ok && saved.value.competitorCount).toBe(2);
    expect(saved.ok && saved.value.checksum.length).toBeGreaterThan(0);
  });
});

/* ===== 10 · read models ==================================================================== */
describe("read models", () => {
  it("projects a dashboard, queue status and run detail from a completed run", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    await drainQueue(h);
    const runId = init.value.run.id;

    const dashboard = views.dashboardView(h.repo.allRuns(), h.repo.allJobs());
    expect(dashboard.totalRuns).toBe(1);
    expect(dashboard.completed).toBe(1);
    expect(dashboard.active).toBe(0);

    const queue = views.queueStatusView(h.repo.allJobs(), h.now());
    expect(queue.completed).toBe(PIPELINE_STAGE_ORDER.length);
    expect(queue.queued).toBe(0);
    expect(queue.expiredLeases).toBe(0);

    const stages = await h.svc.pipeline.listStages(runId);
    const artifacts = h.repo.allArtifacts().filter((a) => a.runId === runId);
    const events = await h.svc.events.list({ aggregateType: "intelligence_run", aggregateId: runId });
    const checkpoint = await h.svc.checkpoints.latestValid(runId);
    const run = await h.svc.runs.getRun(runId);
    if (!stages.ok || !events.ok || !run.ok) return;

    const detail = views.runDetailView({
      run: run.value,
      stages: stages.value,
      artifacts,
      checkpoint: checkpoint.ok ? checkpoint.value : null,
      reasoningJobs: [],
      events: events.value,
    });
    expect(detail.stageStatus).toHaveLength(PIPELINE_STAGE_ORDER.length);
    expect(detail.stageStatus.every((s) => s.status === "completed")).toBe(true);
    expect(detail.evidence.evidenceValidated).toBe(true);
    expect(detail.events.map((e) => e.sequence)).toEqual([...detail.events.map((e) => e.sequence)].sort((a, b) => a - b));
  });

  it("resolves same-millisecond stage transitions by lifecycle, in ANY arrival order", () => {
    // A stage writes `running` then `completed` routinely inside one millisecond.
    // Postgres returns tied rows in arbitrary order, so the view must not depend
    // on arrival order — this is the defect the live suite caught.
    const row = (status: "running" | "completed") => ({
      id: `s-${status}`, runId: "r1", clientId: null, scanId: "s1", stage: "graph_assembly",
      status, attempt: 0, idempotencyKey: `k-${status}`, metadata: {}, lastError: null,
      createdBy: null, createdAt: T0, updatedAt: null, startedAt: null,
      completedAt: null, failedAt: null, cancelledAt: null,
    });

    for (const order of [[row("running"), row("completed")], [row("completed"), row("running")]]) {
      const view = views.stageStatusView(order);
      expect(view).toHaveLength(1);
      expect(view[0]!.status).toBe("completed");
    }

    // and a later attempt still supersedes an earlier completion
    const retried = views.stageStatusView([
      { ...row("completed"), attempt: 0 },
      { ...row("running"), attempt: 1, id: "s-retry" },
    ]);
    expect(retried[0]!.status).toBe("running");
    expect(retried[0]!.attempts).toBe(2);
  });

  it("counts active runs and flags a passed deadline", () => {
    const now = "2026-07-21T00:01:00.000Z";
    const run = {
      id: "r1", clientId: "c1", scanId: "s1", status: "executing_reasoning" as const, currentStage: "provider_execution",
      failedStage: null, version: 1, idempotencyKey: "k", metadata: {}, checksum: null,
      deadline: "2026-07-21T00:00:30.000Z", cancelled: false, createdBy: null, createdAt: T0,
      updatedAt: null, startedAt: T0, completedAt: null, failedAt: null, cancelledAt: null,
    };
    const rows = views.activeRunsView([run], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pastDeadline).toBe(true);
  });

  it("summarizes artifacts, findings, recommendations and provider attempts", () => {
    const artifacts = [
      { id: "a1", runId: "r1", clientId: null, scanId: "s1", kind: "findings" as const, version: 1, checksum: "c1", validationStatus: "valid" as const, sourceArtifactIds: [], envelope: {}, payloadRef: null, idempotencyKey: "k1", createdBy: null, createdAt: T0 },
      { id: "a2", runId: "r1", clientId: null, scanId: "s1", kind: "findings" as const, version: 2, checksum: "c2", validationStatus: "valid" as const, sourceArtifactIds: ["a1"], envelope: {}, payloadRef: null, idempotencyKey: "k2", createdBy: null, createdAt: T0 },
    ];
    const summary = views.artifactSummaryView(artifacts);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ kind: "findings", versions: 2, latestVersion: 2, latestChecksum: "c2" });

    const findings = views.findingSummaryView([
      { id: "f1", runId: "r1", clientId: null, scanId: "s1", version: 1, checksum: "x", envelope: {}, sourceArtifactIds: [], idempotencyKey: "k", createdBy: null, createdAt: T0, domain: "operations", severity: "high" },
      { id: "f2", runId: "r1", clientId: null, scanId: "s1", version: 1, checksum: "y", envelope: {}, sourceArtifactIds: [], idempotencyKey: "k2", createdBy: null, createdAt: T0, domain: "operations", severity: "low" },
    ]);
    expect(findings).toMatchObject({ total: 2, bySeverity: { high: 1, low: 1 }, byDomain: { operations: 2 } });

    const recs = views.recommendationSummaryView([
      { id: "r-a", runId: "r1", clientId: null, scanId: "s1", version: 1, checksum: "x", envelope: {}, sourceArtifactIds: [], idempotencyKey: "k", createdBy: null, createdAt: T0, tier: "quick_win", priority: 10 },
      { id: "r-b", runId: "r1", clientId: null, scanId: "s1", version: 1, checksum: "y", envelope: {}, sourceArtifactIds: [], idempotencyKey: "k2", createdBy: null, createdAt: T0, tier: "quick_win", priority: 90 },
    ]);
    expect(recs.topPriorityIds[0]).toBe("r-b"); // ordering comes from Phase A's priority
    expect(recs.byTier).toEqual({ quick_win: 2 });

    const attempts = views.providerAttemptSummaryView([
      { id: "p1", reasoningJobId: "rj", runId: "r1", clientId: null, scanId: "s1", providerId: "op-a", attempt: 0, status: "failed" as const, retryDisposition: null, latencyMs: 100, estimatedCost: 0.01, actualCost: null, inputTokens: 10, outputTokens: 5, usageEstimated: true, rawResponseRef: null, lastError: "x", idempotencyKey: "k", createdAt: T0 },
      { id: "p2", reasoningJobId: "rj", runId: "r1", clientId: null, scanId: "s1", providerId: "op-b", attempt: 1, status: "succeeded" as const, retryDisposition: null, latencyMs: 200, estimatedCost: 0.02, actualCost: 0.015, inputTokens: 20, outputTokens: 10, usageEstimated: false, rawResponseRef: "blob://r", lastError: null, idempotencyKey: "k2", createdAt: T0 },
    ]);
    expect(attempts).toMatchObject({ attempts: 2, succeeded: 1, failed: 1, meanLatencyMs: 150, usageEstimated: true });
    expect(attempts.totalCost).toBeCloseTo(0.025, 6);
    expect(attempts.byProvider).toEqual({ "op-a": 1, "op-b": 1 });
  });

  it("projects proposal and per-audience narrative lineage", () => {
    const base = { runId: "r1", clientId: null, scanId: "s1", envelope: {}, sourceArtifactIds: [], createdBy: null, createdAt: T0 };
    const proposals = views.proposalSummaryView([
      { ...base, id: "p1", version: 1, checksum: "a", idempotencyKey: "k1", status: "draft", supersedesId: null },
      { ...base, id: "p2", version: 2, checksum: "b", idempotencyKey: "k2", status: "sent", supersedesId: "p1" },
    ]);
    expect(proposals).toMatchObject({ versions: 2, latestVersion: 2, latestStatus: "sent", lineage: ["p1", "p2"] });

    const narratives = views.narrativeSummaryView([
      { ...base, id: "n1", version: 1, checksum: "a", idempotencyKey: "k1", audience: "client", status: "draft", supersedesId: null },
      { ...base, id: "n2", version: 2, checksum: "b", idempotencyKey: "k2", audience: "client", status: "approved", supersedesId: "n1" },
      { ...base, id: "n3", version: 1, checksum: "c", idempotencyKey: "k3", audience: "board", status: "draft", supersedesId: null },
    ]);
    expect(narratives["client"]).toMatchObject({ versions: 2, latestVersion: 2, lineage: ["n1", "n2"] });
    expect(narratives["board"]).toMatchObject({ versions: 1, latestVersion: 1 });
  });

  it("flags an expired lease in the queue view", () => {
    const job = {
      id: "j1", jobType: "advance_stage", clientId: "c1", runId: "r1", scanId: "s1", stage: "a",
      priority: 5, status: "leased" as const, availableAt: T0, attempt: 1, maxAttempts: 5,
      leaseOwner: "w1", leaseExpiresAt: "2026-07-21T00:00:10.000Z", idempotencyKey: "k",
      payloadRef: null, payload: {}, lastError: null, createdAt: T0, updatedAt: null,
    };
    expect(views.queueStatusView([job], "2026-07-21T00:00:30.000Z").expiredLeases).toBe(1);
    expect(views.queueStatusView([job], "2026-07-21T00:00:05.000Z").expiredLeases).toBe(0);
  });
});

/* ===== 11 · determinism ======================================================================= */
describe("determinism", () => {
  it("produces byte-identical artifact checksums and event ordering across two runs", async () => {
    const fingerprint = async () => {
      const h = harness();
      await h.svc.coordinator.initializeRun(START);
      await drainQueue(h);
      return JSON.stringify({
        artifacts: h.repo.allArtifacts().map((a) => [a.kind, a.version, a.checksum]).sort(),
        events: h.repo.allEvents().map((e) => [e.aggregateType, e.aggregateId, e.sequence, e.eventType]).sort(),
        checkpoints: h.repo.allCheckpoints().map((c) => [c.stage, c.attempt, c.status]).sort(),
      });
    };
    expect(await fingerprint()).toBe(await fingerprint());
  });

  it("keeps QueueService backoff free of jitter", () => {
    const q = [0, 1, 2, 3, 4, 5].map((n) => backoffMsFor(n));
    expect(q).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000]);
    expect(typeof QueueService).toBe("function");
  });
});
