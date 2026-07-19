import { describe, it, expect } from "vitest";
import {
  engineEvidenceItemSchema,
  evidenceBundleSchema,
  type EngineEvidenceItem,
  type EvidenceBundle,
  type Provenance,
} from "@brightloop/schema";
import {
  hashContent,
  canonicalize,
  SOURCE_RELIABILITY,
  STATE_RELIABILITY_MODIFIER,
  effectiveReliability,
  everySourceWeighted,
  computeFreshness,
  freshnessBand,
  ageInDays,
  buildProvenance,
  provenanceQuality,
  computeEvidenceConfidence,
  confidenceBand,
  aggregateConfidence,
  computeCoverage,
  detectConflicts,
  agreementScore,
  subjectKey,
  normalizeEvidence,
  evidenceHash,
  validateItem,
  validateBundle,
  isValidBundle,
  mergeBundles,
  splitBundle,
  filterBundle,
  sortBundle,
  coverageSummary,
  confidenceSummary,
  conflictSummary,
} from "./index.js";

const NOW = "2026-07-19T00:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const prov = (over: Partial<Provenance> = {}): Provenance =>
  buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler", ...over });

interface ItemOver {
  id?: string; source?: EngineEvidenceItem["source"]; state?: EngineEvidenceItem["state"]; timestamp?: string;
  value?: Record<string, unknown>; affectedDomains?: EngineEvidenceItem["affectedDomains"]; metadata?: Record<string, unknown>;
  provenance?: Provenance; citations?: string[];
}
const item = (over: ItemOver = {}): EngineEvidenceItem =>
  normalizeEvidence(
    { id: over.id ?? "e1", scanId: "s1", source: over.source ?? "website", state: over.state, timestamp: over.timestamp ?? NOW,
      provenance: over.provenance ?? prov(), value: over.value ?? { k: 1 }, affectedDomains: over.affectedDomains ?? ["digital_presence"],
      metadata: over.metadata, citations: over.citations },
    NOW,
  );
const bundle = (items: EngineEvidenceItem[]): EvidenceBundle => ({ scanId: "s1", items });

/* ---- hash ----------------------------------------------------------------- */
describe("content hash (deterministic, key-order independent)", () => {
  it("canonicalizes object key order; equal content ⇒ equal hash", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
    expect(hashContent({ a: 1, b: [3, 2] })).toBe(hashContent({ b: [3, 2], a: 1 }));
    expect(hashContent({ a: 1 })).not.toBe(hashContent({ a: 2 }));
    expect(hashContent("x")).toMatch(/^[0-9a-f]{8}$/);
  });
});

