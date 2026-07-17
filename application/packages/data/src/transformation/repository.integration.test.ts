/* =============================================================================
 * SupabaseTransformationRepository — LIVE integration tests (Sprint 3).
 *
 * These run ONLY against a real ephemeral Supabase/Postgres with the migrations
 * applied. They are EXCLUDED from the default `vitest run` (see vitest.config.ts)
 * and executed via `pnpm --filter @brightloop/data test:integration` in the CI
 * `db-verify` job and locally after `supabase start && supabase db reset`.
 *
 * Required env (set from `supabase status -o env` in CI / locally):
 *   SUPABASE_TEST_URL          — local API url (e.g. http://127.0.0.1:54321)
 *   SUPABASE_TEST_SERVICE_KEY  — service_role key (bypasses RLS: seeding + functional round-trips)
 *   SUPABASE_TEST_ANON_KEY     — anon key (base client for authed requests)
 *   SUPABASE_TEST_JWT_SECRET   — local JWT secret (to mint per-tenant identities for RLS tests)
 *
 * No production credentials are ever used.
 * ========================================================================== */

import { createHmac, randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
import { SupabaseTransformationRepository } from "./repository.js";
import type { Signal, Move } from "@brightloop/schema";

const URL = process.env["SUPABASE_TEST_URL"];
const SERVICE_KEY = process.env["SUPABASE_TEST_SERVICE_KEY"];
const ANON_KEY = process.env["SUPABASE_TEST_ANON_KEY"];
const JWT_SECRET = process.env["SUPABASE_TEST_JWT_SECRET"];
const LIVE = Boolean(URL && SERVICE_KEY && ANON_KEY && JWT_SECRET);

/** Minimal HS256 JWT signer (no dependency) — mints a Supabase-shaped auth token. */
function signJwt(claims: Record<string, unknown>, secret: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, ...claims });
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const NOW = () => new Date().toISOString();
const uid = () => `t_${randomUUID().slice(0, 8)}`;

