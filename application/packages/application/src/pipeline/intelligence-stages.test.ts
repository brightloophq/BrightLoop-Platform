/* =============================================================================
 * Intelligence stage executor tests (Phase C · Sprint C6.2) — deterministic.
 *
 * Proves the deterministic pre-reasoning stages run as real runtime executors:
 * registration, prerequisite blocking, the evidence_validation → graph_assembly
 * → graph_snapshot chain, artifact lineage, and idempotent replay. No provider,
 * no network.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import type { RuntimeRun } from "@brightloop/schema";
import { StageBlockedError, createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import { createIntelligenceStageRegistry, INTELLIGENCE_STAGE_KEYS, type IntelligenceStageSupport } from "./stage-executors.js";

const T0 = "2026-07-24T00:00:00.000Z";

let services: RuntimeServices;
let run: RuntimeRun;

function page(kind: string): Record<string, unknown> {
  return {
    targetId: `t:${kind}`, requestedUrl: `https://acme.test/${kind}`, finalUrl: `https://acme.test/${kind}`, status: 200, kind, outcome: "ok", reason: null,
    bytes: 100000, lastModified: T0, collectedAt: T0,
    extract: {
      title: "Acme Dental", metaDescription: "Care in Kingston", canonicalUrl: `https://acme.test/${kind}`, language: "en",
      headings: ["A", "B"], visibleText: "dental clinic implants therapy", internalLinks: ["https://acme.test/about"], externalLinks: [],
      forms: [{ method: "post", action: "/x", inputCount: 2 }], emails: ["a@acme.test"], phones: [], socialLinks: ["https://facebook.com/acme"],
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
const exec = (support: IntelligenceStageSupport) => (support.kind === "executable" ? support.execute : null);

async function persist(kind: Parameters<RuntimeServices["artifacts"]["persist"]>[0]["kind"], envelope: Record<string, unknown>, sourceArtifactIds: string[] = []): Promise<string> {
  const r = await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind, envelope, sourceArtifactIds, validationStatus: "valid" });
  if (!r.ok) throw new Error(`persist ${kind}`);
  return r.value.id;
}

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  const repo = new InMemoryRuntimeRepository(now);
  services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  run = created.value.run;
});

describe("registration", () => {
  it("owns the deterministic intelligence stages (C6.2a evidence/graph + C6.2b spine)", () => {
    expect([...INTELLIGENCE_STAGE_KEYS].sort()).toEqual(
      ["evidence_validation", "graph_assembly", "graph_snapshot", "reasoning_job_creation", "provider_routing", "grounding_validation", "finding_synthesis", "recommendation_candidates", "report_assembly"].sort(),
    );
  });

  it("resolves owned stages as executable and others as blocked", () => {
    const r = registry();
    expect(r.resolve("evidence_validation", run).kind).toBe("executable");
    expect(r.resolve("graph_assembly", run).kind).toBe("executable");
    expect(r.resolve("graph_snapshot", run).kind).toBe("executable");
    expect(r.resolve("provider_execution", run).kind).toBe("blocked");
  });
});

describe("prerequisite blocking", () => {
  it("blocks evidence_validation without a discovery manifest", async () => {
    const e = exec(registry().resolve("evidence_validation", run))!;
    await expect(e("evidence_validation", run)).rejects.toBeInstanceOf(StageBlockedError);
  });

  it("blocks graph_assembly without an evidence bundle", async () => {
    const e = exec(registry().resolve("graph_assembly", run))!;
    await expect(e("graph_assembly", run)).rejects.toBeInstanceOf(StageBlockedError);
  });

  it("blocks graph_snapshot without a graph", async () => {
    await persist("evidence_bundle", { scanId: "scan", items: [] });
    const e = exec(registry().resolve("graph_snapshot", run))!;
    await expect(e("graph_snapshot", run)).rejects.toBeInstanceOf(StageBlockedError);
  });
});

describe("evidence_validation → graph_assembly → graph_snapshot", () => {
  it("produces a bundle with lineage to the manifest", async () => {
    const manifestId = await persist("discovery_manifest", MANIFEST);
    const work = await exec(registry().resolve("evidence_validation", run))!("evidence_validation", run);
    expect(work.kind).toBe("evidence_bundle");
    expect(work.sourceArtifactIds).toEqual([manifestId]);
    const items = (work.envelope!["items"] as unknown[]);
    expect(items.length).toBeGreaterThan(0);
  });

  it("assembles a graph from the bundle, grounded in evidence", async () => {
    await persist("discovery_manifest", MANIFEST);
    const bundleWork = await exec(registry().resolve("evidence_validation", run))!("evidence_validation", run);
    const bundleId = await persist("evidence_bundle", bundleWork.envelope!, bundleWork.sourceArtifactIds);

    const graphWork = await exec(registry().resolve("graph_assembly", run))!("graph_assembly", run);
    expect(graphWork.kind).toBe("intelligence_graph");
    expect(graphWork.sourceArtifactIds).toEqual([bundleId]);
    const nodes = graphWork.envelope!["nodes"] as unknown[];
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("snapshots the graph with a deterministic checksum and full lineage", async () => {
    await persist("discovery_manifest", MANIFEST);
    const bundleWork = await exec(registry().resolve("evidence_validation", run))!("evidence_validation", run);
    await persist("evidence_bundle", bundleWork.envelope!, bundleWork.sourceArtifactIds);
    const graphWork = await exec(registry().resolve("graph_assembly", run))!("graph_assembly", run);
    const graphId = await persist("intelligence_graph", graphWork.envelope!, graphWork.sourceArtifactIds);

    const snapWork = await exec(registry().resolve("graph_snapshot", run))!("graph_snapshot", run);
    expect(snapWork.kind).toBe("graph_snapshot");
    expect(snapWork.sourceArtifactIds).toEqual([graphId]);
    expect(typeof snapWork.envelope!["checksum"]).toBe("string");
    expect(snapWork.envelope!["nodeCount"]).toBeGreaterThan(0);
  });
});

describe("determinism + idempotent replay", () => {
  it("produces identical graph checksums for identical evidence", async () => {
    await persist("discovery_manifest", MANIFEST);
    const bw = await exec(registry().resolve("evidence_validation", run))!("evidence_validation", run);
    await persist("evidence_bundle", bw.envelope!, bw.sourceArtifactIds);

    const g1 = await exec(registry().resolve("graph_assembly", run))!("graph_assembly", run);
    const g2 = await exec(registry().resolve("graph_assembly", run))!("graph_assembly", run);
    expect(JSON.stringify(g1.envelope)).toBe(JSON.stringify(g2.envelope));
  });

  it("replays evidence_bundle persistence without duplicating (idempotency key)", async () => {
    await persist("discovery_manifest", MANIFEST);
    const bw = await exec(registry().resolve("evidence_validation", run))!("evidence_validation", run);
    const first = await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind: "evidence_bundle", envelope: bw.envelope!, sourceArtifactIds: bw.sourceArtifactIds, validationStatus: "valid" });
    const second = await services.artifacts.persist({ runId: run.id, clientId: run.clientId, scanId: run.scanId, kind: "evidence_bundle", envelope: bw.envelope!, sourceArtifactIds: bw.sourceArtifactIds, validationStatus: "valid" });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.code).toBe("replayed");
      expect(second.value.id).toBe(first.value.id);
      expect(second.value.checksum).toBe(first.value.checksum);
    }
    const listed = await services.artifacts.listByKind(run.id, "evidence_bundle");
    expect(listed.ok && listed.value).toHaveLength(1);
  });
});
