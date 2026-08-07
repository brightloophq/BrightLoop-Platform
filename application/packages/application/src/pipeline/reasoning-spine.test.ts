/* =============================================================================
 * Reasoning-spine executor tests (Phase C · Sprint C6.2b) — deterministic.
 *
 * Proves the deterministic runtime spine from graph_snapshot through
 * report_assembly, the provider-OFF end-to-end completion, grounding against a
 * fixture provider outcome (valid + unsupported claims), and idempotent replay.
 * No live provider, no network — the deterministic path completes to a report
 * with the provider disabled, which is the default configuration.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices, StageWork } from "@brightloop/domain";
import { StageBlockedError, createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifact, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { createIntelligenceStageRegistry, type IntelligenceStageSupport } from "./stage-executors.js";

const T0 = "2026-07-24T00:00:00.000Z";

let services: RuntimeServices;
let run: RuntimeRun;

function page(kind: string): Record<string, unknown> {
  return {
    targetId: `t:${kind}`, requestedUrl: `https://acme.test/${kind}`, finalUrl: `https://acme.test/${kind}`, status: 200, kind, outcome: "ok", reason: null,
    bytes: 100000, lastModified: T0, collectedAt: T0,
    extract: {
      title: "Acme Dental", metaDescription: "Care in Kingston", canonicalUrl: `https://acme.test/${kind}`, language: "en",
      headings: ["A", "B"], visibleText: "dental clinic implants therapy consulting", internalLinks: ["https://acme.test/about"], externalLinks: [],
      forms: [{ method: "post", action: "/x", inputCount: 2 }], emails: ["a@acme.test"], phones: [], socialLinks: ["https://facebook.com/acme", "https://instagram.com/acme"],
      jsonLdTypes: ["Organization"], seo: { hasTitle: true, hasMetaDescription: true, hasCanonical: true, hasH1: true, h1Count: 1, wordCount: 700 },
      accessibility: { imageCount: 5, imagesWithAlt: 5, hasLangAttribute: true, hasViewportMeta: true },
    },
  };
}
const MANIFEST = {
  kind: "discovery_manifest",
  observability: { planned: 4, allowed: 3, fetched: 3, excluded: 1, failed: 0, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 300000, redirectCount: 0, durationMs: 100, robotsFetched: true, injectionFlaggedPages: 0, contentTypes: { "text/html": 3 } },
  pages: [page("homepage"), page("about"), page("services")],
};

const registry = () => createIntelligenceStageRegistry({ runtime: services, now: () => T0 });
const execFor = (support: IntelligenceStageSupport) => (support.kind === "executable" ? support.execute : null);

async function persist(kind: RuntimeArtifactKind, envelope: Record<string, unknown>, sourceArtifactIds: string[] = []): Promise<RuntimeArtifact> {
  const r = await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind, envelope, sourceArtifactIds, validationStatus: "valid" });
  if (!r.ok) throw new Error(`persist ${kind}`);
  return r.value;
}

/** Run one stage executor and persist its StageWork exactly as the engine would. */
async function runStage(stage: PipelineRunStage): Promise<StageWork> {
  const support = registry().resolve(stage, run);
  const execute = execFor(support);
  if (execute === null) throw new Error(`${stage} not executable`);
  const work = await execute(stage, run);
  if (work.kind !== null && work.envelope !== null) await persist(work.kind, work.envelope, work.sourceArtifactIds);
  return work;
}

/** The canonical deterministic spine, in order. */
const SPINE: PipelineRunStage[] = [
  "evidence_validation",
  "graph_assembly",
  "graph_snapshot",
  "reasoning_job_creation",
  "provider_routing",
  "grounding_validation",
  "finding_synthesis",
  "recommendation_candidates",
  "report_assembly",
];

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  const repo = new InMemoryRuntimeRepository(now);
  services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  run = created.value.run;
});

/* ===== registration ========================================================== */
describe("registration", () => {
  it("owns all nine deterministic stages and blocks provider_execution", () => {
    const r = registry();
    for (const stage of SPINE) expect(r.resolve(stage, run).kind).toBe("executable");
    expect(r.resolve("provider_execution", run).kind).toBe("blocked");
  });
});

