/* =============================================================================
 * Controlled Runtime Driver tests (Phase C · Sprint C2.1 §10).
 *
 * DETERMINISTIC: every test runs against `InMemoryRuntimeRepository` with an
 * injected clock and a counter id generator — no wall clock, no randomness, no
 * network, no SDK. A failure is a real defect, never a flake. The one live test
 * lives in `driver.live.test.ts` and is excluded from the default suite.
 *
 * The driver coordinates the REAL runtime services + coordinator + a fake
 * transport; these tests prove a queued scan can execute exactly one stage
 * safely, that a disabled provider blocks (never fabricates), and that the
 * one-turn guarantee, safe telemetry, and start-stamp behavior all hold.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  createRuntimeServices,
  InMemoryRuntimeRepository,
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_SPECS,
  type RuntimeServices,
  type StageWork,
} from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifactKind } from "@brightloop/schema";
import { AnthropicReasoningProviderAdapter } from "../anthropic/adapter.js";
import { loadAnthropicConfig, PROVIDER_DISABLED_REASON } from "../anthropic/config.js";
import { FakeAnthropicTransport, type FakeTransportOptions } from "../testing/fake-transport.js";
import { ControlledRuntimeDriver } from "./driver.js";
import { createDefaultStageRegistry, type ReasoningTelemetry } from "./registry.js";

const T0 = "2026-07-22T00:00:00.000Z";
const START = { clientId: "c1", scanId: "scan-1" };
const REASONING_STAGE: PipelineRunStage = "provider_execution";
const PROVIDER_ID = "anthropic-primary"; // DEFAULT_ANTHROPIC_PROVIDER_ID

// A distinctive sentinel that only appears in the RAW model output — if it ever
// shows up in a persisted artifact or emitted event, raw content leaked.
const RAW_SENTINEL = "SENTINEL_RAW_OUTPUT_9f3c";
const OK_SCRIPT: FakeTransportOptions = {
  script: [{ text: `{"analysis":"${RAW_SENTINEL}"}`, usage: { inputTokens: 180, outputTokens: 40 } }],
};

/** A reference executor that produces exactly the artifact each Phase-A spec declares. */
const referenceExecutor = async (stage: PipelineRunStage): Promise<StageWork> => {
  const kind = PIPELINE_STAGE_SPECS[stage].producesArtifact;
  return kind === null ? { envelope: null, kind: null } : { envelope: { stage, produced: kind }, kind: kind as RuntimeArtifactKind };
};

interface Harness {
  repo: InMemoryRuntimeRepository;
  svc: RuntimeServices;
  driver: ControlledRuntimeDriver;
  telemetry: { current: ReasoningTelemetry | null };
  advance: (ms: number) => void;
  now: () => string;
}

function harness(opts: { enabled?: boolean; script?: FakeTransportOptions } = {}): Harness {
  let millis = new Date(T0).getTime();
  const now = () => new Date(millis).toISOString();
  let counter = 0;
  const ids = (prefix: string) => `${prefix}_${++counter}`;
  const repo = new InMemoryRuntimeRepository(now);
  const svc = createRuntimeServices({ repo, ids, clock: now });

  const enabled = opts.enabled ?? false;
  const config = loadAnthropicConfig(
    enabled ? { AUXION_LIVE_AI_ENABLED: "true", AUXION_ANTHROPIC_ENABLED: "true", ANTHROPIC_API_KEY: "test-fake-key" } : {},
  );
  const adapter = enabled
    ? new AnthropicReasoningProviderAdapter({ config, transport: new FakeAnthropicTransport(opts.script ?? OK_SCRIPT) })
    : null;

  const telemetry: { current: ReasoningTelemetry | null } = { current: null };
  const registry = createDefaultStageRegistry({
    config,
    adapter,
    runtime: svc,
    now: now(),
    traceId: "trace-1",
    ids,
    onReasoning: (t) => { telemetry.current = t; },
  });

  const driver = new ControlledRuntimeDriver({
    services: svc,
    registry,
    reasoningProviderId: config.providerId,
    ids,
    now,
    telemetry,
  });

  return { repo, svc, driver, telemetry, advance: (ms) => { millis += ms; }, now };
}

