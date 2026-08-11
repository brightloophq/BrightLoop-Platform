/* =============================================================================
 * Commercial package use-cases — review gate authorization + fold (deterministic).
 *
 * Proves the human review gate at the application boundary: a generated package is
 * NOT auto-approved; only the grant authority (owner/admin) may decide; a client
 * role can never read internal prospect intelligence; decisions are an auditable,
 * last-writer-wins fold of the append-only event log.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
import { runCompetitorIntelligence } from "@brightloop/domain";
import { getScanCommercialProposal, getScanClientNarrative, getProspectPackageReview, decideProspectPackage, advanceCommercialWorkflow } from "./commercial.js";

const T0 = "2026-08-09T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

function harness() {
  const now = () => T0;
  let counter = 0;
  const ids = (prefix: string) => `${prefix}_${(++counter).toString().padStart(4, "0")}`;
  const repo = new InMemoryRuntimeRepository(now);
  const services = createRuntimeServices({ repo, ids, clock: now, actorId: "u_owner" });
  const ctx = (actor: Actor): AppContext => ({ services, actor, ids, clock: now });
  return { services, ctx, repo };
}

/** Seed a COMPLETED core scan with the artifacts + core queue jobs a real run has. */
async function seedCompletedCoreScan(services: RuntimeServices): Promise<string> {
  const run = await services.runs.createRun({ clientId: null, scanId: "scan-live" });
  if (!run.ok) throw new Error("run");
  const runId = run.value.id;
  const b = { runId, clientId: null, scanId: "scan-live", version: 1 as const };

  // Core artifacts the commercial stages read (competitor: manifest+bundle; proposal: report+C9).
  await services.artifacts.persist({ ...b, kind: "discovery_manifest", envelope: { pages: [{ outcome: "ok", kind: "homepage", finalUrl: "https://zeevents.xyz/", extract: { externalLinks: [], socialLinks: [] } }], observability: { fetched: 1, planned: 1 } } });
  await services.artifacts.persist({ ...b, kind: "evidence_bundle", envelope: { scanId: "scan-live", items: [] } });
  const c8 = runCompetitorIntelligence({ scanId: "scan-live", evidence: [], now: T0 }); // no competitor evidence → unavailable
  await services.artifacts.persist({ ...b, kind: "competitor_snapshot", envelope: c8 as unknown as Record<string, unknown>, checksum: c8.checksum });
  await services.artifacts.persist({ ...b, kind: "internal_intelligence_report", envelope: { kind: "internal_intelligence_report", scanId: "scan-live", executiveOverview: "ZeEvents runs ticketed events.", indexSummary: "Overall maturity 55/100.", risks: [{ title: "Slow pages", severity: "high", category: "performance", description: "Home page slow.", evidenceIds: ["ev1"] }], opportunities: [{ title: "SEO gap", businessImpact: "More traffic", evidenceIds: ["ev2"] }], confidence: { value: 60, band: "moderate" } } });
  await services.artifacts.persist({ ...b, kind: "proposal", envelope: { status: "available", reason: null, proposals: [{ id: "pi_1", title: "Improve performance", problem: "Slow", recommendedSolution: "Optimize", businessImpact: "Lower bounce", priority: "high", estimatedEffort: "Medium", dependencies: [], risks: [], confidence: { value: 70, band: "high" }, supportingEvidenceIds: ["ev1"], reviewRequired: true, status: "ready" }], counts: { critical: 0, high: 1, medium: 0, low: 0 }, confidence: { value: 70, band: "high" }, summary: "1 proposal", reviewRequired: true } });

  // Real runs leave many CORE `advance_stage` queue rows — these must NOT be mistaken
  // for an existing commercial workflow (the queue key includes the job type).
  for (const stage of ["discovery_planning", "evidence_validation", "report_assembly"]) {
    await services.queue.enqueue({ jobType: "advance_stage", clientId: null, runId, scanId: "scan-live", stage });
  }
  await services.runs.completeRun(runId);
  return runId;
}

async function seedPackage(services: RuntimeServices): Promise<string> {
  const run = await services.runs.createRun({ clientId: null, scanId: "scan-x" });
  if (!run.ok) throw new Error("run");
  const runId = run.value.id;
  const b = { runId, clientId: null, scanId: "scan-x", version: 1 as const, sourceArtifactIds: ["a1"] };
  await services.proposals.save({ ...b, envelope: { status: "draft_ready", commercialState: "needs_pricing" }, checksum: "cp1", status: "needs_review" });
  await services.narratives.save({ ...b, envelope: { audience: "client", status: "ready" }, checksum: "cn1", audience: "client", status: "needs_review" });
  return runId;
}

