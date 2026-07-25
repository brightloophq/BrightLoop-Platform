/* =============================================================================
 * Prospect assessment pipeline tests (Phase C · Sprint C6) — deterministic.
 *
 * Exercises the controlled integration against the real InMemoryRuntimeRepository
 * (injected clock, counter ids). No DB, no network, no provider. These prove the
 * sprint's non-negotiables end to end:
 *   evidence lineage survives · confidence is not inflated · unknown stays
 *   unknown · missing prerequisites BLOCK (never fail-as-zero) · re-runs REPLAY
 *   rather than duplicate · human review is always required.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError, NotFoundError } from "../errors.js";
import { normalizeDiscoveryToEvidence } from "./evidence-bridge.js";
import { toInternalReportEnvelope } from "./report-adapter.js";
import { assessProspect } from "./assess-prospect.js";
import { getScanAssessment } from "./get-assessment.js";
import { runProspectIntelligence } from "@brightloop/domain";

const T0 = "2026-07-24T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

interface Harness {
  services: RuntimeServices;
  ctx: (actor: Actor) => AppContext;
}
function harness(): Harness {
  const now = () => T0;
  let counter = 0;
  const ids = (p: string) => `${p}_${(++counter).toString().padStart(4, "0")}`;
  const repo = new InMemoryRuntimeRepository(now);
  const services = createRuntimeServices({ repo, ids, clock: now });
  return { services, ctx: (actor) => ({ services, actor, ids, clock: now }) };
}

/* ---- fixtures ---------------------------------------------------------------- */

function page(kind: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    targetId: `t:${kind}`, requestedUrl: `https://acme.test/${kind}`, finalUrl: `https://acme.test/${kind}`,
    status: 200, kind, outcome: "ok", reason: null, bytes: 120000, lastModified: T0, collectedAt: T0,
    extract: {
      title: "Acme Dental Clinic", metaDescription: "Premium dental care in Kingston", canonicalUrl: `https://acme.test/${kind}`,
      language: "en", headings: ["Welcome", "Services", "Contact"], visibleText: "Our dental clinic offers implants, whitening and therapy.",
      internalLinks: ["https://acme.test/about", "https://acme.test/services", "https://acme.test/contact"],
      externalLinks: [], forms: [{ method: "post", action: "/enquire", inputCount: 3 }], emails: ["hello@acme.test"], phones: ["+1-876-000-0000"],
      socialLinks: ["https://facebook.com/acme", "https://instagram.com/acme", "https://linkedin.com/company/acme"],
      jsonLdTypes: ["Organization", "LocalBusiness"],
      seo: { hasTitle: true, hasMetaDescription: true, hasCanonical: true, hasH1: true, h1Count: 1, wordCount: 800 },
      accessibility: { imageCount: 10, imagesWithAlt: 9, hasLangAttribute: true, hasViewportMeta: true },
      ...(over["extract"] as Record<string, unknown> ?? {}),
    },
    ...over,
  };
}

/** A healthy multi-page crawl manifest envelope, as C3 stores it. */
function strongManifest(): Record<string, unknown> {
  const pages = [page("homepage"), page("about"), page("services"), page("contact"), page("pricing")];
  return {
    kind: "discovery_manifest",
    manifest: { sessionId: "disc:scan", scanId: "scan", targets: [], checksum: "c", generatedAt: T0 },
    summary: { totalPlanned: 6, allowed: 5, excluded: 1, blockedByRobots: 0, ssrfBlocked: 0, duplicates: 0, byKind: {} },
    metrics: { plannedPages: 6, maxDepth: 2, uniqueHosts: 1, duplicateUrls: 0 },
    observability: { planned: 6, allowed: 5, fetched: 5, excluded: 1, failed: 1, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 600000, redirectCount: 0, durationMs: 900, robotsFetched: true, injectionFlaggedPages: 0, contentTypes: { "text/html": 5 } },
    pages,
  };
}

/** A crawl where every page failed — no observed signal. */
function emptyManifest(): Record<string, unknown> {
  return {
    kind: "discovery_manifest",
    manifest: { sessionId: "disc:scan", scanId: "scan", targets: [], checksum: "c", generatedAt: T0 },
    summary: { totalPlanned: 3, allowed: 0, excluded: 0, blockedByRobots: 0, ssrfBlocked: 0, duplicates: 0, byKind: {} },
    metrics: { plannedPages: 3, maxDepth: 1, uniqueHosts: 1, duplicateUrls: 0 },
    observability: { planned: 3, allowed: 0, fetched: 0, excluded: 0, failed: 3, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 0, redirectCount: 0, durationMs: 100, robotsFetched: false, injectionFlaggedPages: 0, contentTypes: {} },
    pages: [
      { targetId: "t:homepage", requestedUrl: "https://acme.test/", finalUrl: "https://acme.test/", status: 500, kind: "homepage", outcome: "failed", reason: "status:500", bytes: 0, collectedAt: T0, extract: null },
    ],
  };
}

