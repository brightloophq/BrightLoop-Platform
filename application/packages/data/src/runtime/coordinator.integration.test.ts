/* =============================================================================
 * RuntimeCoordinator over the REAL adapter — LIVE integration (Sprint 13C).
 *
 * The deterministic suite in @brightloop/domain proves the services against the
 * in-memory double. This proves the same services against actual Postgres:
 * real RLS, the real `FOR UPDATE SKIP LOCKED` lease RPC, real unique indexes.
 *
 * That distinction matters. A double can only ever confirm it agrees with
 * itself; only this file can catch a service that depends on behaviour the
 * database does not actually provide.
 *
 * Runs only where an ephemeral Supabase is up (CI db-verify).
 * ========================================================================== */

import { createHmac, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
import type { PipelineRunStage, RuntimeArtifactKind } from "@brightloop/schema";
import {
  createRuntimeServices,
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_SPECS,
  runtimeReadModels,
  type RuntimeServices,
  type StageWork,
} from "@brightloop/domain";
import { SupabaseRuntimeRepository } from "./adapter.js";

const URL = process.env["SUPABASE_TEST_URL"];
const SERVICE_KEY = process.env["SUPABASE_TEST_SERVICE_KEY"];
const ANON_KEY = process.env["SUPABASE_TEST_ANON_KEY"];
const JWT_SECRET = process.env["SUPABASE_TEST_JWT_SECRET"];
const LIVE = Boolean(URL && SERVICE_KEY && ANON_KEY && JWT_SECRET);

function signJwt(claims: Record<string, unknown>, secret: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, ...claims });
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const uid = () => `t_${randomUUID().slice(0, 8)}`;

/** Produces exactly the artifact each stage's Phase-A spec declares. */
const executor = async (stage: PipelineRunStage): Promise<StageWork> => {
  const kind = PIPELINE_STAGE_SPECS[stage].producesArtifact;
  return kind === null
    ? { envelope: null, kind: null }
    : { envelope: { stage, produced: kind }, kind: kind as RuntimeArtifactKind };
};