describe.skipIf(!LIVE)("SupabaseTransformationRepository (live DB)", () => {
  let service: SupabaseClient<Database>;
  let repo: SupabaseTransformationRepository;
  const A = "cli_it_A";
  const B = "cli_it_B";
  const usr = "usr_it_owner";

  /** A client authenticated as a specific tenant (RLS applies with its claims). */
  function asClient(clientId: string): SupabaseTransformationRepository {
    const jwt = signJwt({ sub: randomUUID(), app_metadata: { role: "client_admin", client_id: clientId } }, JWT_SECRET as string);
    const client = createClient<Database>(URL as string, ANON_KEY as string, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    return new SupabaseTransformationRepository(client);
  }

  beforeAll(async () => {
    service = createClient<Database>(URL as string, SERVICE_KEY as string, { auth: { persistSession: false } });
    repo = new SupabaseTransformationRepository(service);
    // Seed two orgs + an internal actor (service role bypasses RLS). Seeding must
    // fail LOUDLY — a swallowed error here surfaces later as opaque FK violations.
    const seedClients = await service
      .from("clients")
      .upsert([{ id: A, company: "IT Org A" }, { id: B, company: "IT Org B" }], { onConflict: "id" });
    if (seedClients.error) throw new Error(`seed clients failed: ${seedClients.error.message}`);
    const seedUser = await service
      .from("users")
      .upsert([{ id: usr, name: "IT Owner", email: `${usr}@example.test`, role: "owner", status: "active" }], {
        onConflict: "id",
      });
    if (seedUser.error) throw new Error(`seed users failed: ${seedUser.error.message}`);
  });

  afterAll(async () => {
    // Cascade-delete the test orgs (removes all their transformation rows).
    if (service) await service.from("clients").delete().in("id", [A, B]);
  });

  function signal(overrides: Partial<Signal> = {}): Signal {
    return {
      id: uid(), clientId: A, title: "slip", detail: null, status: "detected",
      sourceRef: "metric:x", evidence: [{ kind: "metric", ref: "x", label: "X" }],
      createdBy: usr, createdAt: NOW(), ...overrides,
    };
  }
  function move(overrides: Partial<Move> = {}): Move {
    return {
      id: uid(), clientId: A, title: "triage", intent: "cut time", expectedOutcome: null,
      status: "draft", recommendationId: null, approvalId: null, createdBy: usr, createdAt: NOW(), ...overrides,
    };
  }

  it("creates and retrieves a Signal (with evidence)", async () => {
    const s = await repo.createSignal(signal());
    const back = await repo.getSignal(s.id);
    expect(back?.title).toBe("slip");
    expect(back?.evidence[0]?.ref).toBe("x");
  });

  it("creates an Insight linked to a signal + evidence", async () => {
    const s = await repo.createSignal(signal());
    const ins = await repo.createInsight({
      id: uid(), clientId: A, signalId: s.id, summary: "bottleneck", detail: null,
      status: "generated", evidence: [{ kind: "metric", ref: "y" }], confidence: 0.6, createdBy: usr, createdAt: NOW(),
    });
    expect((await repo.getInsight(ins.id))?.signalId).toBe(s.id);
  });

  it("creates a Recommendation with null AI provenance and one with AI provenance", async () => {
    const s = await repo.createSignal(signal());
    const ins = await repo.createInsight({ id: uid(), clientId: A, signalId: s.id, summary: "b", detail: null, status: "generated", evidence: [], confidence: null, createdBy: usr, createdAt: NOW() });
    const human = await repo.createRecommendation({ id: uid(), clientId: A, insightId: ins.id, summary: "s", rationale: "r", expectedOutcome: null, status: "proposed", evidence: [], confidence: null, aiProvenance: null, createdBy: usr, createdAt: NOW() });
    expect((await repo.getRecommendation(human.id))?.aiProvenance).toBeNull();
    const ai = await repo.createRecommendation({ id: uid(), clientId: A, insightId: ins.id, summary: "s", rationale: "r", expectedOutcome: null, status: "proposed", evidence: [], confidence: 0.5, aiProvenance: { modelId: "m", promptVersion: "v1", generatedAt: NOW(), confidence: 0.7 }, createdBy: usr, createdAt: NOW() });
    expect((await repo.getRecommendation(ai.id))?.aiProvenance?.modelId).toBe("m");
  });

  it("requests and records a human Approval", async () => {
    const mv = await repo.createMove(move());
    const approval = await repo.createApproval({ id: uid(), clientId: A, subjectType: "move", subjectId: mv.id, decision: "pending", approverUserId: null, reason: null, requestedAt: NOW(), decidedAt: null, createdBy: usr, createdAt: NOW() });
    const decided = await repo.decideApproval(approval.id, "granted", usr, NOW(), "ok");
    expect(decided.decision).toBe("granted");
    expect(decided.approverUserId).toBe(usr);
  });

  it("enforces the approval gate: a Move cannot execute without a granted approval", async () => {
    const mv = await repo.createMove(move());
    await repo.setMoveStatus(mv.id, "approved"); // draft → approved (no approval linked)
    await expect(repo.setMoveStatus(mv.id, "executing")).rejects.toThrow(); // DB gate: 23514
    // now with a granted approval linked, it executes
    const mv2 = await repo.createMove(move());
    const appr = await repo.createApproval({ id: uid(), clientId: A, subjectType: "move", subjectId: mv2.id, decision: "granted", approverUserId: usr, reason: null, requestedAt: NOW(), decidedAt: NOW(), createdBy: usr, createdAt: NOW() });
    await repo.setMoveStatus(mv2.id, "approved", appr.id);
    const executing = await repo.setMoveStatus(mv2.id, "executing");
    expect(executing.status).toBe("executing");
  });

  it("supports idempotent Execution Record creation (duplicate key rejected, lookup works)", async () => {
    const mv = await repo.createMove(move());
    const key = `idem_${uid()}`;
    const e1 = await repo.createExecutionRecord({ id: uid(), clientId: A, moveId: mv.id, status: "queued", idempotencyKey: key, attempts: 0, lastError: null, startedAt: null, finishedAt: null, createdBy: usr, createdAt: NOW() });
    expect((await repo.findExecutionByIdempotencyKey(key))?.id).toBe(e1.id);
    await expect(
      repo.createExecutionRecord({ id: uid(), clientId: A, moveId: mv.id, status: "queued", idempotencyKey: key, attempts: 0, lastError: null, startedAt: null, finishedAt: null, createdBy: usr, createdAt: NOW() }),
    ).rejects.toThrow(); // unique violation 23505
  });

  it("records a Measurement and a Learning", async () => {
    const mv = await repo.createMove(move());
    const meas = await repo.createMeasurement({ id: uid(), clientId: A, moveId: mv.id, metricKey: "days", target: 5, observed: 6, delta: -1, unit: "days", measuredAt: NOW(), createdBy: usr, createdAt: NOW() });
    expect(meas.observed).toBe(6);
    const learn = await repo.createLearning({ id: uid(), clientId: A, summary: "helped", detail: null, moveId: mv.id, measurementId: meas.id, capturedAt: NOW(), createdBy: usr, createdAt: NOW() });
    expect(learn.summary).toBe("helped");
  });

  it("persists an audit transition record", async () => {
    const s = await repo.createSignal(signal());
    await repo.appendTransition({ machine: "signal", entityId: s.id, from: "detected", to: "validated", actorId: usr, reason: "triaged", at: NOW() });
    const { data } = await service.from("transition_log").select("*").eq("entity_id", s.id);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("enforces cross-tenant isolation: a client cannot read another org's business health", async () => {
    // internal (service) records health for both orgs
    await repo.recordBusinessHealth({ id: uid(), clientId: A, dimensions: { ops: 50 }, score: 50, basis: null, capturedAt: NOW(), createdAt: NOW() });
    await repo.recordBusinessHealth({ id: uid(), clientId: B, dimensions: { ops: 60 }, score: 60, basis: null, capturedAt: NOW(), createdAt: NOW() });
    const asA = asClient(A);
    // client A sees its own health, but NOT org B's (RLS filters → null)
    expect(await asA.latestBusinessHealth(A)).not.toBeNull();
    expect(await asA.latestBusinessHealth(B)).toBeNull();
    // client A cannot read internal-only signals at all (RLS → getSignal returns null even for a real id)
    const sigA = await repo.createSignal(signal());
    expect(await asA.getSignal(sigA.id)).toBeNull();
  });
});
