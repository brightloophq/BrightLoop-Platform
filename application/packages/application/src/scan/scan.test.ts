/* =============================================================================
 * Application use-case tests (Phase C · Sprint C1) — deterministic.
 *
 * Each use-case is exercised against real runtime services backed by the
 * InMemoryRuntimeRepository (no DB, injected clock, counter ids). These prove
 * the application boundary's own behaviour: authorization, input validation,
 * DTO mapping, error mapping, and correct delegation to the runtime — WITHOUT
 * ever touching a repository directly.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { PipelineRunStage } from "@brightloop/schema";
import type { Actor, RuntimeServices, StageWork } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository, PIPELINE_STAGE_ORDER, PIPELINE_STAGE_SPECS } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import {
  AlreadyCompletedError,
  ForbiddenError,
  NotFoundError,
  RetryUnavailableError,
  ValidationError,
} from "../errors.js";
import { createScan, parseCreateScanRequest } from "./create-scan.js";
import { getScan } from "./get-scan.js";
import { cancelScan } from "./cancel-scan.js";
import { retryScan } from "./retry-scan.js";
import { listScans } from "./list-scans.js";
import { getScanTimeline } from "./timeline.js";
import { getScanReport } from "./report.js";
import { getScanProposal } from "./proposal.js";
import { getScanNarrative } from "./narrative.js";

const T0 = "2026-07-22T00:00:00.000Z";

const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

interface Harness {
  repo: InMemoryRuntimeRepository;
  services: RuntimeServices;
  ctx: (actor: Actor) => AppContext;
  advance: (ms: number) => void;
}

function harness(): Harness {
  let millis = new Date(T0).getTime();
  const now = () => new Date(millis).toISOString();
  let counter = 0;
  const ids = (prefix: string) => `${prefix}_${(++counter).toString().padStart(4, "0")}`;
  const repo = new InMemoryRuntimeRepository(now);
  const services = createRuntimeServices({ repo, ids, clock: now });
  return {
    repo,
    services,
    ctx: (actor) => ({ services, actor, ids, clock: now }),
    advance: (ms) => { millis += ms; },
  };
}

const executor = async (stage: PipelineRunStage): Promise<StageWork> => {
  const kind = PIPELINE_STAGE_SPECS[stage].producesArtifact;
  return kind === null ? { envelope: null, kind: null } : { envelope: { stage }, kind };
};

/* ===== validation ============================================================ */
describe("input validation", () => {
  it("rejects a create request missing clientId", () => {
    expect(() => parseCreateScanRequest({})).toThrow(ValidationError);
  });

  it("rejects a malformed clientId and a bad deadline", () => {
    expect(() => parseCreateScanRequest({ clientId: "has spaces" })).toThrow(ValidationError);
    expect(() => parseCreateScanRequest({ clientId: "t_acme", deadline: "not-a-date" })).toThrow(ValidationError);
  });

  it("rejects a non-object body", () => {
    expect(() => parseCreateScanRequest("nope")).toThrow(ValidationError);
    expect(() => parseCreateScanRequest([1, 2])).toThrow(ValidationError);
  });

  it("rejects a malformed run id at read time", async () => {
    const h = harness();
    await expect(getScan(h.ctx(OWNER), "bad id!")).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a well-formed create request", () => {
    const req = parseCreateScanRequest({ clientId: "t_acme", metadata: { k: 1 }, deadline: "2026-07-22T01:00:00.000Z" });
    expect(req).toMatchObject({ clientId: "t_acme", metadata: { k: 1 }, deadline: "2026-07-22T01:00:00.000Z" });
  });
});

