/* =============================================================================
 * Scan route integration tests (Phase C · Sprint C1).
 *
 * Exercises the real route handlers end to end: request → handler →
 * @brightloop/application use-case → runtime services → InMemoryRuntimeRepository.
 * Only the SESSION seam is doubled — `getActor` (which needs a Supabase cookie)
 * and `getRuntimeServices` (which needs a Supabase client). The runtime itself
 * is the real deterministic in-memory implementation, so these prove status
 * codes, authorization, validation and the error taxonomy over the wire.
 * ========================================================================== */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";

/** Shared, per-test mutable session state the mocks read from. */
const session = vi.hoisted(() => ({ actor: null as Actor | null, services: null as RuntimeServices | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => session.actor }));
vi.mock("@/lib/repositories", () => ({ getRuntimeServices: async () => session.services, getExecutionRepositories: async () => ({ workspaces: {}, initiatives: {}, activities: {} }), getCollaborationRepositories: async () => ({ subscriptions: {}, mentions: {}, notifications: {}, inbox: {}, readReceipts: {} }), getAiFoundationRepositories: async () => ({ providers: {}, prompts: {}, promptVersions: {}, executions: {}, results: {}, usage: {}, costs: {}, audit: {}, conversations: {}, messages: {}, evaluations: {} }), getAiProviderRegistry: () => ({}), getKnowledgeRepositories: async () => ({ collections: {}, documents: {}, versions: {}, chunks: {}, vectors: {}, jobs: {}, sessions: {}, contexts: {}, citations: {}, permissions: {}, sources: {} }), getEmbeddingProviderRegistry: () => ({}), getVectorStore: async () => ({}), getStrategistRepositories: async () => ({ sessions: {}, analyses: {}, findings: {}, risks: {}, recommendations: {}, priorityScores: {}, roadmaps: {}, citations: {}, feedback: {} }), getProjectManagerRepositories: async () => ({ sessions: {}, plans: {}, initiatives: {}, milestones: {}, tasks: {}, dependencies: {}, timelines: {}, reviews: {}, kpis: {}, resources: {}, risks: {}, feedback: {} }), getAutomationBuilderRepositories: async () => ({ intents: {}, plans: {}, workflows: {}, steps: {}, triggers: {}, actions: {}, conditions: {}, variables: {}, integrations: {}, deployments: {}, versions: {}, feedback: {} }), getReportingRepositories: async () => ({ reports: {}, observations: {}, metrics: {}, kpis: {}, trends: {}, forecasts: {}, insights: {}, summaries: {}, sections: {}, narratives: {}, schedules: {}, feedback: {} }), getAgentRepositories: async () => ({ profiles: {}, missions: {}, runs: {}, tasks: {}, delegations: {}, messages: {}, observations: {}, decisions: {}, toolCalls: {}, checkpoints: {}, approvals: {}, evaluations: {}, memories: {}, artifacts: {}, failures: {}, feedback: {}, capabilities: {} }), getCertificationRepositories: async () => ({ runs: {}, results: {}, issues: {}, exceptions: {} }), getCopilotRepositories: async () => ({ conversations: {}, messages: {}, citations: {}, actions: {} }) }));

// Import handlers AFTER the mocks are registered.
import { GET as listScansRoute, POST as createScanRoute } from "./route";
import { GET as getScanRoute } from "./[id]/route";
import { POST as cancelRoute } from "./[id]/cancel/route";
import { POST as retryRoute } from "./[id]/retry/route";
import { GET as timelineRoute } from "./[id]/timeline/route";
import { GET as reportRoute } from "./[id]/report/route";
import { GET as proposalRoute } from "./[id]/proposal/route";
import { GET as narrativeRoute } from "./[id]/narrative/route";

const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

