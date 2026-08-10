/* =============================================================================
 * Commercial workflow coordinator — DETERMINISTIC integration tests.
 *
 * Drives the post-scan commercial scheduler over the SAME InMemoryRuntimeRepository
 * the core runtime tests use — injected clock, counter ids, no I/O. Proves the full
 * competitor → proposal → narrative workflow: scan completion → enqueue (idempotent)
 * → each stage in order → evidence-only artifacts persisted to their version tables
 * → ready_for_review · refresh/retry produces no duplicate artifact · insufficient
 * evidence is a real terminal outcome · pricing is never invented · the core
 * pipeline is never re-entered.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { EngineEvidenceItem } from "@brightloop/schema";
import { InMemoryRuntimeRepository } from "../testing/in-memory-repository.js";
import { createRuntimeServices, type RuntimeServices } from "../services/index.js";
import { runCompetitorIntelligence } from "../../scan-engine/competitor-intelligence/runtime.js";
import { COMMERCIAL_STAGE_ORDER } from "./stages.js";
import type { CommercialStageResult } from "./types.js";

const T0 = "2026-08-09T00:00:00.000Z";
const START = { clientId: "c1", scanId: "scan-cw" };
const HOME = "https://acme.test/";
const SERVICES = "https://acme.test/services";

function harness(): { svc: RuntimeServices; repo: InMemoryRuntimeRepository; now: () => string } {
  const millis = new Date(T0).getTime();
  const now = () => new Date(millis).toISOString();
  let counter = 0;
  const ids = (prefix: string) => `${prefix}_${++counter}`;
  const repo = new InMemoryRuntimeRepository(now);
  const svc = createRuntimeServices({ repo, ids, clock: now });
  return { svc, repo, now };
}

function page(url: string, external: string[]): Record<string, unknown> {
  return { targetId: url, requestedUrl: url, finalUrl: url, outcome: "ok", kind: url === HOME ? "homepage" : "services", extract: { externalLinks: external, socialLinks: [] } };
}

function manifestEnvelope(pages: Array<Record<string, unknown>>): Record<string, unknown> {
  return { pages, observability: { fetched: pages.length, planned: pages.length } };
}

function pageEvidence(id: string, url: string): EngineEvidenceItem {
  return {
    id,
    scanId: START.scanId,
    source: "pages",
    state: "observed",
    timestamp: T0,
    freshness: { ageDays: 0, band: "fresh", score: 1 },
    reliability: 0.9,
    provenance: { origin: url, collectedAt: T0, method: "crawl", transformed: true, transformations: ["discovery-normalize"], stage: "normalization", providerId: null },
    confidence: { value: 80, band: "high", inputs: { coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1, provenanceQuality: 1 } },
    metadata: {},
    hash: `h_${id}`,
    affectedDomains: ["digital_presence"],
    citations: [url],
    visibility: "internal",
    value: { pageFetched: true },
  };
}

/** A minimal but schema-faithful internal report envelope (evidence-linked). */
function reportEnvelope(): Record<string, unknown> {
  return {
    kind: "internal_intelligence_report",
    scanId: START.scanId,
    executiveOverview: "Acme Ltd sells widgets to small businesses online.",
    indexSummary: "Overall digital maturity 60/100 across 4 assessable categories.",
    businessProfile: { identity: "Acme Ltd", category: "ecommerce" },
    readinessSummary: "Transformation readiness 55/100.",
    risks: [{ title: "Slow page performance", severity: "high", category: "performance", description: "The home page is slow to load.", evidenceIds: ["ev_home"] }],
    opportunities: [{ title: "Unaddressed SEO gap", businessImpact: "More organic traffic", evidenceIds: ["ev_services"] }],
    confidence: { value: 62, band: "moderate" },
  };
}

