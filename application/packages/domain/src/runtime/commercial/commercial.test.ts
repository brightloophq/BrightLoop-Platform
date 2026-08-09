/* =============================================================================
 * Commercial workflow coordinator — DETERMINISTIC integration tests.
 *
 * Drives the post-scan commercial scheduler over the SAME InMemoryRuntimeRepository
 * the core runtime tests use — injected clock, counter ids, no I/O. Proves:
 *   scan completion → enqueue (idempotent) → competitor stage → REVISED snapshot ·
 *   refresh/retry produces no duplicate artifact · no verifiable evidence →
 *   insufficient_evidence (no revision) · the core pipeline is never re-entered.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { EngineEvidenceItem } from "@brightloop/schema";
import { InMemoryRuntimeRepository } from "../testing/in-memory-repository.js";
import { createRuntimeServices, type RuntimeServices } from "../services/index.js";
import { runCompetitorIntelligence } from "../../scan-engine/competitor-intelligence/runtime.js";

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

/** Seed a COMPLETED core scan: manifest, bundle, and the C8 v1 (unavailable) snapshot. */
async function seedCompletedScan(svc: RuntimeServices, external: string[]): Promise<{ runId: string }> {
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
  await svc.runs.completeRun(runId);
  return { runId };
}

describe("CommercialCoordinator — competitor workflow", () => {
  it("enqueues on completion (idempotently) and revises the snapshot to AVAILABLE", async () => {
    const { svc, repo } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);

    const e1 = await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const e2 = await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    expect(e1).toMatchObject({ ok: true, code: "created" });
    expect(e2).toMatchObject({ ok: true, code: "replayed" }); // one job, not two
    expect(repo.allJobs().filter((j) => j.jobType === "commercial_intelligence")).toHaveLength(1);

    const turn = await svc.commercial.runCommercialOnce("cw-1");
    expect(turn.ok && turn.value?.status).toBe("ready");
    expect(turn.ok && turn.value?.persisted).toBe("revised");

    const latest = await svc.artifacts.latest(runId, "competitor_snapshot");
    expect(latest.ok && latest.value?.version).toBe(2);
    const snap = latest.ok && latest.value ? (latest.value.envelope as Record<string, unknown>) : {};
    expect(snap["status"]).toBe("available");
    expect((snap["competitors"] as Array<{ name: string }>).map((c) => c.name)).toContain("rival.com");
  });

  it("is refresh/retry-safe — a second drive produces no duplicate artifact", async () => {
    const { svc } = harness();
    const { runId } = await seedCompletedScan(svc, ["https://rival.com/"]);
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });

    await svc.commercial.runCommercialOnce("cw-1");
    // Re-enqueue (a refresh/replay of completion) + drive again.
    await svc.commercial.enqueueForCompletedRun({ runId, scanId: START.scanId, clientId: START.clientId });
    const again = await svc.commercial.runCommercialOnce("cw-1");

    // The completed job is not re-leased; no second execution, no v3.
    expect(again.ok && again.value).toBeNull();
    const snaps = await svc.artifacts.listByKind(runId, "competitor_snapshot");
    expect(snaps.ok && snaps.value.map((s) => s.version).sort()).toEqual([1, 2]);
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
    const snap = latest.ok && latest.value ? (latest.value.envelope as Record<string, unknown>) : {};
    expect(snap["status"]).toBe("unavailable");
  });

  it("returns null when the commercial queue is idle", async () => {
    const { svc } = harness();
    const idle = await svc.commercial.runCommercialOnce("cw-1");
    expect(idle.ok && idle.value).toBeNull();
  });
});