/** Create a run and seed a discovery_manifest artifact; return the run id. */
async function seedScan(h: Harness, manifest: Record<string, unknown> | null): Promise<string> {
  const created = await h.services.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: { rootUrl: "https://acme.test" }, deadline: null });
  if (!created.ok) throw new Error("seed failed");
  const runId = created.value.run.id;
  if (manifest !== null) {
    await h.services.artifacts.persist({ runId, clientId: "t_acme", scanId: "scan", kind: "discovery_manifest", envelope: manifest, validationStatus: "valid" });
  }
  return runId;
}

/* ===== evidence bridge ======================================================= */
describe("evidence normalization bridge", () => {
  const bridge = () => normalizeDiscoveryToEvidence(strongManifest(), "scan", T0, (s) => `ev:scan:${s}`);

  it("produces a site item plus one item per page", () => {
    const r = bridge();
    expect(r.items.some((i) => i.source === "website")).toBe(true);
    expect(r.items.filter((i) => i.source === "pages")).toHaveLength(5);
    expect(r.observedCount).toBe(6);
  });

  it("derives observed signals and omits unobserved ones (never fabricates)", () => {
    const site = bridge().items.find((i) => i.source === "website")!;
    expect(site.value["isHttps"]).toBe(true);
    expect(site.value["hasServicesPage"]).toBe(true);
    expect(site.value["hasPricingPage"]).toBe(true);
    expect(site.value["socialLinkCount"]).toBe(3);
    // security headers were never observed → the key is simply absent
    expect(site.value["securityHeadersChecked"]).toBeUndefined();
  });

  it("marks a failed page unavailable with no signal", () => {
    const r = normalizeDiscoveryToEvidence(emptyManifest(), "scan", T0, (s) => `ev:${s}`);
    const failed = r.items.filter((i) => i.source === "pages")[0]!;
    expect(failed.state).toBe("unavailable");
    expect(Object.keys(failed.value)).toHaveLength(0);
    expect(r.observedCount).toBe(0);
  });

  it("is deterministic for identical input", () => {
    expect(JSON.stringify(bridge().items)).toBe(JSON.stringify(bridge().items));
  });
});

/* ===== authorization ========================================================= */
describe("authorization", () => {
  it("denies a client role", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    await expect(assessProspect(h.ctx(CLIENT), runId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows internal owner and team_member", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    expect((await assessProspect(h.ctx(OWNER), runId)).status).toBe("completed");
    const h2 = harness();
    const r2 = await seedScan(h2, strongManifest());
    expect((await assessProspect(h2.ctx(TEAM), r2)).status).toBe("completed");
  });

  it("404s for an unknown run without leaking existence", async () => {
    const h = harness();
    await expect(assessProspect(h.ctx(OWNER), "run_missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

/* ===== blocked / gaps / completed ============================================ */
describe("outcome semantics", () => {
  it("BLOCKS when no discovery manifest exists — never fails as zero", async () => {
    const h = harness();
    const runId = await seedScan(h, null);
    const out = await assessProspect(h.ctx(OWNER), runId);
    expect(out.status).toBe("blocked");
    expect(out.blockedReason).toBe("discovery_manifest_missing");
    expect(out.artifactIds.report).toBeNull();
  });

  it("COMPLETED_WITH_GAPS when nothing was fetched — honest, not zeroed", async () => {
    const h = harness();
    const runId = await seedScan(h, emptyManifest());
    const out = await assessProspect(h.ctx(OWNER), runId);
    expect(out.status).toBe("completed_with_gaps");
    expect(out.observedEvidence).toBe(0);
    expect(out.maturityOverall).toBeNull();
    // it still produces reviewable artifacts
    expect(out.artifactIds.report).not.toBeNull();
    expect(out.reviewRequired).toBe(true);
  });

  it("COMPLETED with a real maturity score on a healthy crawl", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    const out = await assessProspect(h.ctx(OWNER), runId);
    expect(out.status).toBe("completed");
    expect(out.maturityOverall).toBeGreaterThan(0);
    expect(out.artifactIds.evidenceBundle).not.toBeNull();
    expect(out.artifactIds.findings).not.toBeNull();
    expect(out.artifactIds.recommendationCandidates).not.toBeNull();
    expect(out.artifactIds.report).not.toBeNull();
  });
});

/* ===== lineage + preservation ================================================ */
describe("artifact lineage and preservation", () => {
  it("chains report → evidence bundle → discovery manifest", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    const out = await assessProspect(h.ctx(OWNER), runId);

    const bundleId = out.artifactIds.evidenceBundle!;
    const reportId = out.artifactIds.report!;
    // report derives from the bundle
    expect(out.lineage[reportId]).toEqual([bundleId]);
    // bundle derives from the manifest
    const manifest = await h.services.artifacts.latest(runId, "discovery_manifest");
    expect(manifest.ok && manifest.value).not.toBeNull();
    if (manifest.ok && manifest.value) expect(out.lineage[bundleId]).toEqual([manifest.value.id]);
  });

  it("preserves evidence ids from bundle into findings", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    await assessProspect(h.ctx(OWNER), runId);

    const bundle = await h.services.artifacts.latest(runId, "evidence_bundle");
    const findings = await h.services.artifacts.latest(runId, "findings");
    if (!bundle.ok || !bundle.value || !findings.ok || !findings.value) throw new Error("missing");
    const bundleIds = new Set((bundle.value.envelope["items"] as { id: string }[]).map((i) => i.id));
    const strengths = findings.value.envelope["strengths"] as { evidenceIds: string[] }[];
    const referenced = [...strengths, ...(findings.value.envelope["weaknesses"] as { evidenceIds: string[] }[])].flatMap((f) => f.evidenceIds);
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) expect(bundleIds.has(id)).toBe(true);
  });

  it("does not inflate confidence above the evidence bundle", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    await assessProspect(h.ctx(OWNER), runId);
    const bundle = await h.services.artifacts.latest(runId, "evidence_bundle");
    const report = await h.services.artifacts.latest(runId, "internal_intelligence_report");
    if (!bundle.ok || !bundle.value || !report.ok || !report.value) throw new Error("missing");
    const items = bundle.value.envelope["items"] as { confidence: { value: number }; state: string }[];
    const ceiling = Math.max(...items.filter((i) => i.state === "observed").map((i) => i.confidence.value));
    const reportConfidence = (report.value.envelope["confidence"] as { value: number }).value;
    expect(reportConfidence).toBeLessThanOrEqual(ceiling);
  });

  it("marks the report unvalidated — human review required", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    await assessProspect(h.ctx(OWNER), runId);
    const report = await h.services.artifacts.latest(runId, "internal_intelligence_report");
    if (!report.ok || !report.value) throw new Error("missing");
    expect(report.value.validationStatus).toBe("unvalidated");
    expect(report.value.envelope["reviewRequired"]).toBe(true);
  });
});

/* ===== idempotency + resume ================================================== */
describe("idempotent re-run", () => {
  it("replays without duplicating artifacts or changing checksums", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    const first = await assessProspect(h.ctx(OWNER), runId);
    const before = await h.services.artifacts.listByKind(runId, "internal_intelligence_report");
    const firstChecksum = before.ok ? before.value[0]!.checksum : "";

    const second = await assessProspect(h.ctx(OWNER), runId);
    const after = await h.services.artifacts.listByKind(runId, "internal_intelligence_report");

    // no duplicate report version created
    expect(after.ok && after.value).toHaveLength(1);
    // identical ids returned, identical checksum
    expect(second.artifactIds.report).toBe(first.artifactIds.report);
    expect(after.ok ? after.value[0]!.checksum : "").toBe(firstChecksum);
  });
});

