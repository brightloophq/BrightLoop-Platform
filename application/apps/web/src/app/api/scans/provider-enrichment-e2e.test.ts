/* =============================================================================
 * Provider-enrichment end-to-end (Phase C · Sprint C7) — deterministic.
 *
 * Drives the FULL canonical spine through both registries — the deterministic
 * intelligence registry (@brightloop/application) and the provider registry
 * (@brightloop/providers) with a deterministic FAKE transport — from a discovery
 * fixture all the way to the internal report:
 *
 *   evidence_bundle → intelligence_graph → graph_snapshot → reasoning_jobs
 *   → provider_execution (fake) → execution_outcomes (safe candidates)
 *   → grounding_validation → validated_claims → finding_synthesis
 *   → recommendation_candidates → internal_intelligence_report
 *
 * Proves: valid claims survive, unsupported/unknown-evidence claims are rejected,
 * confidence is capped at the evidence, raw provider output NEVER appears in any
 * artifact or event, output is deterministic, and human review remains required.
 * No live provider, no network.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { createIntelligenceStageRegistry, INTELLIGENCE_STAGE_KEYS } from "@brightloop/application";
import { AnthropicReasoningProviderAdapter, FakeAnthropicTransport, createDefaultStageRegistry, loadAnthropicConfig, type FakeTransportOptions } from "@brightloop/providers";

const T0 = "2026-07-25T00:00:00.000Z";
const RAW_SENTINEL = "RAW_MODEL_PROSE_9c3f_do_not_persist";

let services: RuntimeServices;
let repo: InMemoryRuntimeRepository;
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
  observability: { planned: 3, allowed: 3, fetched: 3, excluded: 0, failed: 0, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 300000, redirectCount: 0, durationMs: 100, robotsFetched: true, injectionFlaggedPages: 0, contentTypes: { "text/html": 3 } },
  pages: [page("homepage"), page("about"), page("services")],
};

// A fake provider that returns one grounded claim (references the site evidence),
// one unsupported claim (no evidence), one unknown-evidence claim, plus hostile
// chain-of-thought — the parser must keep only the grounded one.
const CLAIM_SCRIPT: FakeTransportOptions = {
  script: [{
    text: JSON.stringify({
      claims: [
        { category: "strength", statement: "Contact details are published.", evidenceIds: ["ev:scan:website"], confidence: 99, chainOfThought: RAW_SENTINEL },
        { category: "risk", statement: "The business is the undisputed market leader.", evidenceIds: [] },
        { category: "risk", statement: "Ghost claim.", evidenceIds: ["ev:does-not-exist"] },
      ],
      analysis: RAW_SENTINEL,
    }),
    usage: { inputTokens: 200, outputTokens: 60 },
  }],
};

const intelligence = () => createIntelligenceStageRegistry({ runtime: services, now: () => T0 });
function providerRegistry(enabled: boolean, script: FakeTransportOptions) {
  const config = loadAnthropicConfig(enabled ? { AUXION_LIVE_AI_ENABLED: "true", AUXION_ANTHROPIC_ENABLED: "true", ANTHROPIC_API_KEY: "k" } : {});
  const adapter = enabled ? new AnthropicReasoningProviderAdapter({ config, transport: new FakeAnthropicTransport(script) }) : null;
  return createDefaultStageRegistry({ config, adapter, runtime: services, now: T0, traceId: "t", ids: (p) => `${p}_p` });
}

async function persist(kind: RuntimeArtifactKind, envelope: Record<string, unknown>, sources: string[] = []): Promise<void> {
  await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind, envelope, sourceArtifactIds: sources, validationStatus: "valid" });
}

async function runStage(stage: PipelineRunStage, enabled: boolean, script: FakeTransportOptions): Promise<"ok" | "blocked"> {
  const registry = INTELLIGENCE_STAGE_KEYS.has(stage) ? intelligence() : providerRegistry(enabled, script);
  const support = registry.resolve(stage, run);
  if (support.kind !== "executable") return "blocked";
  try {
    const work = await support.execute(stage, run);
    if (work.kind !== null && work.envelope !== null) await persist(work.kind, work.envelope, work.sourceArtifactIds ?? []);
    return "ok";
  } catch {
    return "blocked";
  }
}

const SPINE: PipelineRunStage[] = [
  "evidence_validation", "graph_assembly", "graph_snapshot", "reasoning_job_creation",
  "provider_execution", "grounding_validation", "finding_synthesis", "recommendation_candidates", "report_assembly",
];

async function driveSpine(enabled: boolean, script: FakeTransportOptions): Promise<Record<string, "ok" | "blocked">> {
  await persist("discovery_manifest", MANIFEST);
  const outcomes: Record<string, "ok" | "blocked"> = {};
  for (const stage of SPINE) outcomes[stage] = await runStage(stage, enabled, script);
  return outcomes;
}

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  repo = new InMemoryRuntimeRepository(now);
  services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  run = created.value.run;
});

describe("provider-enriched end-to-end", () => {
  it("runs the full spine and validates one grounded claim, rejecting the rest", async () => {
    const outcomes = await driveSpine(true, CLAIM_SCRIPT);
    expect(outcomes["provider_execution"]).toBe("ok");
    expect(outcomes["report_assembly"]).toBe("ok");

    const validated = await services.artifacts.latest(run.id, "validated_claims");
    if (!validated.ok || !validated.value) throw new Error("validated");
    expect(validated.value.envelope["groundedCount"]).toBe(1);
    expect((validated.value.envelope["claims"] as { claim: string }[])[0]!.claim).toBe("Contact details are published.");
  });

  it("carries reasoning_jobs lineage into execution_outcomes", async () => {
    await driveSpine(true, CLAIM_SCRIPT);
    const jobs = await services.artifacts.latest(run.id, "reasoning_jobs");
    const outcomes = await services.artifacts.latest(run.id, "execution_outcomes");
    if (!jobs.ok || !jobs.value || !outcomes.ok || !outcomes.value) throw new Error("missing");
    expect(outcomes.value.sourceArtifactIds).toContain(jobs.value.id);
  });

  it("NEVER persists raw provider output in ANY artifact", async () => {
    await driveSpine(true, CLAIM_SCRIPT);
    for (const kind of ["execution_outcomes", "validated_claims", "findings", "internal_intelligence_report"] as RuntimeArtifactKind[]) {
      const a = await services.artifacts.latest(run.id, kind);
      if (a.ok && a.value) {
        expect(JSON.stringify(a.value.envelope), kind).not.toContain(RAW_SENTINEL);
        expect(JSON.stringify(a.value.envelope), kind).not.toContain("market leader");
      }
    }
  });

  it("never leaks raw output through runtime events", async () => {
    await driveSpine(true, CLAIM_SCRIPT);
    expect(JSON.stringify(repo.allEvents())).not.toContain(RAW_SENTINEL);
  });

  it("caps grounded-claim confidence at the evidence confidence", async () => {
    await driveSpine(true, CLAIM_SCRIPT);
    const bundle = await services.artifacts.latest(run.id, "evidence_bundle");
    const validated = await services.artifacts.latest(run.id, "validated_claims");
    if (!bundle.ok || !bundle.value || !validated.ok || !validated.value) throw new Error("missing");
    const site = (bundle.value.envelope["items"] as { id: string; confidence: { value: number } }[]).find((i) => i.id === "ev:scan:website")!;
    const claim = (validated.value.envelope["claims"] as { confidenceValue: number }[])[0]!;
    expect(claim.confidenceValue).toBeLessThanOrEqual(site.confidence.value); // 99 capped to evidence
  });

  it("marks the report as provider-enriched and requires review", async () => {
    await driveSpine(true, CLAIM_SCRIPT);
    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    if (!report.ok || !report.value) throw new Error("report");
    const enrichment = report.value.envelope["providerEnrichment"] as { status: string; acceptedClaims: number; rejectionCategories: unknown[] };
    expect(enrichment.acceptedClaims).toBe(1);
    // the unsupported + unknown-evidence claims were dropped at the parser boundary
    expect(enrichment.rejectionCategories.length).toBeGreaterThan(0);
    expect(report.value.envelope["reviewRequired"]).toBe(true);
  });

  it("is deterministic across independent runs", async () => {
    await driveSpine(true, CLAIM_SCRIPT);
    const first = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const firstChecksum = first.ok && first.value ? first.value.checksum : "A";

    let c = 0;
    repo = new InMemoryRuntimeRepository(() => T0);
    services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: () => T0 });
    const created = await services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
    if (!created.ok) throw new Error("init");
    run = created.value.run;
    await driveSpine(true, CLAIM_SCRIPT);
    const second = await services.artifacts.latest(run.id, "internal_intelligence_report");
    expect(second.ok && second.value ? second.value.checksum : "B").toBe(firstChecksum);
  });
});

describe("provider-disabled end-to-end", () => {
  it("blocks provider execution but still completes the deterministic path to a report", async () => {
    const outcomes = await driveSpine(false, CLAIM_SCRIPT);
    expect(outcomes["provider_execution"]).toBe("blocked");
    // deterministic downstream still completes
    expect(outcomes["finding_synthesis"]).toBe("ok");
    expect(outcomes["report_assembly"]).toBe("ok");

    const report = await services.artifacts.latest(run.id, "internal_intelligence_report");
    const execution = await services.artifacts.latest(run.id, "execution_outcomes");
    if (!report.ok || !report.value) throw new Error("report");
    expect(execution.ok && execution.value).toBeNull(); // no fabricated provider artifact
    const enrichment = report.value.envelope["providerEnrichment"] as { status: string; deterministicOnly: boolean };
    expect(enrichment.status).toBe("unavailable");
    expect(enrichment.deterministicOnly).toBe(true);
    expect(report.value.envelope["reviewRequired"]).toBe(true);
    expect(report.value.envelope["indexSummary"]).toBeTruthy();
  });
});
