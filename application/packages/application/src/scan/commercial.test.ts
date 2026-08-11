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
import { ForbiddenError, ValidationError } from "../errors.js";
import { runCompetitorIntelligence } from "@brightloop/domain";
import { getScanCommercialProposal, getScanClientNarrative, getProspectPackageReview, decideProspectPackage, advanceCommercialWorkflow, setProposalPricing } from "./commercial.js";

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

/** Seed a run with a FULL commercial proposal draft (two required work items). */
async function seedPricableProposal(services: RuntimeServices): Promise<string> {
  const run = await services.runs.createRun({ clientId: null, scanId: "scan-p" });
  if (!run.ok) throw new Error("run");
  const runId = run.value.id;
  const proposal = {
    id: "cp_1", scanId: "scan-p", clientId: null,
    status: "draft_ready", reason: null, commercialState: "needs_pricing", pricing: null,
    executiveSummary: "ZeEvents can lift conversion and search reach.",
    observedSituation: "Slow pages and thin search presence.",
    keyIssues: [], opportunities: [],
    recommendedWork: [
      { sourceId: "w1", title: "Website redesign", solution: "Rebuild core pages", priority: "high", effort: "Large", evidenceIds: ["ev1"] },
      { sourceId: "w2", title: "SEO setup", solution: "Technical + content", priority: "medium", effort: "Medium", evidenceIds: ["ev2"] },
    ],
    competitorContext: null, proposedNextStep: "Review scope and pricing.",
    supportingEvidenceIds: ["ev1", "ev2"], confidence: { value: 70, band: "high" },
    reviewRequired: true, sourceArtifacts: ["a1"], checksum: "cp", generatedAt: T0, formulaVersion: "commercial-proposal-1.0",
  };
  await services.proposals.save({ runId, clientId: null, scanId: "scan-p", version: 1, sourceArtifactIds: ["a1"], envelope: proposal, checksum: "cp", status: "needs_review" });
  return runId;
}

const priceOneTime = (sourceId: string, amountMinor: number) => ({ sourceId, pricingType: "one_time" as const, amountMinor });
const priceMonthly = (sourceId: string, amountMinor: number) => ({ sourceId, pricingType: "recurring" as const, cadence: "monthly" as const, amountMinor });

describe("setProposalPricing — admin authoritative pricing", () => {
  it("persists pricing, computes integer totals, and marks the proposal priced when all required items are priced", async () => {
    const { services, ctx } = harness();
    const runId = await seedPricableProposal(services);
    const dto = await setProposalPricing(ctx(OWNER), runId, {
      currency: "USD",
      items: [priceOneTime("w1", 120000), priceMonthly("w2", 30000)],
    });
    const pricing = dto.content["pricing"] as Record<string, unknown>;
    expect(dto.content["commercialState"]).toBe("priced");
    expect(pricing["totalOneTimeMinor"]).toBe(120000);
    expect(pricing["totalRecurringMonthlyMinor"]).toBe(30000);
    expect(pricing["pricedBy"]).toBe("u_owner");
    // Pricing NEVER approves — status is carried through.
    expect(dto.status).toBe("needs_review");
  });

  it("partial pricing leaves the proposal needs_pricing", async () => {
    const { services, ctx } = harness();
    const runId = await seedPricableProposal(services);
    const dto = await setProposalPricing(ctx(OWNER), runId, { currency: "USD", items: [priceOneTime("w1", 120000)] });
    expect(dto.content["commercialState"]).toBe("needs_pricing");
  });

  it("supersedes the version and a refresh preserves the pricing", async () => {
    const { services, ctx } = harness();
    const runId = await seedPricableProposal(services);
    await setProposalPricing(ctx(OWNER), runId, { currency: "USD", items: [priceOneTime("w1", 100), priceOneTime("w2", 200)] });
    const latest = await services.proposals.latest(runId);
    expect(latest.ok && latest.value.version).toBe(2); // v1 (generated) → v2 (priced)
    const refreshed = await getScanCommercialProposal(ctx(OWNER), runId);
    expect((refreshed.content["pricing"] as Record<string, unknown>)["subtotalOneTimeMinor"]).toBe(300);
  });

  it("does not alter the underlying evidence / recommended work", async () => {
    const { services, ctx } = harness();
    const runId = await seedPricableProposal(services);
    const dto = await setProposalPricing(ctx(OWNER), runId, { currency: "USD", items: [priceOneTime("w1", 100), priceOneTime("w2", 200)] });
    const work = dto.content["recommendedWork"] as Array<Record<string, unknown>>;
    expect(work.map((w) => w["sourceId"])).toEqual(["w1", "w2"]);
    expect(work[0]!["evidenceIds"]).toEqual(["ev1"]);
    expect(dto.content["supportingEvidenceIds"]).toEqual(["ev1", "ev2"]);
  });

  it("emits a safe, auditable pricing event (no raw copy)", async () => {
    const { services, ctx, repo } = harness();
    const runId = await seedPricableProposal(services);
    await setProposalPricing(ctx(OWNER), runId, { currency: "USD", items: [priceOneTime("w1", 120000), priceMonthly("w2", 30000)], discountMinor: 5000 });
    const ev = repo.allEvents().filter((e) => e.eventType === "runtime.proposal.pricing_updated");
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ by: "u_owner", currency: "USD", pricedItemCount: 2, hasRecurring: true, hasDiscount: true, commercialState: "priced" });
    // Safe metadata only — no proposal prose / evidence bodies in the event.
    expect(JSON.stringify(ev[0]!.payload)).not.toMatch(/redesign|evidence|ZeEvents/i);
  });

  it("rejects pricing that references an unknown work item (no phantom pricing)", async () => {
    const { services, ctx } = harness();
    const runId = await seedPricableProposal(services);
    await expect(setProposalPricing(ctx(OWNER), runId, { currency: "USD", items: [priceOneTime("nope", 100)] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows an internal team_member (scan.write) but DENIES a client role", async () => {
    const { services, ctx } = harness();
    const runId = await seedPricableProposal(services);
    await expect(setProposalPricing(ctx(TEAM), runId, { currency: "USD", items: [priceOneTime("w1", 100), priceOneTime("w2", 200)] })).resolves.toBeDefined();
    await expect(setProposalPricing(ctx(CLIENT), runId, { currency: "USD", items: [priceOneTime("w1", 100)] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

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
