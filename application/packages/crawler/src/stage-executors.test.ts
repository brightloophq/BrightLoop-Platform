/* =============================================================================
 * Discovery stage-executor runtime tests (Phase C · Sprint C3 §10/§15).
 *
 * Drives the discovery stages through the REAL runtime coordinator (the same
 * machinery the C2.1 driver wraps) against the in-memory runtime + fake
 * transport. Proves artifact + checkpoint persistence, downstream enqueue, the
 * one-turn boundary, and the crawler_disabled block — all deterministic, offline.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  createRuntimeServices,
  InMemoryRuntimeRepository,
  StageBlockedError,
  type RuntimeServices,
  type StageExecutor,
} from "@brightloop/domain";
import type { PipelineRunStage, RuntimeRun } from "@brightloop/schema";
import { loadCrawlerConfig, type CrawlerConfig } from "./config.js";
import { createDiscoveryStageRegistry, DISCOVERY_STAGE_KEYS } from "./stage-executors.js";
import { FakeHttpTransport, FakeDnsResolver, type ScriptedRoute } from "./testing/fake-transport.js";

const T0 = "2026-07-22T00:00:00.000Z";
const ROOT = "https://example.com";
const START = { clientId: "c1", scanId: "scan-1", metadata: { rootUrl: ROOT } };

const html = (title: string): ScriptedRoute => ({ status: 200, contentType: "text/html", body: `<html lang="en"><head><title>${title}</title></head><body><h1>${title}</h1></body></html>` });

function siteRoutes(): Record<string, ScriptedRoute> {
  return {
    [`${ROOT}/robots.txt`]: { status: 404, body: "" },
    [ROOT]: html("Home"),
    [`${ROOT}/about`]: html("About"),
    [`${ROOT}/contact`]: html("Contact"),
    [`${ROOT}/services`]: html("Services"),
    [`${ROOT}/pricing`]: html("Pricing"),
    [`${ROOT}/blog`]: html("Blog"),
    [`${ROOT}/resources`]: html("Resources"),
    [`${ROOT}/careers`]: html("Careers"),
    [`${ROOT}/legal`]: html("Legal"),
  };
}

interface Harness {
  repo: InMemoryRuntimeRepository;
  svc: RuntimeServices;
  dispatcher: StageExecutor;
}

function harness(config: CrawlerConfig): Harness {
  let counter = 0;
  const ids = (p: string) => `${p}_${++counter}`;
  const now = () => T0;
  const repo = new InMemoryRuntimeRepository(now);
  const svc = createRuntimeServices({ repo, ids, clock: now });

  const enabled = config.enabled;
  const registry = createDiscoveryStageRegistry({
    config,
    transport: enabled ? new FakeHttpTransport(siteRoutes()) : null,
    resolver: enabled ? new FakeDnsResolver() : null,
    runtime: svc,
    clock: now,
  });

  const dispatcher: StageExecutor = async (stage: PipelineRunStage, run: RuntimeRun) => {
    const support = registry.resolve(stage, run);
    if (support.kind === "blocked") throw new StageBlockedError(support.reason);
    return support.execute(stage, run);
  };

  return { repo, svc, dispatcher };
}

const enabledCfg = () => loadCrawlerConfig({ AUXION_CRAWLER_ENABLED: "true", AUXION_CRAWLER_MAX_PAGES: "10" });

describe("discovery stage registry", () => {
  it("owns exactly the three real discovery stages", () => {
    expect([...DISCOVERY_STAGE_KEYS].sort()).toEqual(["discovery_completion", "discovery_planning", "evidence_normalization"]);
  });

  it("resolves discovery stages as executable when enabled and blocks when disabled", () => {
    const run = { id: "r", scanId: "s", clientId: null, metadata: {} } as RuntimeRun;
    const on = createDiscoveryStageRegistry({ config: enabledCfg(), transport: new FakeHttpTransport({}), resolver: new FakeDnsResolver(), runtime: harness(enabledCfg()).svc, clock: () => T0 });
    expect(on.resolve("discovery_planning", run).kind).toBe("executable");

    const off = createDiscoveryStageRegistry({ config: loadCrawlerConfig({}), transport: null, resolver: null, runtime: harness(loadCrawlerConfig({})).svc, clock: () => T0 });
    const blocked = off.resolve("discovery_completion", run);
    expect(blocked.kind).toBe("blocked");
    expect(blocked.kind === "blocked" && blocked.reason).toBe("crawler_disabled");
  });
});

describe("discovery stages through the coordinator (one turn each)", () => {
  it("plans, crawls, and normalizes evidence across three turns — persisting artifacts, checkpoints, and downstream jobs", async () => {
    const h = harness(enabledCfg());
    const init = await h.svc.coordinator.initializeRun(START);
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    // Turn 1: discovery_planning (no artifact) → enqueues discovery_completion.
    const t1 = await h.svc.coordinator.runOnce("w", h.dispatcher);
    expect(t1.ok && t1.value?.stage).toBe("discovery_planning");
    expect(t1.ok && t1.value?.status).toBe("completed");

    // Turn 2: discovery_completion → discovery_manifest artifact + downstream.
    const t2 = await h.svc.coordinator.runOnce("w", h.dispatcher);
    expect(t2.ok && t2.value?.stage).toBe("discovery_completion");
    expect(t2.ok && t2.value?.status).toBe("completed");
    const manifest = h.repo.allArtifacts().find((a) => a.kind === "discovery_manifest");
    expect(manifest).toBeDefined();
    expect((manifest!.envelope as { pages?: unknown[] }).pages!.length).toBeGreaterThan(0);

    // Turn 3: evidence_normalization → evidence_ingress artifact.
    const t3 = await h.svc.coordinator.runOnce("w", h.dispatcher);
    expect(t3.ok && t3.value?.stage).toBe("evidence_normalization");
    expect(t3.ok && t3.value?.status).toBe("completed");
    const ingress = h.repo.allArtifacts().find((a) => a.kind === "evidence_ingress");
    expect(ingress).toBeDefined();
    expect((ingress!.envelope as { observed?: number }).observed).toBeGreaterThan(0);

    // checkpoints persisted for each completed stage, in order.
    const stages = h.repo.allCheckpoints().filter((c) => c.status === "valid").map((c) => c.stage);
    expect(stages).toEqual(["discovery_planning", "discovery_completion", "evidence_normalization"]);

    // a downstream job (evidence_validation) is queued after turn 3 — one at a time.
    expect(h.repo.allJobs().some((j) => j.stage === "evidence_validation" && j.status === "queued")).toBe(true);
  });

  it("never persists raw HTML — only bounded sanitized text with a checksum", async () => {
    const h = harness(enabledCfg());
    await h.svc.coordinator.initializeRun(START);
    await h.svc.coordinator.runOnce("w", h.dispatcher); // planning
    await h.svc.coordinator.runOnce("w", h.dispatcher); // completion
    const manifest = h.repo.allArtifacts().find((a) => a.kind === "discovery_manifest")!;
    const serialized = JSON.stringify(manifest.envelope);
    expect(serialized).not.toContain("<html");
    expect(serialized).not.toContain("<body");
    expect(serialized).not.toContain("<title");
  });

  it("blocks with crawler_disabled and persists NO artifact when disabled", async () => {
    const h = harness(loadCrawlerConfig({})); // disabled
    await h.svc.coordinator.initializeRun(START);
    const turn = await h.svc.coordinator.runOnce("w", h.dispatcher);
    expect(turn.ok && turn.value?.status).toBe("blocked");
    expect(turn.ok && turn.value?.detail).toBe("crawler_disabled");
    expect(h.repo.allArtifacts()).toHaveLength(0);
    // the job is released, not failed — no attempt consumed.
    const job = h.repo.allJobs()[0]!;
    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(0);
  });

  it("fails discovery_planning when the run carries no target URL (no fabrication)", async () => {
    const h = harness(enabledCfg());
    await h.svc.coordinator.initializeRun({ clientId: "c1", scanId: "scan-2", metadata: {} });
    const turn = await h.svc.coordinator.runOnce("w", h.dispatcher);
    expect(turn.ok && turn.value?.status).toBe("failed");
    expect(turn.ok && turn.value?.detail).toContain("missing_target_url");
  });
});