/* ===== create ================================================================ */
describe("createScan", () => {
  it("creates a run, enqueues the first stage, and returns a DTO — never a domain entity", async () => {
    const h = harness();
    const dto = await createScan(h.ctx(OWNER), { clientId: "t_acme" });

    expect(dto.id).toMatch(/^run_/);
    expect(dto.lifecycle).toBe("pending");
    expect(dto.progress).toBe(0);
    expect(dto.clientId).toBe("t_acme");
    // the DTO carries no runtime internals
    expect(dto).not.toHaveProperty("idempotencyKey");
    expect(dto).not.toHaveProperty("checksum");
    expect(dto).not.toHaveProperty("cancelled");

    // a run and its first-stage job actually exist in the runtime
    expect(h.repo.allRuns()).toHaveLength(1);
    expect(h.repo.allJobs()).toHaveLength(1);
    expect(h.repo.allJobs()[0]!.stage).toBe(PIPELINE_STAGE_ORDER[0]);
  });

  it("team_member (internal) may create; client_admin may NOT", async () => {
    const h = harness();
    await expect(createScan(h.ctx(TEAM), { clientId: "t_acme" })).resolves.toMatchObject({ lifecycle: "pending" });
    await expect(createScan(h.ctx(CLIENT), { clientId: "t_acme" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ===== get + authorization/ownership ========================================= */
describe("getScan", () => {
  it("returns status for an authorized internal caller", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    const got = await getScan(h.ctx(OWNER), created.id);
    expect(got.id).toBe(created.id);
    expect(got.summary).toContain("queued");
  });

  it("404s an unknown run", async () => {
    const h = harness();
    await expect(getScan(h.ctx(OWNER), "run_doesnotexist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("forbids a client actor from another tenant's run (ownership on the loaded row)", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_other" });
    // client_admin belongs to t_acme; the run belongs to t_other
    await expect(getScan(h.ctx(CLIENT), created.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ===== progress + duration mapping =========================================== */
describe("DTO mapping", () => {
  it("reports progress and duration as the run advances", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });

    // drive three stages
    for (let i = 0; i < 3; i += 1) { await h.services.coordinator.runOnce("w1", executor); h.advance(1000); }

    const dto = await getScan(h.ctx(OWNER), created.id);
    expect(dto.lifecycle).toBe("running");
    expect(dto.progress).toBeGreaterThan(0);
    expect(dto.progress).toBeLessThan(100);
    expect(dto.durationMs).not.toBeNull();
  });

  it("reports 100% and completed once the pipeline finishes", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    for (let i = 0; i < PIPELINE_STAGE_ORDER.length; i += 1) { await h.services.coordinator.runOnce("w1", executor); h.advance(500); }

    const dto = await getScan(h.ctx(OWNER), created.id);
    expect(dto.lifecycle).toBe("completed");
    expect(dto.progress).toBe(100);
  });
});

/* ===== cancel ================================================================ */
describe("cancelScan", () => {
  it("cancels a pending run", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    const dto = await cancelScan(h.ctx(OWNER), created.id);
    expect(dto.lifecycle).toBe("cancelled");
  });

  it("maps a completed run to AlreadyCompleted, not a generic conflict", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    for (let i = 0; i < PIPELINE_STAGE_ORDER.length; i += 1) { await h.services.coordinator.runOnce("w1", executor); h.advance(500); }
    await expect(cancelScan(h.ctx(OWNER), created.id)).rejects.toBeInstanceOf(AlreadyCompletedError);
  });

  it("requires write capability", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    await expect(cancelScan(h.ctx(CLIENT), created.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ===== retry ================================================================= */
describe("retryScan", () => {
  it("retries a run whose stage dead-lettered, reusing recovery", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    const throwing = async (): Promise<StageWork> => { throw new Error("boom"); };
    for (let i = 0; i < 6; i += 1) { await h.services.coordinator.runOnce("w1", throwing); h.advance(600_000); }

    const dto = await retryScan(h.ctx(OWNER), created.id);
    expect(dto.id).toBe(created.id);
    // the job is eligible again
    expect(h.repo.allJobs()[0]!.status).toBe("queued");
  });

  it("returns RetryUnavailable when there is nothing to retry", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    await expect(retryScan(h.ctx(OWNER), created.id)).rejects.toBeInstanceOf(RetryUnavailableError);
  });

  it("refuses to retry a completed run as AlreadyCompleted", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    for (let i = 0; i < PIPELINE_STAGE_ORDER.length; i += 1) { await h.services.coordinator.runOnce("w1", executor); h.advance(500); }
    await expect(retryScan(h.ctx(OWNER), created.id)).rejects.toBeInstanceOf(AlreadyCompletedError);
  });
});

/* ===== list ================================================================== */
describe("listScans", () => {
  it("lists an internal caller's scans newest-first as DTOs", async () => {
    const h = harness();
    await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    h.advance(1000);
    await createScan(h.ctx(OWNER), { clientId: "t_other" });

    const all = await listScans(h.ctx(OWNER));
    expect(all).toHaveLength(2);
    expect(all[0]!.clientId).toBe("t_other"); // newest first
    expect(all.every((s) => typeof s.progress === "number")).toBe(true);
  });

  it("filters by client for an internal caller", async () => {
    const h = harness();
    await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    await createScan(h.ctx(OWNER), { clientId: "t_other" });
    const acme = await listScans(h.ctx(OWNER), { clientId: "t_acme" });
    expect(acme).toHaveLength(1);
    expect(acme[0]!.clientId).toBe("t_acme");
  });

  it("rejects an unknown status filter and an out-of-range limit", async () => {
    const h = harness();
    await expect(listScans(h.ctx(OWNER), { statuses: ["nonsense"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(listScans(h.ctx(OWNER), { limit: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(listScans(h.ctx(OWNER), { limit: 9999 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("a client actor is forbidden (internal-only read capability)", async () => {
    const h = harness();
    await expect(listScans(h.ctx(CLIENT))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ===== timeline ============================================================== */
describe("getScanTimeline", () => {
  it("returns sequence-ordered UI entries, never raw runtime events", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    for (let i = 0; i < 3; i += 1) { await h.services.coordinator.runOnce("w1", executor); h.advance(500); }

    const timeline = await getScanTimeline(h.ctx(OWNER), created.id);
    expect(timeline.length).toBeGreaterThan(0);
    const seqs = timeline.map((e) => e.sequence);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    // UI shape only — no aggregateType/aggregateId/correlationId leak
    expect(timeline[0]).toHaveProperty("type");
    expect(timeline[0]).not.toHaveProperty("aggregateType");
    expect(timeline[0]).not.toHaveProperty("correlationId");
  });
});

/* ===== report / proposal / narrative ========================================= */
describe("report / proposal / narrative", () => {
  it("404s a report until a VALID report artifact exists, then returns it", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    await expect(getScanReport(h.ctx(OWNER), created.id)).rejects.toBeInstanceOf(NotFoundError);

    const run = h.repo.allRuns()[0]!;
    await h.services.artifacts.persist({
      runId: run.id, clientId: run.clientId, scanId: run.scanId,
      kind: "internal_intelligence_report", envelope: { headline: "ok" }, validationStatus: "valid",
    });
    const report = await getScanReport(h.ctx(OWNER), created.id);
    expect(report.kind).toBe("internal_intelligence_report");
    expect(report.content).toMatchObject({ headline: "ok" });
  });

  it("only exposes an APPROVED proposal", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    const run = h.repo.allRuns()[0]!;
    const base = { runId: run.id, clientId: run.clientId, scanId: run.scanId, envelope: { body: 1 } };

    await h.services.proposals.save({ ...base, status: "draft" });
    await expect(getScanProposal(h.ctx(OWNER), created.id)).rejects.toBeInstanceOf(NotFoundError);

    // a later approved version is exposed
    const draft = await h.services.proposals.latest(run.id);
    if (draft.ok) await h.services.proposals.supersede(draft.value, { body: 2 }, "approved_for_send");
    const proposal = await getScanProposal(h.ctx(OWNER), created.id);
    expect(proposal.kind).toBe("proposal");
    expect(proposal.status).toBe("approved_for_send");
  });

  it("returns the audience-specific approved narrative and rejects a bad audience", async () => {
    const h = harness();
    const created = await createScan(h.ctx(OWNER), { clientId: "t_acme" });
    const run = h.repo.allRuns()[0]!;
    await h.services.narratives.save({ runId: run.id, clientId: run.clientId, scanId: run.scanId, envelope: { text: "hi" }, audience: "client", status: "approved" });
    await h.services.narratives.save({ runId: run.id, clientId: run.clientId, scanId: run.scanId, envelope: { text: "draft" }, audience: "board", status: "draft" });

    const client = await getScanNarrative(h.ctx(OWNER), created.id, "client");
    expect(client.audience).toBe("client");
    expect(client.content).toMatchObject({ text: "hi" });

    // board narrative is not approved → 404
    await expect(getScanNarrative(h.ctx(OWNER), created.id, "board")).rejects.toBeInstanceOf(NotFoundError);
    // invalid audience → 422
    await expect(getScanNarrative(h.ctx(OWNER), created.id, "martians")).rejects.toBeInstanceOf(ValidationError);
  });
});