/* ===== reasoning job creation ================================================ */
describe("reasoning_job_creation", () => {
  it("blocks without a graph snapshot", async () => {
    const e = execFor(registry().resolve("reasoning_job_creation", run))!;
    await expect(e("reasoning_job_creation", run)).rejects.toBeInstanceOf(StageBlockedError);
  });

  it("builds a deterministic job referencing the snapshot checksum and evidence ids", async () => {
    await persist("discovery_manifest", MANIFEST);
    await runStage("evidence_validation");
    await runStage("graph_assembly");
    const snap = await runStage("graph_snapshot");
    const work = await runStage("reasoning_job_creation");
    expect(work.kind).toBe("reasoning_jobs");
    const jobs = work.envelope!["jobs"] as { id: string; inputRefs: { graphSnapshotChecksum: string | null; evidenceIds: string[] } }[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.inputRefs.graphSnapshotChecksum).toBe(snap.envelope!["checksum"]);
    expect(jobs[0]!.inputRefs.evidenceIds.length).toBeGreaterThan(0);
    // no prompt or response persisted
    expect(JSON.stringify(work.envelope)).not.toMatch(/prompt|response|chain.of.thought/i);
  });

  it("creates the public.reasoning_jobs ledger row and the artifact carries its id (idempotent)", async () => {
    await persist("discovery_manifest", MANIFEST);
    await runStage("evidence_validation");
    await runStage("graph_assembly");
    await runStage("graph_snapshot");

    const work = await runStage("reasoning_job_creation");
    const jobId = (work.envelope!["jobs"] as { id: string }[])[0]!.id;
    // the artifact job id resolves to a real ledger row — the FK target for provider_attempts
    const ledger = await services.reasoning.get(jobId);
    expect(ledger.ok).toBe(true);
    expect(ledger.ok && ledger.value.stage).toBe("executive_summary");

    // idempotent: re-running the stage converges on the SAME canonical id
    const work2 = await runStage("reasoning_job_creation");
    expect((work2.envelope!["jobs"] as { id: string }[])[0]!.id).toBe(jobId);
  });
});

/* ===== provider routing (control-only) ======================================= */
describe("provider_routing", () => {
  it("is control-only: passes with reasoning jobs present and persists no artifact", async () => {
    await persist("discovery_manifest", MANIFEST);
    for (const s of ["evidence_validation", "graph_assembly", "graph_snapshot", "reasoning_job_creation"] as PipelineRunStage[]) await runStage(s);
    const work = await runStage("provider_routing");
    expect(work.kind).toBeNull();
    expect(work.envelope).toBeNull();
  });

  it("blocks when no reasoning jobs exist", async () => {
    const e = execFor(registry().resolve("provider_routing", run))!;
    await expect(e("provider_routing", run)).rejects.toBeInstanceOf(StageBlockedError);
  });
});

/* ===== grounding validation ================================================== */
describe("grounding_validation", () => {
  async function seedToBundle(): Promise<RuntimeArtifact> {
    await persist("discovery_manifest", MANIFEST);
    await runStage("evidence_validation");
    const bundle = await services.artifacts.latest(run.id, "evidence_bundle");
    if (!bundle.ok || !bundle.value) throw new Error("bundle");
    return bundle.value;
  }

  it("yields an empty validated set when the provider produced nothing", async () => {
    await seedToBundle();
    const work = await runStage("grounding_validation");
    expect(work.kind).toBe("validated_claims");
    expect(work.envelope!["providerEnriched"]).toBe(false);
    expect(work.envelope!["groundedCount"]).toBe(0);
  });

  it("accepts a grounded provider claim and rejects an unsupported one", async () => {
    const bundle = await seedToBundle();
    const evidenceId = (bundle.envelope["items"] as { id: string; state: string }[]).find((i) => i.state === "observed")!.id;

    // Fixture execution_outcomes — what provider_execution would produce.
    await persist("execution_outcomes", {
      jobId: "job:scan:executive_summary",
      finalStatus: "succeeded",
      claims: [
        { id: "c1", statement: "The site publishes contact details.", evidenceIds: [evidenceId], evidenceState: "observed", confidenceValue: 80, freshnessBand: "fresh", limitations: ["single-source"] },
        { id: "c2", statement: "The business is the market leader.", evidenceIds: [], evidenceState: "observed", confidenceValue: 95, freshnessBand: "fresh", limitations: [] },
      ],
    });

    const work = await runStage("grounding_validation");
    expect(work.envelope!["providerEnriched"]).toBe(true);
    expect(work.envelope!["groundedCount"]).toBe(1);
    expect(work.envelope!["rejectedCount"]).toBe(1);
    const claims = work.envelope!["claims"] as { id: string; supportLevel: string; recomputedConfidence: number; survives: boolean; reasonCodes: string[] }[];
    expect(claims[0]!.id).toBe("c1");
    // raw provider prose never becomes a finding wholesale — only grounded, evidence-linked claims survive
    expect(JSON.stringify(work.envelope)).not.toContain("market leader");

    // Evidence-validation taxonomy — the grounded claim carries a survivable
    // support level, a recalculated confidence, and reason codes; the ungrounded
    // one is UNSUPPORTED and does not survive.
    expect(["supported", "partially_supported", "weak_support"]).toContain(claims[0]!.supportLevel);
    expect(claims[0]!.survives).toBe(true);
    expect(claims[0]!.recomputedConfidence).toBeGreaterThanOrEqual(0);
    expect(claims[0]!.reasonCodes.length).toBeGreaterThan(0);
    const rejected = work.envelope!["rejected"] as { supportLevel: string; survives: boolean }[];
    expect(rejected[0]!.supportLevel).toBe("unsupported");
    expect(rejected[0]!.survives).toBe(false);
    const support = work.envelope!["support"] as { surviving: number; unsupported: number; averageConfidence: number };
    expect(support.surviving).toBe(1);
    expect(support.unsupported).toBe(1);
  });
});