/** A minimal C9 proposal-intelligence snapshot envelope (kind `proposal`). */
function proposalSnapshotEnvelope(available: boolean): Record<string, unknown> {
  if (!available) return { status: "unavailable", reason: "insufficient_evidence", proposals: [], counts: { critical: 0, high: 0, medium: 0, low: 0 }, confidence: { value: 0, band: "very_low" }, reviewRequired: false };
  return {
    status: "available",
    reason: null,
    proposals: [
      { id: "pi_1", title: "Improve site performance", problem: "Slow pages", recommendedSolution: "Optimize assets and caching", businessImpact: "Lower bounce", priority: "high", estimatedEffort: "Medium", dependencies: [], risks: [], confidence: { value: 70, band: "high" }, supportingEvidenceIds: ["ev_home"], reviewRequired: true, status: "ready" },
      { id: "pi_2", title: "Close the SEO gap", problem: "Low visibility", recommendedSolution: "On-page SEO and content", businessImpact: "More traffic", priority: "medium", estimatedEffort: "Small", dependencies: [], risks: [], confidence: { value: 60, band: "moderate" }, supportingEvidenceIds: ["ev_services"], reviewRequired: true, status: "ready" },
    ],
    counts: { critical: 0, high: 1, medium: 1, low: 0 },
    confidence: { value: 60, band: "moderate" },
    summary: "2 evidence-backed proposals",
    reviewRequired: true,
  };
}

/** Seed a COMPLETED core scan: manifest, bundle, C8 v1, report, C9 proposal snapshot. */
async function seedCompletedScan(svc: RuntimeServices, external: string[], opts: { proposalAvailable?: boolean } = {}): Promise<{ runId: string }> {
  const run = await svc.runs.createRun(START);
  if (!run.ok) throw new Error("run");
  const runId = run.value.id;
  const base = { runId, clientId: START.clientId, scanId: START.scanId, version: 1 as const };

  const pages = [page(HOME, external), page(SERVICES, external)];
  const items = [pageEvidence("ev_home", HOME), pageEvidence("ev_services", SERVICES)];

  await svc.artifacts.persist({ ...base, kind: "discovery_manifest", envelope: manifestEnvelope(pages) });
  await svc.artifacts.persist({ ...base, kind: "evidence_bundle", envelope: { scanId: START.scanId, items } });
  const v1 = runCompetitorIntelligence({ scanId: START.scanId, evidence: items, now: T0 });
  await svc.artifacts.persist({ ...base, kind: "competitor_snapshot", envelope: v1 as unknown as Record<string, unknown>, checksum: v1.checksum });
  await svc.artifacts.persist({ ...base, kind: "internal_intelligence_report", envelope: reportEnvelope() });
  await svc.artifacts.persist({ ...base, kind: "proposal", envelope: proposalSnapshotEnvelope(opts.proposalAvailable ?? true) });
  await svc.runs.completeRun(runId);
  return { runId };
}

/** Drive the commercial queue to idle, returning each stage result in order. */
async function drainCommercial(svc: RuntimeServices, owner = "cw", max = 8): Promise<CommercialStageResult[]> {
  const out: CommercialStageResult[] = [];
  for (let i = 0; i < max; i += 1) {
    const t = await svc.commercial.runCommercialOnce(owner);
    if (!t.ok) throw new Error(`commercial turn failed: ${t.message}`);
    if (t.value === null) break;
    out.push(t.value);
  }
  return out;
}

describe("CommercialCoordinator — competitor stage", () => {
  it("enqueues on completion (idempotently) and revises the snapshot to AVAILABLE", async () => {
    const { svc, repo } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);

    const e1 = await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const e2 = await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    expect(e1).toMatchObject({ ok: true, code: "created" });
    expect(e2).toMatchObject({ ok: true, code: "replayed" }); // one job, not two
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(1);

    const turn = await svc.commercial.runCommercialOnce("cw-1");
    expect(turn.ok && turn.value?.stage).toBe("competitor_intelligence");
    expect(turn.ok && turn.value?.status).toBe("ready");
    expect(turn.ok && turn.value?.persisted).toBe("revised");

    const latest = await svc.artifacts.latest(runId, "competitor_snapshot");
    expect(latest.ok && latest.value?.version).toBe(2);
    const snap = latest.ok && latest.value ? (latest.value.envelope as Record<string, unknown>) : {};
    expect(snap["status"]).toBe("available");
    expect((snap["competitors"] as Array<{ name: string }>).map((c) => c.name)).toContain("rival.com");
  });

  it("reports insufficient_evidence and does NOT revise when nothing is verifiable", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, []); // no external references
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });

    const turn = await svc.commercial.runCommercialOnce("cw-1");
    expect(turn.ok && turn.value?.status).toBe("insufficient_evidence");
    expect(turn.ok && turn.value?.persisted).toBe("replayed"); // identical to v1 → no new version

    const latest = await svc.artifacts.latest(runId, "competitor_snapshot");
    expect(latest.ok && latest.value?.version).toBe(1);
  });

  it("returns null when the commercial queue is idle", async () => {
    const { svc } = harness();
    const idle = await svc.commercial.runCommercialOnce("cw-1");
    expect(idle.ok && idle.value).toBeNull();
  });
});

