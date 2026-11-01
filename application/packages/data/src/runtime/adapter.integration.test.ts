/* =============================================================================
 * SupabaseRuntimeRepository — LIVE integration tests (Phase B · Sprint 13B §10).
 *
 * Runs only against an ephemeral Supabase with migrations applied (CI db-verify /
 * `pnpm --filter @brightloop/data test:integration`). Excluded from the default
 * unit run. Verifies the typed round-trip, idempotent replay vs conflict, atomic
 * queue leasing under contention, lease ownership rules, stale-lease recovery,
 * append-only event sequencing, and tenant isolation — all under real RLS.
 * ========================================================================== */

import { createHmac, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
import type { RuntimeQueueJob, RuntimeRun } from "@brightloop/schema";
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
const nowIso = () => new Date().toISOString();

describe.skipIf(!LIVE)("SupabaseRuntimeRepository (live DB)", () => {
  let service: SupabaseClient<Database>;
  let repo: SupabaseRuntimeRepository;
  let clientRepo: SupabaseRuntimeRepository;
  let clientId: string;
  let otherClientId: string;

  /** A run fixture bound to the shared tenant. */
  const runRecord = (over: Partial<RuntimeRun> = {}): RuntimeRun => {
    const id = uid();
    return {
      id, clientId, leadId: null, scanId: uid(), status: "pending", currentStage: null, failedStage: null,
      version: 1, idempotencyKey: `idem_${id}`, metadata: {}, checksum: "chk_1", deadline: null,
      cancelled: false, createdBy: null, createdAt: nowIso(), updatedAt: null, startedAt: null,
      completedAt: null, failedAt: null, cancelledAt: null, ...over,
    };
  };

  const jobRecord = (runId: string, over: Partial<RuntimeQueueJob> = {}): RuntimeQueueJob => {
    const id = uid();
    return {
      id, jobType: "advance_stage", clientId, runId, scanId: uid(), stage: "discovery_planning",
      priority: 5, status: "queued", availableAt: nowIso(), attempt: 0, maxAttempts: 5,
      leaseOwner: null, leaseExpiresAt: null, idempotencyKey: `idem_${id}`, payloadRef: null,
      payload: {}, lastError: null, createdAt: nowIso(), updatedAt: null, ...over,
    };
  };

  async function seedRun(): Promise<RuntimeRun> {
    const record = runRecord();
    const created = await repo.createRun(record);
    expect(created.ok).toBe(true);
    return record;
  }

  beforeAll(async () => {
    service = createClient<Database>(URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    clientId = uid();
    otherClientId = uid();
    await service.from("clients").insert([
      { id: clientId, company: `Org ${clientId}` },
      { id: otherClientId, company: `Org ${otherClientId}` },
    ]);

    const internalToken = signJwt({ sub: uid(), app_metadata: { role: "owner" } }, JWT_SECRET!);
    const internal = createClient<Database>(URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${internalToken}` } }, auth: { persistSession: false },
    });
    repo = new SupabaseRuntimeRepository(internal);

    const clientToken = signJwt({ sub: uid(), app_metadata: { role: "client_admin", client_id: clientId } }, JWT_SECRET!);
    const clientSession = createClient<Database>(URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${clientToken}` } }, auth: { persistSession: false },
    });
    clientRepo = new SupabaseRuntimeRepository(clientSession);
  });

  /* ---- runs --------------------------------------------------------------- */
  it("creates a run, replays an identical write, and conflicts on a changed payload", async () => {
    const record = runRecord();

    const created = await repo.createRun(record);
    expect(created).toMatchObject({ ok: true, code: "created" });

    const replay = await repo.createRun(record);
    expect(replay).toMatchObject({ ok: true, code: "replayed" });
    if (replay.ok) expect(replay.value.id).toBe(record.id);

    // same idempotency key, DIFFERENT canonical payload → conflict, never overwrite
    const conflicting = await repo.createRun({ ...record, id: uid(), checksum: "chk_DIFFERENT" });
    expect(conflicting).toMatchObject({ ok: false, code: "conflict" });

    const fetched = await repo.getRun(record.id);
    expect(fetched.ok && fetched.value.checksum).toBe("chk_1"); // untouched
  });

  it("looks a run up by idempotency key and reports not_found for an unknown id", async () => {
    const record = await seedRun();
    const byKey = await repo.getRunByIdempotencyKey(record.idempotencyKey);
    expect(byKey.ok && byKey.value.id).toBe(record.id);
    expect(await repo.getRun("missing_run")).toMatchObject({ ok: false, code: "not_found" });
  });

  it("updates run status and cancels idempotently, refusing a terminal run", async () => {
    const record = await seedRun();
    const advanced = await repo.updateRunStatus(record.id, "discovering", { currentStage: "discovery_planning", startedAt: nowIso() });
    expect(advanced.ok && advanced.value.status).toBe("discovering");

    const cancelled = await repo.cancelRun(record.id, nowIso());
    expect(cancelled.ok && cancelled.value.cancelled).toBe(true);
    expect(await repo.cancelRun(record.id, nowIso())).toMatchObject({ ok: true, code: "replayed" });

    const done = await seedRun();
    await repo.updateRunStatus(done.id, "completed", { completedAt: nowIso() });
    expect(await repo.cancelRun(done.id, nowIso())).toMatchObject({ ok: false, code: "terminal_state" });
  });

  it("denies a client role (tenant isolation on internal-only tables)", async () => {
    const record = runRecord({ id: uid() });
    const denied = await clientRepo.createRun({ ...record, idempotencyKey: `idem_${uid()}` });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(["permission_denied", "database_error"]).toContain(denied.code);

    const seeded = await seedRun();
    expect(await clientRepo.getRun(seeded.id)).toMatchObject({ ok: false, code: "not_found" });
  });

  /* ---- stages + checkpoints ------------------------------------------------ */
  it("appends stage transitions in order and protects duplicates", async () => {
    const run = await seedRun();
    const stage = (attempt: number) => ({
      id: uid(), runId: run.id, clientId, scanId: run.scanId, stage: "discovery_planning",
      status: "running" as const, attempt, idempotencyKey: `idem_${uid()}`, metadata: {},
      lastError: null, createdBy: null, createdAt: nowIso(), updatedAt: null, startedAt: null,
      completedAt: null, failedAt: null, cancelledAt: null,
    });

    const first = stage(0);
    expect(await repo.appendStageTransition(first)).toMatchObject({ ok: true, code: "created" });
    // same (run, stage, attempt) with a fresh key → the natural key replays it
    expect(await repo.appendStageTransition({ ...first, id: uid(), idempotencyKey: `idem_${uid()}` }))
      .toMatchObject({ ok: true, code: "replayed" });
    expect(await repo.appendStageTransition(stage(1))).toMatchObject({ ok: true, code: "created" });

    const listed = await repo.listStages(run.id);
    expect(listed.ok && listed.value.length).toBe(2);
    const latest = await repo.getLatestStage(run.id);
    expect(latest.ok).toBe(true);
  });

  it("saves checkpoints, finds the latest valid one, and invalidates downstream", async () => {
    const run = await seedRun();
    const checkpoint = (stage: string) => ({
      id: uid(), runId: run.id, clientId, scanId: run.scanId, stage, status: "valid" as const,
      artifactIds: [], sourceChecksums: {}, nextStage: null, attempt: 0,
      invalidationReason: null, idempotencyKey: `idem_${uid()}`, createdAt: nowIso(),
    });

    const cp1 = checkpoint("discovery_planning");
    expect(await repo.saveCheckpoint(cp1)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.saveCheckpoint(cp1)).toMatchObject({ ok: true, code: "replayed" });
    await repo.saveCheckpoint(checkpoint("evidence_validation"));

    const latest = await repo.getLatestValidCheckpoint(run.id);
    expect(latest.ok).toBe(true);

    const invalidated = await repo.invalidateCheckpoints(run.id, "evidence_validation", "upstream artifact changed");
    expect(invalidated.ok && invalidated.value.length).toBe(1);

    // invalidated rows are RETAINED for audit, just no longer "latest valid"
    const after = await repo.getLatestValidCheckpoint(run.id);
    expect(after.ok && after.value.stage).toBe("discovery_planning");
  });

  /* ---- artifacts ----------------------------------------------------------- */
  it("saves artifacts idempotently, conflicts on a changed checksum, and lists by kind", async () => {
    const run = await seedRun();
    const artifact = {
      id: uid(), runId: run.id, clientId, scanId: run.scanId, kind: "evidence_bundle" as const,
      version: 1, checksum: "chk_art", validationStatus: "valid" as const, sourceArtifactIds: [],
      envelope: { note: "envelope only" }, payloadRef: null, idempotencyKey: `idem_${uid()}`,
      createdBy: null, createdAt: nowIso(),
    };

    expect(await repo.saveArtifact(artifact)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.saveArtifact({ ...artifact, id: uid(), idempotencyKey: `idem_${uid()}` }))
      .toMatchObject({ ok: true, code: "replayed" });
    // same (run, kind, version) but a DIFFERENT checksum → conflict
    expect(await repo.saveArtifact({ ...artifact, id: uid(), idempotencyKey: `idem_${uid()}`, checksum: "chk_OTHER" }))
      .toMatchObject({ ok: false, code: "conflict" });

    await repo.saveArtifact({ ...artifact, id: uid(), version: 2, checksum: "chk_v2", idempotencyKey: `idem_${uid()}` });
    const listed = await repo.listArtifactsByKind(run.id, "evidence_bundle");
    expect(listed.ok && listed.value.length).toBe(2);
    expect(listed.ok && listed.value[0]!.version).toBe(2); // newest first
  });

  /* ---- reasoning + provider attempts --------------------------------------- */
  it("round-trips a reasoning job and its provider attempts", async () => {
    const run = await seedRun();
    const job = {
      id: uid(), runId: run.id, clientId, scanId: run.scanId, stage: "research", taskType: "reasoning",
      status: "pending" as const, attempt: 0, maxAttempts: 3, idempotencyKey: `idem_${uid()}`,
      metadata: {}, deadline: null, createdBy: null, createdAt: nowIso(), updatedAt: null,
      startedAt: null, completedAt: null, failedAt: null, cancelledAt: null,
    };
    expect(await repo.createReasoningJob(job)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.createReasoningJob(job)).toMatchObject({ ok: true, code: "replayed" });

    const updated = await repo.updateReasoningJobStatus(job.id, "running", { attempt: 1, startedAt: nowIso() });
    expect(updated.ok && updated.value.status).toBe("running");

    const attempt = {
      id: uid(), reasoningJobId: job.id, runId: run.id, clientId, scanId: run.scanId,
      providerId: "p-opaque", attempt: 0, status: "succeeded" as const, retryDisposition: null,
      latencyMs: 25, estimatedCost: 0.002, actualCost: 0.0018, inputTokens: 100, outputTokens: 50,
      usageEstimated: false, rawResponseRef: "blob://ref", lastError: null,
      idempotencyKey: `idem_${uid()}`, createdAt: nowIso(),
    };
    expect(await repo.recordProviderAttempt(attempt)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.recordProviderAttempt({ ...attempt, id: uid(), idempotencyKey: `idem_${uid()}` }))
      .toMatchObject({ ok: true, code: "replayed" });

    const attempts = await repo.listProviderAttempts(job.id);
    expect(attempts.ok && attempts.value.length).toBe(1);
    expect(attempts.ok && attempts.value[0]!.rawResponseRef).toBe("blob://ref");
  });

  /* ---- derived records ------------------------------------------------------ */
  it("persists findings and recommendations idempotently, scoped to their run", async () => {
    const run = await seedRun();
    const other = await seedRun();
    const base = { clientId, envelope: { note: "n" }, sourceArtifactIds: [], createdBy: null, createdAt: nowIso() };

    const finding = {
      ...base, id: uid(), runId: run.id, scanId: run.scanId, domain: "digital_presence",
      severity: "high", version: 1, checksum: "f1", idempotencyKey: `idem_${uid()}`,
    };
    expect(await repo.saveFinding(finding)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.saveFinding(finding)).toMatchObject({ ok: true, code: "replayed" });
    // same idempotency key, different checksum → conflict, never a silent overwrite
    expect(await repo.saveFinding({ ...finding, id: uid(), checksum: "f1_CHANGED" }))
      .toMatchObject({ ok: false, code: "conflict" });
    // a second finding on the SAME run, plus one on another run that must not leak in
    await repo.saveFinding({ ...base, id: uid(), runId: run.id, scanId: run.scanId, domain: "operations", severity: "low", version: 1, checksum: "f2", idempotencyKey: `idem_${uid()}` });
    await repo.saveFinding({ ...base, id: uid(), runId: other.id, scanId: other.scanId, domain: "operations", severity: "low", version: 1, checksum: "f3", idempotencyKey: `idem_${uid()}` });

    const findings = await repo.listFindings(run.id);
    expect(findings.ok && findings.value.length).toBe(2);
    expect(findings.ok && findings.value.every((f) => f.runId === run.id)).toBe(true);
    // the envelope survives the jsonb round trip intact
    expect(findings.ok && findings.value.some((f) => f.envelope["note"] === "n")).toBe(true);

    const rec = {
      ...base, id: uid(), runId: run.id, scanId: run.scanId, tier: "quick_win",
      priority: 80, version: 1, checksum: "r1", idempotencyKey: `idem_${uid()}`,
    };
    expect(await repo.saveRecommendation(rec)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.saveRecommendation(rec)).toMatchObject({ ok: true, code: "replayed" });
    expect(await repo.saveRecommendation({ ...rec, id: uid(), checksum: "r1_CHANGED" }))
      .toMatchObject({ ok: false, code: "conflict" });
    await repo.saveRecommendation({ ...base, id: uid(), runId: other.id, scanId: other.scanId, tier: "strategic", priority: 10, version: 1, checksum: "r2", idempotencyKey: `idem_${uid()}` });

    const recs = await repo.listRecommendations(run.id);
    expect(recs.ok && recs.value.length).toBe(1);
    expect(recs.ok && recs.value[0]!.tier).toBe("quick_win");
    expect(recs.ok && recs.value[0]!.priority).toBe(80);
  });

  it("persists a competitor snapshot idempotently and conflicts on a changed checksum", async () => {
    const run = await seedRun();
    const snap = {
      id: uid(), runId: run.id, clientId, scanId: run.scanId, competitorCount: 4, version: 1,
      checksum: "s1", envelope: {}, sourceArtifactIds: [], idempotencyKey: `idem_${uid()}`,
      createdBy: null, createdAt: nowIso(),
    };
    expect(await repo.saveCompetitorSnapshot(snap)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.saveCompetitorSnapshot(snap)).toMatchObject({ ok: true, code: "replayed" });
    expect(await repo.saveCompetitorSnapshot({ ...snap, id: uid(), checksum: "s1_CHANGED" }))
      .toMatchObject({ ok: false, code: "conflict" });
  });

  /* ---- versions ------------------------------------------------------------ */
  it("round-trips proposal and narrative versions with latest lookup", async () => {
    const run = await seedRun();
    const base = { runId: run.id, clientId, scanId: run.scanId, envelope: {}, sourceArtifactIds: [], createdBy: null, createdAt: nowIso() };

    const p1 = { ...base, id: uid(), status: "draft", supersedesId: null, version: 1, checksum: "p1", idempotencyKey: `idem_${uid()}` };
    expect(await repo.saveProposalVersion(p1)).toMatchObject({ ok: true, code: "created" });
    expect(await repo.saveProposalVersion(p1)).toMatchObject({ ok: true, code: "replayed" });
    expect(await repo.saveProposalVersion({ ...p1, id: uid(), idempotencyKey: `idem_${uid()}`, checksum: "p1_CHANGED" }))
      .toMatchObject({ ok: false, code: "conflict" });
    const p2Id = uid();
    await repo.saveProposalVersion({ ...base, id: p2Id, status: "draft", supersedesId: p1.id, version: 2, checksum: "p2", idempotencyKey: `idem_${uid()}` });
    const latestProposal = await repo.getLatestProposalVersion(run.id);
    expect(latestProposal.ok && latestProposal.value.version).toBe(2);
    // LINEAGE: v2 points back at v1, and v1 is untouched — a new version never
    // rewrites its predecessor.
    expect(latestProposal.ok && latestProposal.value.id).toBe(p2Id);
    expect(latestProposal.ok && latestProposal.value.supersedesId).toBe(p1.id);
    const { data: v1Row } = await service.from("proposal_versions").select("*").eq("id", p1.id).single();
    expect(v1Row?.checksum).toBe("p1");
    expect(v1Row?.version).toBe(1);
    expect(v1Row?.supersedes_id).toBeNull();

    const n1 = { ...base, id: uid(), audience: "client", status: "draft", supersedesId: null, version: 1, checksum: "n1", idempotencyKey: `idem_${uid()}` };
    expect(await repo.saveNarrativeVersion(n1)).toMatchObject({ ok: true, code: "created" });
    await repo.saveNarrativeVersion({ ...n1, id: uid(), version: 2, checksum: "n2", idempotencyKey: `idem_${uid()}` });
    // a different audience is an independent lineage
    await repo.saveNarrativeVersion({ ...n1, id: uid(), audience: "board", version: 1, checksum: "b1", idempotencyKey: `idem_${uid()}` });
    const latestClient = await repo.getLatestNarrativeVersion(run.id, "client");
    expect(latestClient.ok && latestClient.value.version).toBe(2);
    const latestBoard = await repo.getLatestNarrativeVersion(run.id, "board");
    expect(latestBoard.ok && latestBoard.value.version).toBe(1);
  });

  /* ---- queue: atomic leasing + ownership ----------------------------------- */
  it("leases jobs in deterministic priority order and reports no_job_available", async () => {
    const run = await seedRun();
    const jobType = `lease_${uid()}`;
    await repo.enqueueJob(jobRecord(run.id, { jobType, priority: 9 }));
    const firstJob = jobRecord(run.id, { jobType, priority: 1 });
    await repo.enqueueJob(firstJob);
    await repo.enqueueJob(jobRecord(run.id, { jobType, priority: 5 }));

    const lease1 = await repo.leaseNextEligibleJob({ owner: "w1", leaseSeconds: 60, jobType });
    expect(lease1).toMatchObject({ ok: true, code: "leased" });
    if (lease1.ok) {
      expect(lease1.value.id).toBe(firstJob.id); // lowest priority number first
      expect(lease1.value.leaseOwner).toBe("w1");
      expect(lease1.value.attempt).toBe(1); // incremented on lease
    }

    await repo.leaseNextEligibleJob({ owner: "w2", leaseSeconds: 60, jobType });
    await repo.leaseNextEligibleJob({ owner: "w3", leaseSeconds: 60, jobType });
    expect(await repo.leaseNextEligibleJob({ owner: "w4", leaseSeconds: 60, jobType }))
      .toMatchObject({ ok: false, code: "no_job_available" });
  });

  it("never hands the same job to two concurrent workers", async () => {
    const run = await seedRun();
    const jobType = `contend_${uid()}`;
    const only = jobRecord(run.id, { jobType, priority: 0 });
    await repo.enqueueJob(only);

    // five workers race for a single job
    const results = await Promise.all(
      ["a", "b", "c", "d", "e"].map((owner) => repo.leaseNextEligibleJob({ owner, leaseSeconds: 60, jobType })),
    );
    const leased = results.filter((r) => r.ok);
    expect(leased).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "no_job_available")).toHaveLength(4);
  });

  it("enforces lease ownership for renew, complete, fail and reschedule", async () => {
    const run = await seedRun();
    const jobType = `own_${uid()}`;
    await repo.enqueueJob(jobRecord(run.id, { jobType }));
    const leased = await repo.leaseNextEligibleJob({ owner: "owner_1", leaseSeconds: 60, jobType });
    expect(leased.ok).toBe(true);
    const jobId = leased.ok ? leased.value.id : "";

    // non-owner is refused everywhere
    expect(await repo.renewLease(jobId, "intruder", 60)).toMatchObject({ ok: false, code: "lease_lost" });
    expect(await repo.completeJob(jobId, "intruder")).toMatchObject({ ok: false, code: "lease_lost" });
    expect(await repo.failJob({ jobId, owner: "intruder", error: "x", terminal: true })).toMatchObject({ ok: false, code: "lease_lost" });
    expect(await repo.rescheduleJob({ jobId, owner: "intruder", availableAt: nowIso(), reason: "x" })).toMatchObject({ ok: false, code: "lease_lost" });

    // the owner may renew, then complete
    const renewed = await repo.renewLease(jobId, "owner_1", 120);
    expect(renewed.ok).toBe(true);
    const completed = await repo.completeJob(jobId, "owner_1");
    expect(completed.ok && completed.value.status).toBe("completed");

    // a terminal job cannot be renewed or re-leased
    expect(await repo.renewLease(jobId, "owner_1", 60)).toMatchObject({ ok: false, code: "terminal_state" });
    expect(await repo.leaseNextEligibleJob({ owner: "owner_2", leaseSeconds: 60, jobType }))
      .toMatchObject({ ok: false, code: "no_job_available" });
  });

  it("recovers a stale lease and reschedules a retryable failure", async () => {
    const run = await seedRun();
    const jobType = `stale_${uid()}`;
    const job = jobRecord(run.id, { jobType });
    await repo.enqueueJob(job);

    // lease for 1s, then force expiry via the service client and re-lease
    await repo.leaseNextEligibleJob({ owner: "slow_worker", leaseSeconds: 1, jobType });
    await service.from("job_queue")
      .update({ status: "queued", lease_status: "expired", lease_owner: null, lease_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", job.id);

    const recovered = await repo.leaseNextEligibleJob({ owner: "fresh_worker", leaseSeconds: 60, jobType });
    expect(recovered.ok && recovered.value.leaseOwner).toBe("fresh_worker");
    expect(recovered.ok && recovered.value.attempt).toBe(2); // attempt survived the recovery

    // a retryable failure returns the job to the queue with a future availability
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    const failed = await repo.failJob({ jobId: job.id, owner: "fresh_worker", error: "transient", terminal: false, retryAfter: retryAt });
    expect(failed.ok && failed.value.status).toBe("queued");
    expect(failed.ok && failed.value.lastError).toBe("transient");
    expect(await repo.leaseNextEligibleJob({ owner: "eager", leaseSeconds: 60, jobType }))
      .toMatchObject({ ok: false, code: "no_job_available" }); // not yet available
  });

  it("dead-letters a terminal failure and cancels idempotently", async () => {
    const run = await seedRun();
    const jobType = `term_${uid()}`;
    const job = jobRecord(run.id, { jobType });
    await repo.enqueueJob(job);
    await repo.leaseNextEligibleJob({ owner: "w", leaseSeconds: 60, jobType });

    const dead = await repo.failJob({ jobId: job.id, owner: "w", error: "fatal", terminal: true });
    expect(dead.ok && dead.value.status).toBe("dead_letter");
    expect(await repo.cancelJob(job.id)).toMatchObject({ ok: false, code: "terminal_state" });

    const other = jobRecord(run.id, { jobType: `cancel_${uid()}` });
    await repo.enqueueJob(other);
    expect(await repo.cancelJob(other.id)).toMatchObject({ ok: true, code: "updated" });
    expect(await repo.cancelJob(other.id)).toMatchObject({ ok: true, code: "replayed" });
  });

  it("prevents a client role from leasing internal work", async () => {
    const run = await seedRun();
    const jobType = `rls_${uid()}`;
    await repo.enqueueJob(jobRecord(run.id, { jobType }));
    expect(await clientRepo.leaseNextEligibleJob({ owner: "rogue", leaseSeconds: 60, jobType }))
      .toMatchObject({ ok: false, code: "no_job_available" });
    // the job is still claimable by an internal worker
    expect(await repo.leaseNextEligibleJob({ owner: "legit", leaseSeconds: 60, jobType })).toMatchObject({ ok: true, code: "leased" });
  });

  /* ---- events -------------------------------------------------------------- */
  it("appends events with a deterministic per-aggregate sequence", async () => {
    const run = await seedRun();
    const event = (type: string) => ({
      id: uid(), eventType: type, runId: run.id, stage: null, aggregateId: run.id,
      aggregateType: "run", clientId, scanId: run.scanId, payload: { note: "no secrets" },
      occurredAt: nowIso(), correlationId: "corr_1", causationId: null, actor: "usr_x", schemaVersion: "1.0",
    });

    const first = await repo.appendRuntimeEvent({ event: event("pipeline.created") });
    expect(first.ok && first.value.sequence).toBe(1);
    const second = await repo.appendRuntimeEvent({ event: event("pipeline.stage_started") });
    expect(second.ok && second.value.sequence).toBe(2);

    const listed = await repo.listRuntimeEvents({ aggregateType: "run", aggregateId: run.id });
    expect(listed.ok && listed.value.map((e) => e.sequence)).toEqual([1, 2]);
    expect(listed.ok && listed.value[0]!.correlationId).toBe("corr_1");
  });

  it("rejects a duplicate sequence as a serialization conflict", async () => {
    const run = await seedRun();
    const base = {
      id: uid(), eventType: "pipeline.created", runId: run.id, stage: null, aggregateId: run.id,
      aggregateType: "run", clientId, scanId: run.scanId, payload: {}, occurredAt: nowIso(),
      correlationId: null, causationId: null, actor: null, schemaVersion: "1.0",
    };
    expect(await repo.appendRuntimeEvent({ event: base, expectedSequence: 1 })).toMatchObject({ ok: true, code: "created" });
    expect(await repo.appendRuntimeEvent({ event: { ...base, id: uid() }, expectedSequence: 1 }))
      .toMatchObject({ ok: false, code: "serialization_conflict" });
  });

  it("keeps event sequences independent per aggregate and denies client reads", async () => {
    const run = await seedRun();
    const jobAggregate = uid();
    const mk = (aggregateType: string, aggregateId: string) => ({
      id: uid(), eventType: "x", runId: run.id, stage: null, aggregateId, aggregateType,
      clientId, scanId: run.scanId, payload: {}, occurredAt: nowIso(),
      correlationId: null, causationId: null, actor: null, schemaVersion: "1.0",
    });
    const a = await repo.appendRuntimeEvent({ event: mk("run", run.id) });
    const b = await repo.appendRuntimeEvent({ event: mk("reasoning_job", jobAggregate) });
    expect(a.ok && a.value.sequence).toBe(1);
    expect(b.ok && b.value.sequence).toBe(1); // independent lineage

    const clientView = await clientRepo.listRuntimeEvents({ aggregateType: "run", aggregateId: run.id });
    expect(clientView.ok && clientView.value).toEqual([]); // RLS: internal-only
  });
});