describe.skipIf(!LIVE)("RuntimeCoordinator over Supabase (live DB)", () => {
  let service: SupabaseClient<Database>;
  let svc: RuntimeServices;
  let repo: SupabaseRuntimeRepository;
  let clientId: string;

  beforeAll(async () => {
    service = createClient<Database>(URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    clientId = uid();
    await service.from("clients").insert([{ id: clientId, company: `Org ${clientId}` }]);

    const token = signJwt({ sub: uid(), app_metadata: { role: "owner" } }, JWT_SECRET!);
    const authed = createClient<Database>(URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    repo = new SupabaseRuntimeRepository(authed);
    svc = createRuntimeServices({ repo, ids: (p) => `${p}_${randomUUID().slice(0, 12)}` });
  });

  /** Drive a run to completion through the real queue. */
  async function drain(owner: string, maxTurns = 40): Promise<number> {
    let turns = 0;
    for (let i = 0; i < maxTurns; i += 1) {
      const turn = await svc.coordinator.runOnce(owner, executor);
      expect(turn.ok).toBe(true);
      if (!turn.ok || turn.value === null) break;
      turns += 1;
    }
    return turns;
  }

  it("executes the full 13-stage pipeline end-to-end against real Postgres", async () => {
    const scanId = uid();
    const init = await svc.coordinator.initializeRun({ clientId, scanId });
    expect(init).toMatchObject({ ok: true });
    if (!init.ok) return;
    const runId = init.value.run.id;

    const turns = await drain(`worker-${uid()}`);
    expect(turns).toBe(PIPELINE_STAGE_ORDER.length);

    const run = await svc.runs.getRun(runId);
    expect(run.ok && run.value.status).toBe("completed");

    // every declared artifact landed, with a checksum
    const produced = Object.values(PIPELINE_STAGE_SPECS).map((s) => s.producesArtifact).filter((k) => k !== null);
    for (const kind of produced) {
      const listed = await svc.artifacts.listByKind(runId, kind as RuntimeArtifactKind);
      expect(listed.ok && listed.value.length).toBeGreaterThanOrEqual(1);
      expect(listed.ok && listed.value[0]!.checksum.length).toBeGreaterThan(0);
    }

    // the event log is gap-free and ends with completion — ordered by the DB
    const events = await svc.events.list({ aggregateType: "intelligence_run", aggregateId: runId });
    expect(events.ok).toBe(true);
    if (!events.ok) return;
    const sequences = events.value.map((e) => e.sequence);
    expect(sequences).toEqual([...Array(sequences.length)].map((_, i) => i + 1));
    expect(events.value[events.value.length - 1]!.eventType).toBe("runtime.run.completed");
  });

  it("is idempotent: re-initializing the same scan reuses the run and the job", async () => {
    const scanId = uid();
    const first = await svc.coordinator.initializeRun({ clientId, scanId });
    const second = await svc.coordinator.initializeRun({ clientId, scanId });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.run.id).toBe(first.value.run.id);
    expect(second.value.job.id).toBe(first.value.job.id);
  });

  it("resumes from the last real checkpoint and skips completed stages", async () => {
    const scanId = uid();
    const init = await svc.coordinator.initializeRun({ clientId, scanId });
    if (!init.ok) return;
    const runId = init.value.run.id;

    // three turns, then simulate a process restart by using a fresh worker id
    for (let i = 0; i < 3; i += 1) await svc.coordinator.runOnce(`worker-a-${uid()}`, executor);

    const resume = await svc.coordinator.resumePoint(runId);
    expect(resume.ok && resume.value).toBe(PIPELINE_STAGE_ORDER[3]);

    // replaying stage 0 must NOT run the work again
    let invoked = 0;
    const tracking = async (stage: PipelineRunStage) => { invoked += 1; return executor(stage); };
    const replay = await svc.coordinator.advanceStage(runId, PIPELINE_STAGE_ORDER[0]!, tracking);
    expect(replay.ok && replay.value.status).toBe("skipped");
    expect(invoked).toBe(0);

    await drain(`worker-b-${uid()}`);
    const run = await svc.runs.getRun(runId);
    expect(run.ok && run.value.status).toBe("completed");
  });

  it("never lets two concurrent workers take the same job (real SKIP LOCKED)", async () => {
    const scanId = uid();
    const init = await svc.coordinator.initializeRun({ clientId, scanId });
    expect(init.ok).toBe(true);

    const owners = ["c1", "c2", "c3", "c4", "c5"].map((o) => `${o}-${uid()}`);
    const results = await Promise.all(
      owners.map((owner) => svc.queue.lease({ owner, leaseSeconds: 60, jobType: "advance_stage" })),
    );
    const leased = results.filter((r) => r.ok);
    const empty = results.filter((r) => !r.ok && r.code === "no_job_available");
    expect(leased).toHaveLength(1);
    expect(empty).toHaveLength(4);
  });

  it("refuses an artifact rewrite at the same version (immutability, enforced by the DB)", async () => {
    const scanId = uid();
    const init = await svc.coordinator.initializeRun({ clientId, scanId });
    if (!init.ok) return;
    const runId = init.value.run.id;
    const base = { runId, clientId, scanId, kind: "findings" as const };

    expect(await svc.artifacts.persist({ ...base, envelope: { a: 1 } })).toMatchObject({ ok: true, code: "created" });
    expect(await svc.artifacts.persist({ ...base, envelope: { a: 1 } })).toMatchObject({ ok: true, code: "replayed" });
    expect(await svc.artifacts.persist({ ...base, envelope: { a: 2 } })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("cancels a run and stops the pipeline advancing", async () => {
    const scanId = uid();
    const init = await svc.coordinator.initializeRun({ clientId, scanId });
    if (!init.ok) return;
    const runId = init.value.run.id;

    await svc.coordinator.runOnce(`worker-${uid()}`, executor);
    expect(await svc.coordinator.cancelRun(runId)).toMatchObject({ ok: true });

    let invoked = 0;
    const tracking = async (stage: PipelineRunStage) => { invoked += 1; return executor(stage); };
    const after = await svc.coordinator.advanceStage(runId, PIPELINE_STAGE_ORDER[1]!, tracking);
    expect(after.ok && after.value.status).toBe("cancelled");
    expect(invoked).toBe(0);
  });

  it("projects read models from real rows", async () => {
    const scanId = uid();
    const init = await svc.coordinator.initializeRun({ clientId, scanId });
    if (!init.ok) return;
    const runId = init.value.run.id;
    await drain(`worker-${uid()}`);

    const stages = await svc.pipeline.listStages(runId);
    const events = await svc.events.list({ aggregateType: "intelligence_run", aggregateId: runId });
    const run = await svc.runs.getRun(runId);
    const checkpoint = await svc.checkpoints.latestValid(runId);
    if (!stages.ok || !events.ok || !run.ok) return;

    const artifacts = [];
    for (const spec of Object.values(PIPELINE_STAGE_SPECS)) {
      if (spec.producesArtifact === null) continue;
      const listed = await svc.artifacts.listByKind(runId, spec.producesArtifact as RuntimeArtifactKind);
      if (listed.ok) artifacts.push(...listed.value);
    }

    const detail = runtimeReadModels.runDetailView({
      run: run.value,
      stages: stages.value,
      artifacts,
      checkpoint: checkpoint.ok ? checkpoint.value : null,
      reasoningJobs: [],
      events: events.value,
    });

    expect(detail.run.status).toBe("completed");
    expect(detail.stageStatus).toHaveLength(PIPELINE_STAGE_ORDER.length);
    expect(detail.stageStatus.every((s) => s.status === "completed")).toBe(true);
    expect(detail.evidence.evidenceValidated).toBe(true);
    expect(detail.events.length).toBeGreaterThan(0);
  });
});
