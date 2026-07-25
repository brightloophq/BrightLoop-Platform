/* =============================================================================
 * Competitor Intelligence runtime integration tests (Phase C · Sprint C8).
 *
 * Proves the competitor step PARTICIPATES in the deterministic runtime — it runs
 * inside finding_synthesis (competitor → prospect), persists a `competitor_snapshot`
 * artifact, surfaces a bounded report section, and lets the runtime CONTINUE when
 * competitor evidence is absent (status UNAVAILABLE, never a failure). No provider,
 * no network — deterministic and idempotent.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { EngineEvidenceItem, PipelineRunStage, RuntimeArtifact, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { createIntelligenceStageRegistry, type IntelligenceStageSupport } from "./stage-executors.js";

const T0 = "2026-07-25T00:00:00.000Z";
let services: RuntimeServices;
let run: RuntimeRun;

function page(kind: string): Record<string, unknown> {
  return {
    targetId: `t:${kind}`, requestedUrl: `https://acme.test/${kind}`, finalUrl: `https://acme.test/${kind}`, status: 200, kind, outcome: "ok", reason: null,
    bytes: 100000, lastModified: T0, collectedAt: T0,
    extract: {
      title: "Acme Dental", metaDescription: "Care in Kingston", canonicalUrl: `https://acme.test/${kind}`, language: "en",
      headings: ["A", "B"], visibleText: "dental clinic implants therapy consulting", internalLinks: ["https://acme.test/about"], externalLinks: [],
      forms: [{ method: "post", action: "/x", inputCount: 2 }], emails: ["a@acme.test"], phones: [], socialLinks: ["https://facebook.com/acme"],
      jsonLdTypes: ["Organization"], seo: { hasTitle: true, hasMetaDescription: true, hasCanonical: true, hasH1: true, h1Count: 1, wordCount: 700 },
      accessibility: { imageCount: 5, imagesWithAlt: 5, hasLangAttribute: true, hasViewportMeta: true },
    },
  };
}
const MANIFEST = {
  kind: "discovery_manifest",
  observability: { planned: 3, allowed: 3, fetched: 3, excluded: 0, failed: 0, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 300000, redirectCount: 0, durationMs: 100, robotsFetched: true, injectionFlaggedPages: 0, contentTypes: { "text/html": 3 } },
  pages: [page("homepage"), page("about"), page("services")],
};

/** A verified competitor evidence item (as a curated dataset / upload would supply). */
function competitorItem(id: string, value: Record<string, unknown>): EngineEvidenceItem {
  return {
    id, scanId: "scan", source: "competitors", state: "observed", timestamp: T0,
    freshness: { ageDays: 0, band: "fresh", score: 1 }, reliability: 0.9,
    provenance: { origin: "curated:dataset", collectedAt: T0, method: "imported", transformed: false, transformations: [], stage: "competitor_evidence", providerId: null },
    confidence: { value: 78, band: "high", inputs: { coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1, provenanceQuality: 1 } },
    metadata: {}, hash: `h_${id}`, affectedDomains: [], citations: [], visibility: "internal", value,
  };
}

const registry = () => createIntelligenceStageRegistry({ runtime: services, now: () => T0 });
const execFor = (s: IntelligenceStageSupport) => (s.kind === "executable" ? s.execute : null);

async function persist(kind: RuntimeArtifactKind, envelope: Record<string, unknown>, sourceArtifactIds: string[] = []): Promise<RuntimeArtifact> {
  const r = await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind, envelope, sourceArtifactIds, validationStatus: "valid" });
  if (!r.ok) throw new Error(`persist ${kind}`);
  return r.value;
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

/** Seed an evidence_bundle directly (bypassing crawl) so we can inject competitors. */
async function seedBundle(items: EngineEvidenceItem[]): Promise<RuntimeArtifact> {
  return persist("evidence_bundle", { scanId: "scan", items });
}

async function competitorSnapshot(): Promise<Record<string, unknown>> {
  const a = await services.artifacts.latest(run.id, "competitor_snapshot");
  if (!a.ok || !a.value) throw new Error("no competitor_snapshot");
  return a.value.envelope;
}