describe("commercial package — reads", () => {
  it("exposes the latest draft (any status) to internal reviewers", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    const p = await getScanCommercialProposal(ctx(OWNER), runId);
    expect(p.status).toBe("needs_review");
    expect(p.content["commercialState"]).toBe("needs_pricing");
    const n = await getScanClientNarrative(ctx(OWNER), runId);
    expect(n.audience).toBe("client");
  });

  it("denies a client role access to internal prospect intelligence", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    await expect(getScanCommercialProposal(ctx(CLIENT), runId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("commercial package — review gate", () => {
  it("a generated package is pending, not approved", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    expect((await getProspectPackageReview(ctx(OWNER), runId)).decision).toBe("pending");
  });

  it("only the grant authority (owner/admin) may decide — team_member is forbidden", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    await expect(decideProspectPackage(ctx(TEAM), runId, { action: "approve" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("owner can approve; the decision is recorded with the actor", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    const decided = await decideProspectPackage(ctx(OWNER), runId, { action: "approve", note: "looks good" });
    expect(decided.decision).toBe("approved");
    expect(decided.decidedBy).toBe("u_owner");
    expect(decided.note).toBe("looks good");
  });

  it("the fold is last-writer-wins — a later revision request supersedes an approval", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    await decideProspectPackage(ctx(OWNER), runId, { action: "approve" });
    await decideProspectPackage(ctx(OWNER), runId, { action: "request_revision", note: "tighten scope" });
    const review = await getProspectPackageReview(ctx(OWNER), runId);
    expect(review.decision).toBe("revision_requested");
    expect(review.note).toBe("tighten scope");
  });
});

/* ---------------------------------------------------------------------------
 * advanceCommercialWorkflow — regression for the live kickoff failure:
 * completed core scan + zero commercial jobs → server-authoritative advance
 * creates exactly one commercial job and assembles the package on the spot.
 * ------------------------------------------------------------------------- */
describe("advanceCommercialWorkflow — server-authoritative kickoff", () => {
  it("kicks off + assembles the package for a completed run with core jobs but zero commercial jobs", async () => {
    const { services, ctx, repo } = harness();
    const runId = await seedCompletedCoreScan(services);

    // Reproduce the live DB state: completed run, core jobs present, zero commercial.
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(0);
    expect(repo.allJobs().filter((j) => j.jobType === "advance_stage").length).toBeGreaterThan(0);

    const advance = await advanceCommercialWorkflow(ctx(OWNER), runId);
    expect(advance.kickoff).toBe("created");

    // Kickoff created exactly ONE first-stage job (core advance_stage rows did not
    // mask it into a false "already started" replay — the queue key includes the
    // job type). Proven by a single `enqueued` event; the workflow then advances one
    // job per stage (competitor → proposal → narrative).
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.enqueued")).toHaveLength(1);
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(3);

    // The whole package assembled synchronously in this call.
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.ready_for_review")).toHaveLength(1);
    const proposal = await getScanCommercialProposal(ctx(OWNER), runId);
    expect(proposal.status).toBe("needs_review");
    expect(proposal.content["commercialState"]).toBe("needs_pricing");
    const narrative = await getScanClientNarrative(ctx(OWNER), runId);
    expect(narrative.audience).toBe("client");
    // Competitor was a legitimate insufficient_evidence outcome (still core v1, unavailable).
    const comp = await services.artifacts.listByKind(runId, "competitor_snapshot");
    expect(comp.ok && comp.value.map((s) => s.version)).toEqual([1]);
  });

  it("is idempotent — a re-render (second advance) never duplicates the job, event, or artifacts", async () => {
    const { services, ctx, repo } = harness();
    const runId = await seedCompletedCoreScan(services);
    await advanceCommercialWorkflow(ctx(OWNER), runId);
    const again = await advanceCommercialWorkflow(ctx(OWNER), runId);
    expect(again.kickoff).toBe("replayed");
    expect(again.turns).toBe(0); // nothing left to drive — completed jobs are not re-leased

    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(3); // still 3, not 6
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.enqueued")).toHaveLength(1);
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.ready_for_review")).toHaveLength(1);
    const prop = await services.proposals.latest(runId);
    expect(prop.ok && prop.value.version).toBe(1);
    const narr = await services.narratives.latest(runId, "client");
    expect(narr.ok && narr.value.version).toBe(1);
  });

  it("skips (no enqueue) when the core run is not completed", async () => {
    const { services, ctx, repo } = harness();
    const run = await services.runs.createRun({ clientId: null, scanId: "scan-pending" });
    const runId = run.ok ? run.value.id : "";
    const advance = await advanceCommercialWorkflow(ctx(OWNER), runId);
    expect(advance.kickoff).toBe("skipped");
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(0);
  });

  it("denies a client role (internal-only kickoff)", async () => {
    const { services, ctx } = harness();
    const runId = await seedCompletedCoreScan(services);
    await expect(advanceCommercialWorkflow(ctx(CLIENT), runId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