/* ---- normalization -------------------------------------------------------- */
describe("normalization", () => {
  it("defaults state from source and computes freshness/reliability/hash/confidence", () => {
    const e = item();
    expect(engineEvidenceItemSchema.parse(e)).toEqual(e);
    expect(e.state).toBe("observed"); // website default
    expect(e.freshness.band).toBe("fresh"); // timestamp = now
    expect(e.reliability).toBeCloseTo(0.95, 5);
    expect(e.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(e.confidence.value).toBeGreaterThan(0);
  });
  it("is deterministic and the hash is subject+value based", () => {
    expect(item()).toEqual(item());
    expect(item({ id: "a" }).hash).toBe(item({ id: "b" }).hash); // id not part of the content hash
    expect(evidenceHash({ source: "website", state: "observed", affectedDomains: ["sales"], value: { k: 1 }, metadata: {} }))
      .not.toBe(evidenceHash({ source: "website", state: "observed", affectedDomains: ["sales"], value: { k: 2 }, metadata: {} }));
  });
});

/* ---- reliability ---------------------------------------------------------- */
describe("reliability scoring", () => {
  it("every source has a weight; state modifiers discount it", () => {
    expect(everySourceWeighted()).toBe(true);
    expect(SOURCE_RELIABILITY.website).toBeGreaterThan(SOURCE_RELIABILITY.competitors);
    expect(STATE_RELIABILITY_MODIFIER.unavailable).toBe(0);
    expect(effectiveReliability("website", "observed")).toBeCloseTo(0.95, 5);
    expect(effectiveReliability("website", "inferred")).toBeCloseTo(0.95 * 0.5, 5);
    expect(effectiveReliability("analytics", "unavailable")).toBe(0);
    expect(effectiveReliability("website", "observed", 0.5)).toBeCloseTo(0.5, 5);
  });
});

/* ---- freshness ------------------------------------------------------------ */
describe("freshness scoring", () => {
  it("bands by age; unknown timestamp is expired; future is age 0", () => {
    expect(computeFreshness(NOW, NOW).band).toBe("fresh");
    expect(computeFreshness(daysAgo(3), NOW).band).toBe("recent");
    expect(computeFreshness(daysAgo(15), NOW).band).toBe("stale");
    expect(computeFreshness(daysAgo(60), NOW).band).toBe("expired");
    expect(freshnessBand(null)).toBe("expired");
    expect(ageInDays(daysAgo(0.5), NOW)).toBe(0);
    expect(computeFreshness("not-a-date", NOW).ageDays).toBeNull();
  });
  it("score decays monotonically fresh → expired", () => {
    const scores = [NOW, daysAgo(3), daysAgo(15), daysAgo(60)].map((t) => computeFreshness(t, NOW).score);
    expect(scores[0]!).toBeGreaterThan(scores[1]!);
    expect(scores[1]!).toBeGreaterThan(scores[2]!);
    expect(scores[2]!).toBeGreaterThan(scores[3]!);
  });
});

/* ---- provenance ----------------------------------------------------------- */
describe("provenance", () => {
  it("derives transformed from steps and grades quality", () => {
    expect(prov().transformed).toBe(false);
    expect(prov({ transformations: ["strip-html"] }).transformed).toBe(true);
    expect(provenanceQuality(prov({ method: "manual" }))).toBeGreaterThan(provenanceQuality(prov({ method: "computed" })));
    // an opaque transform (marked transformed but no recorded steps) is penalized
    const opaque = { ...prov(), transformed: true, transformations: [] };
    expect(provenanceQuality(opaque)).toBeLessThan(provenanceQuality(prov()));
  });
});

/* ---- confidence ----------------------------------------------------------- */
describe("confidence model (6 factors)", () => {
  const full = { coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1, provenanceQuality: 1 };
  it("geometric mean → 100 at full, 0 when any factor is zero; bands map", () => {
    expect(computeEvidenceConfidence(full).value).toBe(100);
    expect(computeEvidenceConfidence(full).band).toBe("very_high");
    expect(computeEvidenceConfidence({ ...full, reliability: 0 }).value).toBe(0);
    expect(confidenceBand(10)).toBe("very_low");
    expect(confidenceBand(50)).toBe("moderate");
    expect(confidenceBand(85)).toBe("very_high");
  });
  it("aggregate over items is reliability-weighted and deterministic; empty → 0", () => {
    expect(aggregateConfidence([]).value).toBe(0);
    const a = aggregateConfidence([item({ id: "a" }), item({ id: "b", value: { k: 2 } })]);
    expect(a).toEqual(aggregateConfidence([item({ id: "a" }), item({ id: "b", value: { k: 2 } })]));
  });
});

/* ---- coverage ------------------------------------------------------------- */
describe("coverage scoring", () => {
  it("counts covered dimensions; excludes unavailable; overall is the covered share", () => {
    const c = computeCoverage([item({ affectedDomains: ["sales"] }), item({ id: "u", source: "analytics", state: "unavailable", value: {}, affectedDomains: ["automation"] })]);
    expect(c.covered).toEqual(["sales"]);
    expect(c.missing).toContain("automation"); // unavailable item doesn't count
    expect(c.overall).toBeCloseTo(1 / 10, 5);
    expect(c.byDimension.sales).toBe(1);
  });
});

/* ---- conflict detection --------------------------------------------------- */
describe("conflict / duplicate / superseded / missing", () => {
  it("duplicate: identical content, different ids", () => {
    const conflicts = detectConflicts(bundle([item({ id: "a" }), item({ id: "b" })]));
    expect(conflicts.find((c) => c.type === "duplicate")?.itemIds).toEqual(["a", "b"]);
  });
  it("conflict: same subject, disagreeing values", () => {
    const key = { source: "seo" as const, affectedDomains: ["marketing" as const], metadata: { metric: "title" } };
    const cs = detectConflicts(bundle([item({ id: "a", value: { v: 1 }, ...key }), item({ id: "b", value: { v: 2 }, ...key })]));
    expect(cs.some((c) => c.type === "conflict" && c.itemIds.includes("a") && c.itemIds.includes("b"))).toBe(true);
  });
  it("superseded: same subject + value, older timestamp", () => {
    const key = { source: "seo" as const, affectedDomains: ["marketing" as const], metadata: { metric: "title" }, value: { v: 1 } };
    const cs = detectConflicts(bundle([item({ id: "old", timestamp: daysAgo(10), ...key }), item({ id: "new", timestamp: NOW, ...key })]));
    expect(cs.find((c) => c.type === "superseded")?.itemIds).toEqual(["old"]);
  });
  it("missing: a required dimension with no evidence", () => {
    const cs = detectConflicts(bundle([item({ affectedDomains: ["sales"] })]), { requiredDimensions: ["sales", "brand"] });
    expect(cs.find((c) => c.type === "missing")?.dimension).toBe("brand");
  });
  it("agreementScore drops when a conflict exists", () => {
    const key = { source: "seo" as const, affectedDomains: ["marketing" as const], metadata: { metric: "title" } };
    expect(agreementScore(bundle([item({ id: "a", value: { v: 1 }, ...key }), item({ id: "b", value: { v: 2 }, ...key })]))).toBeLessThan(1);
    expect(agreementScore(bundle([item()]))).toBe(1);
    expect(subjectKey(item({ source: "seo", affectedDomains: ["marketing"], metadata: { metric: "title" } }))).toBe("seo::marketing::title");
  });
});

/* ---- bundle operations ---------------------------------------------------- */
describe("bundle operations", () => {
  it("merge de-duplicates by id; filter/split partition", () => {
    const m = mergeBundles(bundle([item({ id: "a" })]), bundle([item({ id: "a" }), item({ id: "b", source: "seo" })]));
    expect(m.items.map((i) => i.id)).toEqual(["a", "b"]);
    const [yes, no] = splitBundle(m, (i) => i.source === "seo");
    expect(yes.items).toHaveLength(1);
    expect(no.items).toHaveLength(1);
    expect(filterBundle(m, (i) => i.id === "a").items).toHaveLength(1);
  });
  it("sort is strongest-first (reliability desc) and stable", () => {
    const strong = item({ id: "strong", source: "website" }); // 0.95
    const weak = item({ id: "weak", source: "competitors" }); // 0.60
    const s = sortBundle(bundle([weak, strong]));
    expect(s.items.map((i) => i.id)).toEqual(["strong", "weak"]);
    expect(sortBundle(bundle([weak, strong]))).toEqual(sortBundle(bundle([strong, weak])));
  });
  it("summaries: coverage, confidence (band), conflict", () => {
    const b = bundle([item({ affectedDomains: ["sales"] }), item({ id: "b2", source: "seo", affectedDomains: ["marketing"] })]);
    expect(coverageSummary(b).covered.sort()).toEqual(["marketing", "sales"]);
    expect(confidenceSummary(b).band).toBeDefined();
    expect(Array.isArray(conflictSummary(b))).toBe(true);
    expect(evidenceBundleSchema.parse(b)).toEqual(b);
  });
  it("empty bundle: coverage 0, confidence very_low, no conflicts", () => {
    const e = bundle([]);
    expect(coverageSummary(e).overall).toBe(0);
    expect(confidenceSummary(e).band).toBe("very_low");
    expect(conflictSummary(e)).toEqual([]);
  });
});

/* ---- validation ----------------------------------------------------------- */
describe("validation", () => {
  it("a normalized item is valid", () => {
    expect(validateItem(item(), NOW)).toEqual([]);
    expect(isValidBundle(bundle([item()]), NOW)).toBe(true);
  });
  it("future timestamp is rejected", () => {
    const future = { ...item(), timestamp: daysAgo(-1) };
    expect(validateItem(future, NOW).some((e) => e.code === "future_timestamp")).toBe(true);
  });
  it("duplicate id in a bundle is flagged", () => {
    const errs = validateBundle(bundle([item({ id: "dup" }), item({ id: "dup", source: "seo" })]), NOW);
    expect(errs.some((e) => e.code === "duplicate_id")).toBe(true);
  });
  it("unavailable evidence carrying a value is an invalid combination", () => {
    const bad = item({ source: "analytics", state: "unavailable", value: { leaked: 1 }, affectedDomains: ["automation"] });
    expect(validateItem(bad, NOW).some((e) => e.code === "invalid_combination")).toBe(true);
  });
  it("unknown source / unsupported state are caught (raw cast)", () => {
    const raw = { ...item(), source: "bogus", state: "made_up" } as unknown as EngineEvidenceItem;
    const codes = validateItem(raw, NOW).map((e) => e.code);
    expect(codes).toContain("unknown_source");
    expect(codes).toContain("unsupported_state");
  });
});