describe("CommercialCoordinator — proposal stage", () => {
  it("drafts a proposal from verified intelligence, needs_pricing, no invented price", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const results = await drainCommercial(svc);

    const proposalResult = results.find((r) => r.stage === "proposal_generation");
    expect(proposalResult?.status).toBe("ready");
    expect(proposalResult?.detail?.["needsPricing"]).toBe(true);

    const latest = await svc.proposals.latest(runId);
    expect(latest.ok).toBe(true);
    const p = latest.ok ? (latest.value.envelope as Record<string, unknown>) : {};
    expect(p["status"]).toBe("draft_ready");
    expect(p["commercialState"]).toBe("needs_pricing");
    expect(p["pricing"]).toBeNull(); // NEVER invented
    // Recommended work is copied verbatim from the C9 items, each keeping evidence.
    const work = p["recommendedWork"] as Array<{ sourceId: string; evidenceIds: string[] }>;
    expect(work.map((w) => w.sourceId)).toEqual(["pi_1", "pi_2"]);
    expect(work.every((w) => w.evidenceIds.length > 0)).toBe(true);
    // Competitor context flows in where competitor evidence exists.
    expect((p["competitorContext"] as { status: string } | null)?.status).toBe("available");
    expect(latest.ok && latest.value.status).toBe("needs_review"); // generated ≠ approved
  });

  it("is insufficient_evidence when proposal intelligence is unavailable", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, [], { proposalAvailable: false });
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const results = await drainCommercial(svc);

    const proposalResult = results.find((r) => r.stage === "proposal_generation");
    expect(proposalResult?.status).toBe("insufficient_evidence");
    const latest = await svc.proposals.latest(runId);
    const p = latest.ok ? (latest.value.envelope as Record<string, unknown>) : {};
    expect(p["status"]).toBe("insufficient_evidence");
    expect((p["recommendedWork"] as unknown[]).length).toBe(0); // nothing fabricated
  });
});

describe("CommercialCoordinator — narrative stage", () => {
  it("composes a client narrative from structured artifacts, review required, traceable", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    await drainCommercial(svc);

    const latest = await svc.narratives.latest(runId, "client");
    expect(latest.ok).toBe(true);
    const n = latest.ok ? (latest.value.envelope as Record<string, unknown>) : {};
    expect(n["audience"]).toBe("client");
    expect(n["status"]).toBe("ready");
    const sections = n["sections"] as Array<{ key: string; paragraphs: string[]; supportingArtifacts: string[] }>;
    expect(sections.map((s) => s.key)).toEqual(["observed", "challenges", "opportunities", "recommendation", "rationale", "next_step"]);
    // The recommendation section traces to the proposal artifact; content sections to the report.
    const recommendation = sections.find((s) => s.key === "recommendation")!;
    expect(recommendation.supportingArtifacts.length).toBeGreaterThan(0);
    expect(recommendation.paragraphs.join(" ")).toContain("Improve site performance");
    expect(latest.ok && latest.value.status).toBe("needs_review"); // generated ≠ approved
  });
});

describe("CommercialCoordinator — full workflow", () => {
  it("runs competitor → proposal → narrative in order, then ready_for_review — exactly once", async () => {
    const { svc, repo } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const results = await drainCommercial(svc);

    expect(results.map((r) => r.stage)).toEqual([...COMMERCIAL_STAGE_ORDER]);
    const readyEvents = repo.allEvents().filter((e) => e.eventType === "runtime.commercial.ready_for_review");
    expect(readyEvents).toHaveLength(1);
  });

  it("refresh/resume produces no duplicate artifacts", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    await drainCommercial(svc);

    // A refresh re-enqueues completion and re-drives — nothing new must be produced.
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const second = await drainCommercial(svc);
    expect(second).toHaveLength(0); // completed jobs are not re-leased

    const comp = await svc.artifacts.listByKind(runId, "competitor_snapshot");
    expect(comp.ok && comp.value.map((s) => s.version).sort()).toEqual([1, 2]);
    const prop = await svc.proposals.latest(runId);
    expect(prop.ok && prop.value.version).toBe(1);
    const narr = await svc.narratives.latest(runId, "client");
    expect(narr.ok && narr.value.version).toBe(1);
  });
});