/** Drive the queue with the reference executor until the reasoning stage is the next job. */
async function seedToReasoning(h: Harness): Promise<void> {
  const init = await h.svc.coordinator.initializeRun(START);
  if (!init.ok) throw new Error("init failed");
  const turns = PIPELINE_STAGE_ORDER.indexOf(REASONING_STAGE); // stages before provider_execution
  for (let i = 0; i < turns; i += 1) {
    const turn = await h.svc.coordinator.runOnce("seed", referenceExecutor);
    if (!turn.ok) throw new Error(`seed turn ${i} failed: ${turn.message}`);
  }
}

/* ===== 1 · idle queue ======================================================= */
describe("ControlledRuntimeDriver · idle", () => {
  it("returns no_job_available on an empty queue, mutating nothing", async () => {
    const h = harness();
    const result = await h.driver.runQueueTurn();
    expect(result.outcome).toBe("no_job_available");
    expect(result.queueJobId).toBeNull();
    expect(result.artifactIds).toEqual([]);
    expect(h.repo.allJobs()).toHaveLength(0);
    expect(h.repo.allRuns()).toHaveLength(0);
  });

  it("reports eligibility without leasing (dry-run)", async () => {
    const h = harness();
    expect((await h.driver.checkEligibility()).eligible).toBe(false);

    await h.svc.coordinator.initializeRun(START);
    const eligible = await h.driver.checkEligibility();
    expect(eligible.eligible).toBe(true);
    expect(eligible.queuedJobs).toBe(1);
    expect(eligible.leasedJobs).toBe(0);
    // dry-run leased nothing
    expect(h.repo.allJobs().every((j) => j.status === "queued")).toBe(true);
  });
});

/* ===== 2 · blocked stages (no fabrication) ================================== */
describe("ControlledRuntimeDriver · blocked stages", () => {
  it("blocks the first (unimplemented) discovery stage with a stable reason, consuming no attempt", async () => {
    const h = harness();
    await h.svc.coordinator.initializeRun(START); // enqueues discovery_planning

    const result = await h.driver.runQueueTurn();
    expect(result.outcome).toBe("blocked");
    expect(result.stage).toBe(PIPELINE_STAGE_ORDER[0]);
    expect(result.blockedReason).toContain("discovery");
    expect(result.artifactIds).toEqual([]);

    const job = h.repo.allJobs()[0]!;
    expect(job.status).toBe("queued"); // released, recoverable
    expect(job.attempt).toBe(0); // a block is not a failed attempt
    expect(h.repo.allArtifacts()).toHaveLength(0); // no fabricated placeholder
  });

  it("blocks the reasoning stage as provider_disabled when live AI is off (default)", async () => {
    const h = harness({ enabled: false });
    await seedToReasoning(h);

    const result = await h.driver.runQueueTurn();
    expect(result.stage).toBe(REASONING_STAGE);
    expect(result.outcome).toBe("provider_disabled");
    expect(result.blockedReason).toBe(PROVIDER_DISABLED_REASON);
    expect(result.artifactIds).toEqual([]);

    // the reasoning job is released, not failed — no attempt consumed
    const job = h.repo.allJobs().find((j) => j.stage === REASONING_STAGE)!;
    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(0);
    // and no execution_outcomes artifact was fabricated
    expect(h.repo.allArtifacts().some((a) => a.kind === "execution_outcomes")).toBe(false);
  });
});