/* ===== end-to-end (provider disabled) ======================================== */
describe("end-to-end deterministic spine (provider disabled)", () => {
  async function runFullSpine(): Promise<void> {
    await persist("discovery_manifest", MANIFEST);
    for (const stage of SPINE) await runStage(stage);
  }

  it("completes discovery → report in exact canonical order, all artifacts present", async () => {
    await runFullSpine();
    for (const kind of ["evidence_bundle", "intelligence_graph", "graph_snapshot", "reasoning_jobs", "validated_claims", "findings", "recommendation_candidates", "internal_intelligence_report"] as RuntimeArtifactKind[]) {
      const a = await services.artifacts.latest(run.id, kind);
      expect(a.ok && a.value, kind).not.toBeNull();
    }
  });

  it("produces a report that requires review and marks missing provider enrichment", async () => {
    await runFullSpine();
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    if (!report.ok || !report.value) throw new Error("report");
    expect(report.value.envelope["reviewRequired"]).toBe(true);
    const enrichment = report.value.envelope["providerEnrichment"] as { status: string; deterministicOnly: boolean };
    expect(enrichment.status).toBe("unavailable");
    expect(enrichment.deterministicOnly).toBe(true);
    expect(report.value.envelope["indexSummary"]).toBeTruthy();
  });

  it("chains report lineage back through the spine to source evidence", async () => {
    await runFullSpine();
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const bundle = await services.artifacts.latest(run.id, "evidence_bundle");
    const manifest = await services.artifacts.latest(run.id, "discovery_manifest");
    if (!report.ok || !report.value || !bundle.ok || !bundle.value || !manifest.ok || !manifest.value) throw new Error("missing");
    expect(report.value.sourceArtifactIds).toContain(bundle.value.id);
    expect(bundle.value.sourceArtifactIds).toContain(manifest.value.id);
  });

  it("does not inflate report confidence above the evidence", async () => {
    await runFullSpine();
    const bundle = await services.artifacts.latest(run.id, "evidence_bundle");
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    if (!bundle.ok || !bundle.value || !report.ok || !report.value) throw new Error("missing");
    const items = bundle.value.envelope["items"] as { confidence: { value: number }; state: string }[];
    const ceiling = Math.max(...items.filter((i) => i.state === "observed").map((i) => i.confidence.value));
    expect((report.value.envelope["confidence"] as { value: number }).value).toBeLessThanOrEqual(ceiling);
  });

  it("is deterministic: a second independent run yields identical report checksum", async () => {
    await runFullSpine();
    const first = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const firstChecksum = first.ok && first.value ? first.value.checksum : "A";

    // fresh run
    const now = () => T0;
    let c = 0;
    const repo = new InMemoryRuntimeRepository(now);
    services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
    const created = await services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
    if (!created.ok) throw new Error("init");
    run = created.value.run;
    await runFullSpine();
    const second = await services.artifacts.latest(run.id, "internal_intelligence_report");
    expect(second.ok && second.value ? second.value.checksum : "B").toBe(firstChecksum);
  });
});

/* ===== resume + idempotency ================================================== */
describe("resume and idempotency", () => {
  it("resumes from any stage: re-running a completed stage replays without duplicating", async () => {
    await persist("discovery_manifest", MANIFEST);
    // run through report once
    for (const stage of SPINE) await runStage(stage);
    const before = await services.artifacts.listByKind(run.id, "findings");
    const checksum = before.ok ? before.value[0]!.checksum : "";

    // "resume" by re-running the tail stages — deterministic replay
    await runStage("finding_synthesis");
    await runStage("recommendation_candidates");
    await runStage("report_assembly");

    const after = await services.artifacts.listByKind(run.id, "findings");
    expect(after.ok && after.value).toHaveLength(1); // no duplicate version
    expect(after.ok ? after.value[0]!.checksum : "").toBe(checksum);
  });

  it("blocks a downstream stage when its prerequisite artifact is absent", async () => {
    // findings without an evidence bundle must block, not fabricate
    const e = execFor(registry().resolve("finding_synthesis", run))!;
    await expect(e("finding_synthesis", run)).rejects.toBeInstanceOf(StageBlockedError);
  });
});