/* ---------------------------------------------------------------------------
 * Durable kickoff (resume-on-refresh) — regression for the live-preview defect:
 * a completed core scan whose single synchronous trigger never enqueued anything.
 * ------------------------------------------------------------------------- */
describe("CommercialCoordinator — durable kickoff", () => {
  it("recovers when the completion request MISSED the kickoff: a refresh ensures exactly one job + one enqueued event, then the workflow completes", async () => {
    const { svc, repo } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);

    // Reproduce the live failure: the core run is completed but NOTHING commercial
    // was enqueued (no synchronous trigger fired).
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(0);
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.enqueued")).toHaveLength(0);

    // The refresh / continuation endpoint calls the server-authoritative seam.
    const started = await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    expect(started).toMatchObject({ ok: true, code: "created" });
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(1);
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.enqueued")).toHaveLength(1);

    // …and the workflow then progresses to completion.
    const results = await drainCommercial(svc);
    expect(results.map((r) => r.stage)).toEqual([...COMMERCIAL_STAGE_ORDER]);
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.ready_for_review")).toHaveLength(1);
  });

  it("ensureStarted is idempotent — repeated refreshes never duplicate the job or the enqueued event", async () => {
    const { svc, repo } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);

    const a = await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    const b = await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    const c = await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    expect(a).toMatchObject({ ok: true, code: "created" });
    expect(b).toMatchObject({ ok: true, code: "replayed" });
    expect(c).toMatchObject({ ok: true, code: "replayed" });
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(1);
    expect(repo.allEvents().filter((e) => e.eventType === "runtime.commercial.enqueued")).toHaveLength(1);
  });

  it("ensureStarted after the workflow has advanced does not restart or duplicate it", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);
    await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    await drainCommercial(svc); // full workflow completes

    // A later refresh must not re-run any stage or add versions.
    const again = await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    expect(again).toMatchObject({ ok: true, code: "replayed" });
    const redrive = await drainCommercial(svc);
    expect(redrive).toHaveLength(0);

    const prop = await svc.proposals.latest(runId);
    expect(prop.ok && prop.value.version).toBe(1);
    const narr = await svc.narratives.latest(runId, "client");
    expect(narr.ok && narr.value.version).toBe(1);
  });

  it("surfaces a stage failure as commercial.stage_failed instead of failing silently", async () => {
    const { svc, repo } = harness();
    // Seed a COMPLETED scan that is missing the internal_intelligence_report, so the
    // proposal stage errs after competitor succeeds.
    const run = await svc.runs.createRun(START);
    if (!run.ok) throw new Error("run");
    const runId = run.value.id;
    const base = { runId, clientId: START.clientId, scanId: START.scanId, version: 1 as const };
    const pages = [page(HOME, ["https://rival.com/"]), page(SERVICES, ["https://rival.com/"])];
    const items = [pageEvidence("ev_home", HOME), pageEvidence("ev_services", SERVICES)];
    await svc.artifacts.persist({ ...base, kind: "discovery_manifest", envelope: manifestEnvelope(pages) });
    await svc.artifacts.persist({ ...base, kind: "evidence_bundle", envelope: { scanId: START.scanId, items } });
    const v1 = runCompetitorIntelligence({ scanId: START.scanId, evidence: items, now: T0 });
    await svc.artifacts.persist({ ...base, kind: "competitor_snapshot", envelope: v1 as unknown as Record<string, unknown>, checksum: v1.checksum });
    await svc.artifacts.persist({ ...base, kind: "proposal", envelope: proposalSnapshotEnvelope(true) });
    // (no internal_intelligence_report on purpose)
    await svc.runs.completeRun(runId);

    await svc.commercial.ensureStarted({ runId, scanId: START.scanId, clientId: START.clientId });
    const competitor = await svc.commercial.runCommercialOnce("cw");
    expect(competitor.ok && competitor.value?.stage).toBe("competitor_intelligence");
    const proposal = await svc.commercial.runCommercialOnce("cw");
    expect(proposal.ok).toBe(false); // the stage errored (report missing)

    const failed = repo.allEvents().filter((e) => e.eventType === "runtime.commercial.stage_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.stage).toBe("proposal_generation");
  });
});
