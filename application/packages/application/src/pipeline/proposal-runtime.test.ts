/* =============================================================================
 * Proposal Intelligence runtime integration tests (Phase C · Sprint C9).
 *
 * Proves the proposal step PARTICIPATES in the deterministic runtime — it runs
 * inside recommendation_candidates (recommendations → proposal), persists a
 * `proposal` artifact, surfaces a bounded report section, and lets the runtime
 * CONTINUE regardless (UNAVAILABLE when evidence is insufficient). No provider,
 * no network — deterministic and idempotent.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { createIntelligenceStageRegistry, type IntelligenceStageSupport } from "./stage-executors.js";

const T0 = "2026-07-25T00:00:00.000Z";
let services: RuntimeServices;
let run: RuntimeRun;

/** A weak page — missing SEO/security signals, so Prospect Intelligence yields
 *  weaknesses and therefore recommendation candidates the proposal step consumes. */
function page(kind: string): Record<string, unknown> {
  return {
    targetId: `t:${kind}`, requestedUrl: `http://acme.test/${kind}`, finalUrl: `http://acme.test/${kind}`, status: 200, kind, outcome: "ok", reason: null,
    bytes: 40000, lastModified: T0, collectedAt: T0,
    extract: {
      title: "", metaDescription: "", canonicalUrl: null, language: null,
      headings: [], visibleText: "welcome", internalLinks: [], externalLinks: [],
      forms: [], emails: [], phones: [], socialLinks: [],
      jsonLdTypes: [], seo: { hasTitle: false, hasMetaDescription: false, hasCanonical: false, hasH1: false, h1Count: 0, wordCount: 20 },
      accessibility: { imageCount: 6, imagesWithAlt: 0, hasLangAttribute: false, hasViewportMeta: false },
    },
  };
}
const MANIFEST = {
  kind: "discovery_manifest",
  observability: { planned: 3, allowed: 3, fetched: 3, excluded: 0, failed: 0, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 120000, redirectCount: 0, durationMs: 100, robotsFetched: true, injectionFlaggedPages: 0, contentTypes: { "text/html": 3 } },
  pages: [page("homepage"), page("about"), page("services")],
};

const registry = () => createIntelligenceStageRegistry({ runtime: services, now: () => T0 });
const execFor = (s: IntelligenceStageSupport) => (s.kind === "executable" ? s.execute : null);

async function persist(kind: RuntimeArtifactKind, envelope: Record<string, unknown>, sourceArtifactIds: string[] = []): Promise<void> {
  const r = await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind, envelope, sourceArtifactIds, validationStatus: "valid" });
  if (!r.ok) throw new Error(`persist ${kind}`);
}

async function runStage(stage: PipelineRunStage): Promise<void> {
  const execute = execFor(registry().resolve(stage, run));
  if (execute === null) throw new Error(`${stage} not executable`);
  const work = await execute(stage, run);
  if (work.kind !== null && work.envelope !== null) await persist(work.kind, work.envelope, work.sourceArtifactIds);
}

const SPINE: PipelineRunStage[] = [
  "evidence_validation", "graph_assembly", "graph_snapshot", "reasoning_job_creation",
  "provider_routing", "grounding_validation", "finding_synthesis", "recommendation_candidates", "report_assembly",
];

async function freshRun(): Promise<void> {
  const now = () => T0;
  let c = 0;
  const repo = new InMemoryRuntimeRepository(now);
  services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  run = created.value.run;
}

beforeEach(freshRun);

async function proposalSnapshot(): Promise<Record<string, unknown>> {
  const a = await services.artifacts.latest(run.id, "proposal");
  if (!a.ok || !a.value) throw new Error("no proposal artifact");
  return a.value.envelope;
}

describe("proposal intelligence — runtime participation", () => {
  it("recommendation_candidates persists a proposal artifact", async () => {
    await persist("discovery_manifest", MANIFEST);
    for (const s of ["evidence_validation", "finding_synthesis", "recommendation_candidates"] as PipelineRunStage[]) await runStage(s);
    const snap = await proposalSnapshot();
    expect(["available", "unavailable"]).toContain(snap["status"]);
    // counts are coherent with the proposal set, and each proposal links to evidence
    const proposals = snap["proposals"] as { supportingEvidenceIds: string[]; priority: string }[];
    const counts = snap["counts"] as { critical: number; high: number; medium: number; low: number };
    expect(counts.critical + counts.high + counts.medium + counts.low).toBe(proposals.length);
    for (const p of proposals) expect(p.supportingEvidenceIds.length).toBeGreaterThan(0);
  });

  it("produces evidence-backed proposals for a weak site (available)", async () => {
    await persist("discovery_manifest", MANIFEST);
    for (const s of ["evidence_validation", "finding_synthesis", "recommendation_candidates"] as PipelineRunStage[]) await runStage(s);
    const snap = await proposalSnapshot();
    expect(snap["status"]).toBe("available");
    expect((snap["proposals"] as unknown[]).length).toBeGreaterThan(0);
    expect(snap["reviewRequired"]).toBe(true);
  });

  it("the full runtime spine completes to a report with a proposal-intelligence section", async () => {
    await persist("discovery_manifest", MANIFEST);
    for (const stage of SPINE) await runStage(stage);
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    if (!report.ok || !report.value) throw new Error("report");
    const section = report.value.envelope["proposalIntelligence"] as Record<string, unknown>;
    expect(["available", "unavailable"]).toContain(section["status"]);
    const snap = await proposalSnapshot();
    expect(section["proposalCount"]).toBe((snap["proposals"] as unknown[]).length);
  });

  it("chains report lineage to the proposal snapshot", async () => {
    await persist("discovery_manifest", MANIFEST);
    for (const stage of SPINE) await runStage(stage);
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const proposal = await services.artifacts.latest(run.id, "proposal");
    if (!report.ok || !report.value || !proposal.ok || !proposal.value) throw new Error("missing");
    expect(report.value.sourceArtifactIds).toContain(proposal.value.id);
  });
});

describe("proposal intelligence — provider independence & replay", () => {
  async function driveToProposal(): Promise<void> {
    await persist("discovery_manifest", MANIFEST);
    for (const s of ["evidence_validation", "finding_synthesis", "recommendation_candidates"] as PipelineRunStage[]) await runStage(s);
  }

  it("is UNCHANGED whether or not a provider outcome exists (deterministic, provider-independent)", async () => {
    await driveToProposal();
    const withoutProvider = (await proposalSnapshot())["checksum"];

    await freshRun();
    await persist("discovery_manifest", MANIFEST);
    await runStage("evidence_validation");
    await persist("execution_outcomes", { jobId: "j", finalStatus: "succeeded", claims: [] });
    await runStage("finding_synthesis");
    await runStage("recommendation_candidates");
    const withProvider = (await proposalSnapshot())["checksum"];

    expect(withProvider).toBe(withoutProvider);
  });

  it("resume: re-running recommendation_candidates replays without duplicating the proposal", async () => {
    await driveToProposal();
    const first = await services.artifacts.listByKind(run.id, "proposal");
    const checksum = first.ok ? first.value[0]!.checksum : "";

    await runStage("recommendation_candidates"); // resume / re-run
    const after = await services.artifacts.listByKind(run.id, "proposal");
    expect(after.ok && after.value).toHaveLength(1); // no duplicate version
    expect(after.ok ? after.value[0]!.checksum : "").toBe(checksum);
  });
});