/* ===== read + review surface ================================================= */
describe("getScanAssessment", () => {
  it("returns present:false before an assessment runs", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    const dto = await getScanAssessment(h.ctx(OWNER), runId);
    expect(dto.present).toBe(false);
    expect(dto.report).toBeNull();
  });

  it("surfaces the assessment with review-required after it runs", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    await assessProspect(h.ctx(OWNER), runId);
    const dto = await getScanAssessment(h.ctx(OWNER), runId);
    expect(dto.present).toBe(true);
    expect(dto.reviewRequired).toBe(true);
    expect(dto.report?.validationStatus).toBe("unvalidated");
    expect(dto.report?.content["indexSummary"]).toBeTruthy();
    expect(dto.findings).not.toBeNull();
  });

  it("denies a client role on read", async () => {
    const h = harness();
    const runId = await seedScan(h, strongManifest());
    await assessProspect(h.ctx(OWNER), runId);
    await expect(getScanAssessment(h.ctx(CLIENT), runId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* ===== end-to-end determinism ================================================ */
describe("end-to-end", () => {
  it("produces a full, deterministic artifact set traceable to source evidence", async () => {
    const run1 = harness();
    const id1 = await seedScan(run1, strongManifest());
    const out1 = await assessProspect(run1.ctx(OWNER), id1);

    const run2 = harness();
    const id2 = await seedScan(run2, strongManifest());
    const out2 = await assessProspect(run2.ctx(OWNER), id2);

    // deterministic scores across independent runs
    expect(out1.maturityOverall).toBe(out2.maturityOverall);
    expect(out1.readinessOverall).toBe(out2.readinessOverall);

    // report envelope checksums identical (content-addressed)
    const r1 = await run1.services.artifacts.latest(id1, "internal_intelligence_report");
    const r2 = await run2.services.artifacts.latest(id2, "internal_intelligence_report");
    expect(r1.ok && r1.value && r2.ok && r2.value).toBeTruthy();
    if (r1.ok && r1.value && r2.ok && r2.value) expect(r1.value.checksum).toBe(r2.value.checksum);
  });

  it("report envelope contains no fabricated price, timeline or guarantee", async () => {
    const assessment = runProspectIntelligence({
      scanId: "scan",
      evidence: normalizeDiscoveryToEvidence(strongManifest(), "scan", T0, (s) => `ev:${s}`).items,
      idFor: (p, i) => `${p}:${i}`,
      now: T0,
    });
    const envelope = JSON.stringify(toInternalReportEnvelope(assessment));
    expect(envelope).not.toMatch(/\$\d|guarantee|guaranteed|deadline|price|USD/i);
  });
});
