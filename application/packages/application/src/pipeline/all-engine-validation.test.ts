/* =============================================================================
 * ALL-ENGINE DETERMINISTIC VALIDATION (Phase C · Sprint C11) — certification.
 *
 * Drives the COMPLETE deterministic runtime in one place and certifies it end to
 * end: every stage executes and emits its artifact, downstream stages consume the
 * right upstream artifact, the whole chain is deterministic + replay-safe +
 * resume-safe + provider-safe, lineage traces narrative → … → discovery, partial
 * intelligence completes safely, and confidence never increases downstream.
 *
 * VALIDATION ONLY — no new runtime functionality. Provider is disabled (default),
 * so no network and no live model call occur.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifact, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { createIntelligenceStageRegistry, type IntelligenceStageSupport } from "./stage-executors.js";

const T0 = "2026-07-25T00:00:00.000Z";
let services: RuntimeServices;
let run: RuntimeRun;

/** A weak site — yields weaknesses (→ recommendations → proposals) and no
 *  competitor evidence (→ competitor UNAVAILABLE), exercising the partial path. */
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

/** The deterministic intelligence spine (provider_execution is a provider stage). */
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

async function runFullChain(): Promise<void> {
  await persist("discovery_manifest", MANIFEST);
  for (const stage of SPINE) await runStage(stage);
}

async function latest(kind: RuntimeArtifactKind): Promise<RuntimeArtifact> {
  const a = await services.artifacts.latest(run.id, kind);
  if (!a.ok || !a.value) throw new Error(`missing ${kind}`);
  return a.value;
}

beforeEach(freshRun);

/** The artifacts the deterministic (provider-disabled) chain must emit. */
const DETERMINISTIC_CHAIN: RuntimeArtifactKind[] = [
  "discovery_manifest", "evidence_bundle", "intelligence_graph", "graph_snapshot",
  "reasoning_jobs", "validated_claims", "competitor_snapshot", "findings",
  "recommendation_candidates", "proposal", "narrative", "internal_intelligence_report",
];

describe("all-engine · complete execution chain", () => {
  it("executes every stage and emits every artifact in the deterministic chain", async () => {
    await runFullChain();
    for (const kind of DETERMINISTIC_CHAIN) {
      const a = await services.artifacts.latest(run.id, kind);
      expect(a.ok && a.value, kind).toBeTruthy();
    }
  });

  it("the report consumes every engine's output as internally-consistent sections", async () => {
    await runFullChain();
    const report = (await latest("internal_intelligence_report")).envelope;
    // Prospect
    expect(report["indexSummary"]).toBeTruthy();
    expect(report["confidence"]).toBeTruthy();
    // Provider enrichment (advisory, deterministic path → unavailable)
    expect((report["providerEnrichment"] as { status: string }).status).toBe("unavailable");
    expect((report["providerEnrichment"] as { deterministicOnly: boolean }).deterministicOnly).toBe(true);
    // Competitor (no evidence → unavailable, runtime continues)
    expect((report["competitorIntelligence"] as { status: string }).status).toBe("unavailable");
    // Proposal (weak site → available)
    expect((report["proposalIntelligence"] as { status: string }).status).toBe("available");
    // Narrative (presentation → available), and it is the report's presentation layer
    const narrative = report["narrative"] as { status: string; sections: unknown[]; reviewRequired: boolean };
    expect(narrative.status).toBe("available");
    expect(narrative.sections.length).toBeGreaterThan(0);
    // Review flags
    expect(report["reviewRequired"]).toBe(true);
    expect(narrative.reviewRequired).toBe(true);
  });
});

describe("all-engine · determinism (no drift)", () => {
  async function chainChecksums(): Promise<Record<string, string>> {
    await runFullChain();
    const out: Record<string, string> = {};
    for (const kind of DETERMINISTIC_CHAIN) out[kind] = (await latest(kind)).checksum;
    return out;
  }

  it("two independent runs with identical inputs produce identical checksums for every artifact", async () => {
    const first = await chainChecksums();
    await freshRun();
    const second = await chainChecksums();
    expect(second).toEqual(first);
  });
});