/* ===== unavailable path (the runtime NEVER fails on absence) ================== */
describe("competitor intelligence — unavailable path", () => {
  it("finding_synthesis persists an UNAVAILABLE snapshot when the bundle has no competitor evidence", async () => {
    await persist("discovery_manifest", MANIFEST);
    await runStage("evidence_validation");
    await runStage("finding_synthesis");
    const snap = await competitorSnapshot();
    expect(snap["status"]).toBe("unavailable");
    expect(snap["reason"]).toBe("no_competitor_evidence");
    expect(snap["reviewRequired"]).toBe(false);
  });

  it("the full runtime spine still completes to a report with a competitor-intelligence section (unavailable)", async () => {
    await persist("discovery_manifest", MANIFEST);
    for (const stage of SPINE) await runStage(stage);
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    if (!report.ok || !report.value) throw new Error("report");
    const section = report.value.envelope["competitorIntelligence"] as Record<string, unknown>;
    expect(section["status"]).toBe("unavailable");
    expect(section["competitorCount"]).toBe(0);
    expect(section["reason"]).toBe("no_competitor_evidence");
  });
});

/* ===== available path (injected verified competitor evidence) ================ */
describe("competitor intelligence — available path", () => {
  const competitors = (): EngineEvidenceItem[] => [
    competitorItem("ev_home", { hasTitle: true }),
    competitorItem("ev_a", { competitor: "Alpha", dimension: "ux", signal: "differentiator", statement: "Slick onboarding", marketPosition: "challenger" }),
    competitorItem("ev_b", { competitor: "Beta", dimension: "seo", signal: "weakness", statement: "Slow indexed pages" }),
  ];

  it("persists an AVAILABLE snapshot with ranked competitors and surfaces it in the report", async () => {
    await seedBundle(competitors());
    await runStage("finding_synthesis");
    await runStage("recommendation_candidates");
    await runStage("report_assembly");

    const snap = await competitorSnapshot();
    expect(snap["status"]).toBe("available");
    expect((snap["competitors"] as unknown[]).length).toBe(2);
    expect(snap["reviewRequired"]).toBe(true);

    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const section = (report.ok && report.value ? report.value.envelope["competitorIntelligence"] : {}) as Record<string, unknown>;
    expect(section["status"]).toBe("available");
    expect(section["competitorCount"]).toBe(2);
    expect(section["reviewRequired"]).toBe(true);
  });

  it("chains report lineage to the competitor snapshot", async () => {
    await seedBundle(competitors());
    for (const s of ["finding_synthesis", "recommendation_candidates", "report_assembly"] as PipelineRunStage[]) await runStage(s);
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const comp = await services.artifacts.latest(run.id, "competitor_snapshot");
    if (!report.ok || !report.value || !comp.ok || !comp.value) throw new Error("missing");
    expect(report.value.sourceArtifactIds).toContain(comp.value.id);
  });
});

/* ===== provider-independence + idempotency =================================== */
describe("competitor intelligence — provider independence & replay", () => {
  const bundle = (): EngineEvidenceItem[] => [competitorItem("ev_a", { competitor: "Alpha", signal: "strength", statement: "Strong brand" })];

  it("is UNCHANGED whether or not a provider outcome exists (deterministic, provider-independent)", async () => {
    // provider disabled
    await seedBundle(bundle());
    await runStage("finding_synthesis");
    const withoutProvider = (await competitorSnapshot())["checksum"];

    // fresh run WITH a provider execution outcome present
    await freshRun();
    await seedBundle(bundle());
    await persist("execution_outcomes", { jobId: "j", finalStatus: "succeeded", claims: [] });
    await runStage("finding_synthesis");
    const withProvider = (await competitorSnapshot())["checksum"];

    expect(withProvider).toBe(withoutProvider);
  });

  it("resume: re-running finding_synthesis replays without duplicating the competitor snapshot", async () => {
    await seedBundle(bundle());
    await runStage("finding_synthesis");
    const first = await services.artifacts.listByKind(run.id, "competitor_snapshot");
    const checksum = first.ok ? first.value[0]!.checksum : "";

    await runStage("finding_synthesis"); // resume / re-run
    const after = await services.artifacts.listByKind(run.id, "competitor_snapshot");
    expect(after.ok && after.value).toHaveLength(1); // no duplicate version
    expect(after.ok ? after.value[0]!.checksum : "").toBe(checksum);
  });
});
