/* =============================================================================
 * Narrative Engine runtime integration tests (Phase C · Sprint C10).
 *
 * Proves the narrative step PARTICIPATES in the deterministic runtime as the
 * PRESENTATION layer — it runs inside report_assembly, persists a `narrative`
 * artifact, is consumed back into the report as the presentation section, and
 * lets the runtime continue (UNAVAILABLE when intelligence is insufficient). No
 * provider, no network — deterministic and idempotent.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { createIntelligenceStageRegistry, type IntelligenceStageSupport } from "./stage-executors.js";

const T0 = "2026-07-25T00:00:00.000Z";
let services: RuntimeServices;
let run: RuntimeRun;

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

async function narrativeSnapshot(): Promise<Record<string, unknown>> {
  const a = await services.artifacts.latest(run.id, "narrative");
  if (!a.ok || !a.value) throw new Error("no narrative artifact");
  return a.value.envelope;
}

async function runFullSpine(): Promise<void> {
  await persist("discovery_manifest", MANIFEST);
  for (const stage of SPINE) await runStage(stage);
}

describe("narrative engine — runtime participation", () => {
  it("report_assembly persists a narrative artifact and consumes it as the report presentation section", async () => {
    await runFullSpine();
    const snap = await narrativeSnapshot();
    expect(snap["status"]).toBe("available");
    expect((snap["sections"] as unknown[]).length).toBeGreaterThan(0);

    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    if (!report.ok || !report.value) throw new Error("report");
    const section = report.value.envelope["narrative"] as Record<string, unknown>;
    expect(section["status"]).toBe("available");
    expect((section["sections"] as unknown[]).length).toBe((snap["sections"] as unknown[]).length);
  });

  it("every narrative block traces to evidence or artifacts and requires review", async () => {
    await runFullSpine();
    const snap = await narrativeSnapshot();
    const sections = snap["sections"] as { supportingEvidenceIds: string[]; supportingArtifacts: string[]; reviewRequired: boolean }[];
    for (const s of sections) {
      expect(s.reviewRequired).toBe(true);
      expect(s.supportingEvidenceIds.length + s.supportingArtifacts.length).toBeGreaterThan(0);
    }
  });

  it("chains report lineage to the narrative artifact", async () => {
    await runFullSpine();
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const narrative = await services.artifacts.latest(run.id, "narrative");
    if (!report.ok || !report.value || !narrative.ok || !narrative.value) throw new Error("missing");
    expect(report.value.sourceArtifactIds).toContain(narrative.value.id);
  });

  it("never raises narrative confidence above the report confidence it presents", async () => {
    await runFullSpine();
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const snap = await narrativeSnapshot();
    if (!report.ok || !report.value) throw new Error("report");
    const reportConf = (report.value.envelope["confidence"] as { value: number }).value;
    expect((snap["confidence"] as { value: number }).value).toBeLessThanOrEqual(reportConf);
  });
});

describe("narrative engine — provider independence & replay", () => {
  it("is UNCHANGED whether or not a provider outcome exists (deterministic, provider-independent)", async () => {
    await runFullSpine();
    const withoutProvider = (await narrativeSnapshot())["checksum"];

    await freshRun();
    await persist("discovery_manifest", MANIFEST);
    await runStage("evidence_validation");
    await persist("execution_outcomes", { jobId: "j", finalStatus: "succeeded", claims: [] });
    for (const s of ["graph_assembly", "graph_snapshot", "reasoning_job_creation", "provider_routing", "grounding_validation", "finding_synthesis", "recommendation_candidates", "report_assembly"] as PipelineRunStage[]) await runStage(s);
    const withProvider = (await narrativeSnapshot())["checksum"];

    expect(withProvider).toBe(withoutProvider);
  });

  it("resume: re-running report_assembly replays without duplicating the narrative", async () => {
    await runFullSpine();
    const first = await services.artifacts.listByKind(run.id, "narrative");
    const checksum = first.ok ? first.value[0]!.checksum : "";

    await runStage("report_assembly"); // resume / re-run
    const after = await services.artifacts.listByKind(run.id, "narrative");
    expect(after.ok && after.value).toHaveLength(1); // no duplicate version
    expect(after.ok ? after.value[0]!.checksum : "").toBe(checksum);
  });
});