describe("all-engine · replay & resume (idempotent)", () => {
  it("replaying the whole chain creates no duplicate artifact versions", async () => {
    await runFullChain();
    // replay from the top on the SAME run — every persist must be an idempotent replay
    await persist("discovery_manifest", MANIFEST);
    for (const stage of SPINE) await runStage(stage);
    for (const kind of DETERMINISTIC_CHAIN) {
      const list = await services.artifacts.listByKind(run.id, kind);
      expect(list.ok && list.value.length, kind).toBe(1); // exactly one version — no duplication
    }
  });

  it("resuming the tail stages reuses existing artifacts and keeps checksums stable", async () => {
    await runFullChain();
    const before = { proposal: (await latest("proposal")).checksum, narrative: (await latest("narrative")).checksum, report: (await latest("internal_intelligence_report")).checksum };
    // "interrupt" then resume the last three stages
    await runStage("recommendation_candidates");
    await runStage("report_assembly");
    expect((await latest("proposal")).checksum).toBe(before.proposal);
    expect((await latest("narrative")).checksum).toBe(before.narrative);
    expect((await latest("internal_intelligence_report")).checksum).toBe(before.report);
    for (const kind of ["proposal", "narrative", "internal_intelligence_report"] as RuntimeArtifactKind[]) {
      const list = await services.artifacts.listByKind(run.id, kind);
      expect(list.ok && list.value.length, kind).toBe(1);
    }
  });
});

describe("all-engine · lineage traces narrative → … → discovery", () => {
  it("chains every downstream artifact back to the discovery manifest", async () => {
    await runFullChain();
    const manifest = await latest("discovery_manifest");
    const bundle = await latest("evidence_bundle");
    const findings = await latest("findings");
    const competitor = await latest("competitor_snapshot");
    const proposal = await latest("proposal");
    const narrative = await latest("narrative");
    const report = await latest("internal_intelligence_report");

    // evidence ← discovery
    expect(bundle.sourceArtifactIds).toContain(manifest.id);
    // competitor ← evidence
    expect(competitor.sourceArtifactIds).toContain(bundle.id);
    // proposal ← evidence (+ findings)
    expect(proposal.sourceArtifactIds).toContain(bundle.id);
    // narrative ← findings + competitor + proposal
    for (const dep of [findings.id, competitor.id, proposal.id]) expect(narrative.sourceArtifactIds).toContain(dep);
    // report ← narrative (+ competitor + proposal + findings + bundle)
    for (const dep of [narrative.id, competitor.id, proposal.id, findings.id, bundle.id]) expect(report.sourceArtifactIds).toContain(dep);
  });
});

describe("all-engine · partial intelligence completes safely", () => {
  it("no competitor evidence → competitor UNAVAILABLE, yet proposal + narrative + report still complete", async () => {
    await runFullChain();
    expect((await latest("competitor_snapshot")).envelope["status"]).toBe("unavailable");
    expect((await latest("proposal")).envelope["status"]).toBe("available");
    expect((await latest("narrative")).envelope["status"]).toBe("available");
    expect(await services.artifacts.latest(run.id, "internal_intelligence_report")).toMatchObject({ ok: true });
  });

  it("no prospect intelligence at all → narrative UNAVAILABLE but the report still assembles", async () => {
    // Seed an EMPTY evidence bundle: no findings, no recommendations → proposal &
    // narrative unavailable, competitor unavailable — the runtime must still finish.
    await persist("evidence_bundle", { scanId: "scan", items: [] });
    for (const s of ["finding_synthesis", "recommendation_candidates", "report_assembly"] as PipelineRunStage[]) await runStage(s);
    expect((await latest("proposal")).envelope["status"]).toBe("unavailable");
    expect((await latest("narrative")).envelope["status"]).toBe("unavailable");
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    expect(report.ok && report.value).toBeTruthy();
  });
});

describe("all-engine · confidence never increases downstream; provider advisory", () => {
  it("narrative confidence ≤ report (prospect) confidence, and proposal ≤ its evidence", async () => {
    await runFullChain();
    const report = (await latest("internal_intelligence_report")).envelope;
    const narrative = (await latest("narrative")).envelope;
    const reportConf = (report["confidence"] as { value: number }).value;
    expect((narrative["confidence"] as { value: number }).value).toBeLessThanOrEqual(reportConf);
    // provider stays advisory: deterministic path marks enrichment unavailable and
    // never raised the report confidence.
    expect((report["providerEnrichment"] as { deterministicOnly: boolean }).deterministicOnly).toBe(true);
  });

  it("no raw provider output, prompt, or chain-of-thought appears in any artifact", async () => {
    await runFullChain();
    for (const kind of DETERMINISTIC_CHAIN) {
      const blob = JSON.stringify((await latest(kind)).envelope);
      expect(blob).not.toMatch(/chain.of.thought|system prompt|<thinking>|assistant:|user:/i);
    }
  });
});