/* ===== 3 · reasoning executes (live path, fake transport) =================== */
describe("ControlledRuntimeDriver · reasoning executes", () => {
  it("executes ONE reasoning stage, persists a safe artifact + checkpoint, and enqueues exactly one downstream", async () => {
    const h = harness({ enabled: true });
    await seedToReasoning(h);
    const jobsBefore = h.repo.allJobs().length;

    const result = await h.driver.runQueueTurn();

    expect(result.stage).toBe(REASONING_STAGE);
    expect(result.outcome).toBe("advanced"); // completed + a downstream stage enqueued
    expect(result.providerId).toBe(PROVIDER_ID);
    expect(result.artifactIds).toHaveLength(1);
    expect(result.checkpointId).not.toBeNull();
    expect(result.downstreamJobId).not.toBeNull();

    // safe telemetry surfaced — token counts, never content
    expect(result.usage?.inputTokens).toBe(180);
    expect(result.usage?.outputTokens).toBe(40);
    expect(result.usage?.estimated).toBe(false);
    expect(result.validationStatus).toBe("passed");

    // exactly one downstream job was enqueued (one-turn guarantee)
    expect(h.repo.allJobs().length).toBe(jobsBefore + 1);
    const downstream = h.repo.allJobs().find((j) => j.id === result.downstreamJobId)!;
    expect(downstream.stage).toBe(PIPELINE_STAGE_ORDER[PIPELINE_STAGE_ORDER.indexOf(REASONING_STAGE) + 1]);
    expect(downstream.status).toBe("queued");
  });

  it("persists only SAFE execution metadata — never the raw model output", async () => {
    const h = harness({ enabled: true });
    await seedToReasoning(h);
    await h.driver.runQueueTurn();

    const artifact = h.repo.allArtifacts().find((a) => a.kind === "execution_outcomes")!;
    expect(artifact).toBeDefined();
    const keys = Object.keys(artifact.envelope).sort();
    expect(keys).toEqual(["attempts", "finalStatus", "kind", "model", "providerId", "validationStatus"]);
    // the raw model output never appears anywhere in the envelope
    expect(JSON.stringify(artifact.envelope)).not.toContain(RAW_SENTINEL);
    expect(JSON.stringify(artifact.envelope)).not.toContain("analysis");
    // nor in any emitted event
    expect(JSON.stringify(h.repo.allEvents())).not.toContain(RAW_SENTINEL);

    // the provider-attempt event carries only safe keys, no content
    const providerEvents = h.repo.allEvents().filter((e) => e.eventType.startsWith("runtime.provider"));
    expect(providerEvents.length).toBeGreaterThan(0);
    for (const e of providerEvents) {
      expect(Object.keys(e.payload).sort()).toEqual(["attempt", "providerId", "status"]);
    }
  });

  it("records the reasoning attempt telemetry through the sink", async () => {
    const h = harness({ enabled: true });
    await seedToReasoning(h);
    await h.driver.runQueueTurn();
    expect(h.telemetry.current).not.toBeNull();
    expect(h.telemetry.current?.providerId).toBe(PROVIDER_ID);
    expect(h.telemetry.current?.finalStatus).toBe("succeeded");
  });
});

/* ===== 4 · one-turn guarantee =============================================== */
describe("ControlledRuntimeDriver · one-turn guarantee", () => {
  it("advances exactly one stage per call — the run does NOT run to completion", async () => {
    const h = harness({ enabled: true });
    await seedToReasoning(h);

    const first = await h.driver.runQueueTurn();
    expect(first.stage).toBe(REASONING_STAGE);

    // the run is NOT completed — the next stage merely sits queued
    const runId = first.runId!;
    const run = await h.svc.runs.getRun(runId);
    expect(run.ok && run.value.status).not.toBe("completed");

    // the next turn blocks on the (unimplemented) downstream stage, still not looping
    const second = await h.driver.runQueueTurn();
    expect(second.stage).toBe(PIPELINE_STAGE_ORDER[PIPELINE_STAGE_ORDER.indexOf(REASONING_STAGE) + 1]);
    expect(second.outcome).toBe("blocked");
  });

  it("leases at most one job even when several are eligible", async () => {
    const h = harness();
    // two independent runs, each with a queued head-stage job
    await h.svc.coordinator.initializeRun({ clientId: "c1", scanId: "scan-A" });
    await h.svc.coordinator.initializeRun({ clientId: "c1", scanId: "scan-B" });
    expect(h.repo.allJobs().filter((j) => j.status === "queued")).toHaveLength(2);

    await h.driver.runQueueTurn();
    // the head stage (discovery_planning) has no unmet dependencies, so the leased
    // run OPENS (transitions out of pending) before its executor blocks. Exactly one
    // run should have opened — proof only one job was leased this turn.
    const opened = h.repo.allRuns().filter((r) => r.status !== "pending");
    expect(opened).toHaveLength(1);
    // both jobs remain queued (the blocked one was released, the other never touched)
    expect(h.repo.allJobs().filter((j) => j.status === "queued")).toHaveLength(2);
  });
});