let counter = 0;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("http://x/api/scans", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  counter = 0;
  const repo = new InMemoryRuntimeRepository(() => new Date().toISOString());
  session.services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++counter).toString().padStart(5, "0")}` });
  session.actor = OWNER;
});

async function createScanId(clientId = "t_acme"): Promise<string> {
  const res = await createScanRoute(post({ clientId }));
  const body = await res.json();
  return body.id as string;
}

/* ===== auth ================================================================== */
describe("authentication", () => {
  it("401s when unauthenticated", async () => {
    session.actor = null;
    const res = await getScanRoute(new Request("http://x"), params("run_00001"));
    expect(res.status).toBe(401);
  });
});

/* ===== create + get (happy path) ============================================= */
describe("POST /api/scans + GET /api/scans/:id", () => {
  it("creates (201) and reads back (200)", async () => {
    const create = await createScanRoute(post({ clientId: "t_acme" }));
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.lifecycle).toBe("pending");
    expect(created.id).toMatch(/^run_/);

    const get = await getScanRoute(new Request("http://x"), params(created.id));
    expect(get.status).toBe(200);
    expect((await get.json()).id).toBe(created.id);
  });

  it("422s a malformed body", async () => {
    const res = await createScanRoute(post({ clientId: "has spaces" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("validation");
  });

  it("403s a client actor (internal-only create)", async () => {
    session.actor = CLIENT;
    const res = await createScanRoute(post({ clientId: "t_acme" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });
});

/* ===== get: 404 + 403 ======================================================== */
describe("GET /api/scans/:id — not found / forbidden", () => {
  it("404s an unknown run", async () => {
    const res = await getScanRoute(new Request("http://x"), params("run_missing"));
    expect(res.status).toBe(404);
  });

  it("422s a malformed id", async () => {
    const res = await getScanRoute(new Request("http://x"), params("nope!"));
    expect(res.status).toBe(422);
  });

  it("403s a client actor reading another tenant's run", async () => {
    const id = await createScanId("t_other");
    session.actor = CLIENT; // belongs to t_acme
    const res = await getScanRoute(new Request("http://x"), params(id));
    expect(res.status).toBe(403);
  });
});

/* ===== list ================================================================== */
describe("GET /api/scans", () => {
  it("lists the caller's scans (200)", async () => {
    await createScanId("t_acme");
    await createScanId("t_other");
    const res = await listScansRoute(new Request("http://x/api/scans"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
  });

  it("422s an out-of-range limit", async () => {
    const res = await listScansRoute(new Request("http://x/api/scans?limit=0"));
    expect(res.status).toBe(422);
  });
});

/* ===== cancel ================================================================ */
describe("POST /api/scans/:id/cancel", () => {
  it("cancels a pending scan (200)", async () => {
    const id = await createScanId();
    const res = await cancelRoute(new Request("http://x", { method: "POST" }), params(id));
    expect(res.status).toBe(200);
    expect((await res.json()).lifecycle).toBe("cancelled");
  });

  it("409s cancelling a completed scan (already_completed)", async () => {
    const id = await createScanId();
    // complete the run directly through the runtime
    await session.services!.runs.completeRun(id);
    const res = await cancelRoute(new Request("http://x", { method: "POST" }), params(id));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("already_completed");
  });
});

/* ===== retry ================================================================= */
describe("POST /api/scans/:id/retry", () => {
  it("retries a dead-lettered stage (200)", async () => {
    const id = await createScanId();
    // drive the first-stage job straight to dead-letter (fatal), run stays in-flight
    const leased = await session.services!.queue.lease({ owner: "w1", leaseSeconds: 60, jobType: "advance_stage" });
    expect(leased.ok).toBe(true);
    if (leased.ok) await session.services!.queue.fail(leased.value, "w1", "boom", { fatal: true });

    const res = await retryRoute(new Request("http://x", { method: "POST" }), params(id));
    expect(res.status).toBe(200);
  });

  it("409s when there is nothing to retry (retry_unavailable)", async () => {
    const id = await createScanId();
    const res = await retryRoute(new Request("http://x", { method: "POST" }), params(id));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("retry_unavailable");
  });
});

/* ===== timeline ============================================================== */
describe("GET /api/scans/:id/timeline", () => {
  it("returns UI-ready events (200)", async () => {
    const id = await createScanId();
    const res = await timelineRoute(new Request("http://x"), params(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("sequence");
    expect(body[0]).not.toHaveProperty("aggregateType");
  });
});

/* ===== report / proposal / narrative ========================================= */
describe("GET report / proposal / narrative", () => {
  it("404s a report until a valid one exists, then 200", async () => {
    const id = await createScanId();
    const before = await reportRoute(new Request("http://x"), params(id));
    expect(before.status).toBe(404);

    const run = session.services!.runs; // seed a valid report artifact
    const r = await run.getRun(id);
    if (r.ok) {
      await session.services!.artifacts.persist({
        runId: id, clientId: r.value.clientId, scanId: r.value.scanId,
        kind: "internal_intelligence_report", envelope: { ok: true }, validationStatus: "valid",
      });
    }
    const after = await reportRoute(new Request("http://x"), params(id));
    expect(after.status).toBe(200);
    expect((await after.json()).kind).toBe("internal_intelligence_report");
  });

  it("404s a proposal that is not approved", async () => {
    const id = await createScanId();
    const r = await session.services!.runs.getRun(id);
    if (r.ok) await session.services!.proposals.save({ runId: id, clientId: r.value.clientId, scanId: r.value.scanId, envelope: {}, status: "draft" });
    const res = await proposalRoute(new Request("http://x"), params(id));
    expect(res.status).toBe(404);
  });

  it("returns an approved narrative (200) and 422s a bad audience", async () => {
    const id = await createScanId();
    const r = await session.services!.runs.getRun(id);
    if (r.ok) await session.services!.narratives.save({ runId: id, clientId: r.value.clientId, scanId: r.value.scanId, envelope: { t: 1 }, audience: "client", status: "approved" });

    const ok = await narrativeRoute(new Request("http://x/api?audience=client"), params(id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).audience).toBe("client");

    const bad = await narrativeRoute(new Request("http://x/api?audience=martians"), params(id));
    expect(bad.status).toBe(422);
  });
});