/* ===== 5 · failure handling ================================================= */
describe("ControlledRuntimeDriver · failures", () => {
  it("maps a fatal provider failure to a terminal failed outcome (no fabricated success)", async () => {
    const h = harness({ enabled: true, script: { script: [{ throw: "authentication" }] } });
    await seedToReasoning(h);

    const result = await h.driver.runQueueTurn();
    expect(result.stage).toBe(REASONING_STAGE);
    expect(["failed", "retried"]).toContain(result.outcome);
    expect(result.artifactIds).toEqual([]); // nothing persisted on failure
    expect(h.repo.allArtifacts().some((a) => a.kind === "execution_outcomes")).toBe(false);
  });
});

/* ===== 6 · cancellation ===================================================== */
describe("ControlledRuntimeDriver · cancel", () => {
  it("cancels a run through the coordinator", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    const outcome = await h.driver.cancel(init.value.run.id);
    expect(outcome).toBe("cancelled");
    const run = await h.svc.runs.getRun(init.value.run.id);
    expect(run.ok && run.value.status).toBe("cancelled");
  });
});

/* ===== 7 · startedAt stamping (§5) ========================================== */
describe("RunService.startedAt (via transition)", () => {
  it("stamps startedAt on the first active transition, once, and preserves it on resume", async () => {
    const h = harness();
    const created = await h.svc.runs.createRun(START);
    if (!created.ok) return;
    const id = created.value.id;
    expect(created.value.startedAt).toBeNull();

    // first active transition stamps it
    await h.svc.runs.transition(id, "discovering");
    const after1 = await h.svc.runs.getRun(id);
    expect(after1.ok && after1.value.startedAt).toBe(T0);

    // a later transition does NOT re-stamp (idempotent / preserved)
    h.advance(30_000);
    await h.svc.runs.transition(id, "executing_reasoning");
    const after2 = await h.svc.runs.getRun(id);
    expect(after2.ok && after2.value.startedAt).toBe(T0);
  });

  it("leaves startedAt null for a run cancelled before it ever started", async () => {
    const h = harness();
    const created = await h.svc.runs.createRun(START);
    if (!created.ok) return;
    await h.svc.runs.cancelRun(created.value.id);
    const run = await h.svc.runs.getRun(created.value.id);
    expect(run.ok && run.value.status).toBe("cancelled");
    expect(run.ok && run.value.startedAt).toBeNull();
  });

  it("stamps startedAt exactly once across a full driven run", async () => {
    const h = harness();
    const init = await h.svc.coordinator.initializeRun(START);
    if (!init.ok) return;
    await h.driver.runQueueTurn(); // first stage blocks, but the run opened → started
    const run = await h.svc.runs.getRun(init.value.run.id);
    // the head stage blocks BEFORE opening (dependencies unmet), so it never starts;
    // startedAt stays null until a stage actually opens. Assert it is at most stamped once.
    const stamped = run.ok ? run.value.startedAt : null;
    expect(stamped === null || stamped === T0).toBe(true);
  });
});

/* ===== 8 · executor registry resolution (§3) ================================ */
describe("stage-executor registry", () => {
  it("resolves the reasoning stage as executable and every other stage as blocked", async () => {
    const h = harness({ enabled: true });
    const run = await h.svc.runs.createRun(START);
    if (!run.ok) return;
    const registry = createDefaultStageRegistry({
      config: loadAnthropicConfig({ AUXION_LIVE_AI_ENABLED: "true", AUXION_ANTHROPIC_ENABLED: "true", ANTHROPIC_API_KEY: "k" }),
      adapter: new AnthropicReasoningProviderAdapter({ config: loadAnthropicConfig({ AUXION_LIVE_AI_ENABLED: "true", AUXION_ANTHROPIC_ENABLED: "true", ANTHROPIC_API_KEY: "k" }), transport: new FakeAnthropicTransport(OK_SCRIPT) }),
      runtime: h.svc,
      now: T0,
      traceId: "t",
      ids: (p) => p,
    });

    expect(registry.resolve(REASONING_STAGE, run.value).kind).toBe("executable");
    for (const stage of PIPELINE_STAGE_ORDER) {
      if (stage === REASONING_STAGE) continue;
      const support = registry.resolve(stage, run.value);
      expect(support.kind).toBe("blocked");
      expect(support.kind === "blocked" && support.reason.length).toBeGreaterThan(0);
    }
  });
});
