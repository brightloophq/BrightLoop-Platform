import { describe, it, expect } from "vitest";
import {
  graphNodeSchema,
  graphEdgeSchema,
  intelligenceGraphSchema,
  graphSnapshotSchema,
  type EngineEvidenceItem,
  type EvidenceBundle,
  type Provenance,
  type GraphNode,
  type IntelligenceGraph,
} from "@brightloop/schema";
import { normalizeEvidence, buildProvenance } from "../evidence/index.js";
import {
  emptyGraph,
  addNode,
  addEdge,
  mergeGraphs,
  dedupeNodes,
  dedupeEdges,
  filterByDomain,
  filterByType,
  filterByConfidence,
  traverse,
  findSupportingEvidence,
  findConflictingEvidence,
  findAffectedDomains,
  validateTopology,
  assembleGraph,
  graphChecksum,
  createSnapshot,
  graphToIndexInputs,
  recommendationQueries,
  evidenceChanges,
  nodeAddedEvent,
  changeEvent,
  assemblyEvents,
} from "./index.js";

const NOW = "2026-07-20T00:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const prov = (): Provenance => buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler" });

interface Over { id?: string; source?: EngineEvidenceItem["source"]; state?: EngineEvidenceItem["state"]; value?: Record<string, unknown>; domains?: EngineEvidenceItem["affectedDomains"]; metric?: string; timestamp?: string; reliabilityOverride?: number; }
const item = (o: Over = {}): EngineEvidenceItem =>
  normalizeEvidence(
    { id: o.id ?? "e1", scanId: "s1", source: o.source ?? "website", state: o.state, timestamp: o.timestamp ?? NOW, provenance: prov(),
      value: o.value ?? { k: 1 }, affectedDomains: o.domains ?? ["digital_presence"], metadata: o.metric ? { metric: o.metric } : {}, reliabilityOverride: o.reliabilityOverride },
    NOW,
  );
const bundle = (items: EngineEvidenceItem[]): EvidenceBundle => ({ scanId: "s1", items });

/* ---- node/edge validation ------------------------------------------------- */
describe("node + edge validation", () => {
  it("assembled nodes/edges satisfy the schema; addNode/addEdge ignore repeat ids", () => {
    const g = assembleGraph(bundle([item()]), NOW);
    for (const n of g.nodes) expect(graphNodeSchema.parse(n)).toEqual(n);
    for (const e of g.edges) expect(graphEdgeSchema.parse(e)).toEqual(e);
    expect(intelligenceGraphSchema.parse(g)).toEqual(g);
    const one = addNode(emptyGraph("s1", null), g.nodes[0]!);
    expect(addNode(one, g.nodes[0]!).nodes).toHaveLength(1); // repeat id ignored
  });
});

/* ---- assembly ------------------------------------------------------------- */
describe("evidence → graph assembly", () => {
  it("builds business + domain + evidence + metric nodes with grounded edges", () => {
    const g = assembleGraph(bundle([item({ metric: "conversion", domains: ["sales"] })]), NOW);
    expect(filterByType(g, "business").map((n) => n.id)).toEqual(["biz:s1"]);
    expect(filterByType(g, "domain").map((n) => n.id)).toEqual(["dom:s1:sales"]);
    expect(filterByType(g, "evidence").map((n) => n.id)).toEqual(["ev:e1"]);
    expect(filterByType(g, "metric").map((n) => n.id)).toEqual(["met:s1:conversion"]);
    const types = g.edges.map((e) => e.type).sort();
    expect(types).toContain("belongs_to");
    expect(types).toContain("indicates");
    expect(types).toContain("observed_in"); // observed evidence → factual edge
    expect(types).toContain("supports");
    expect(types).toContain("affects");
  });
  it("estimated/inferred evidence retains its state and does NOT create observed_in", () => {
    const g = assembleGraph(bundle([item({ source: "brand", domains: ["brand"] })]), NOW); // brand defaults inferred
    const ev = filterByType(g, "evidence")[0]!;
    expect(g.edges.find((e) => e.type === "indicates")!.attributes.state).toBe("inferred");
    expect(g.edges.some((e) => e.type === "observed_in")).toBe(false);
    expect(ev.confidence.value).toBeGreaterThanOrEqual(0);
  });
  it("infers no unsupported relationships (only grounded edge types appear)", () => {
    const g = assembleGraph(bundle([item()]), NOW);
    const grounded = new Set(["belongs_to", "indicates", "observed_in", "supports", "affects", "contradicts", "supersedes"]);
    for (const e of g.edges) expect(grounded.has(e.type)).toBe(true);
    expect(g.edges.some((e) => e.type === "depends_on" || e.type === "caused_by")).toBe(false);
  });
  it("unavailable evidence creates no node or factual claim", () => {
    const g = assembleGraph(bundle([item({ id: "u", source: "analytics", state: "unavailable", value: {}, domains: ["automation"] })]), NOW);
    expect(filterByType(g, "evidence")).toHaveLength(0);
    expect(filterByType(g, "domain")).toHaveLength(0);
    expect(g.nodes.map((n) => n.type)).toEqual(["business"]); // only the root
  });
});

/* ---- operations ----------------------------------------------------------- */
describe("graph operations", () => {
  const g = assembleGraph(bundle([item({ id: "e1", domains: ["sales"], metric: "m" }), item({ id: "e2", source: "seo", domains: ["marketing"] })]), NOW);
  it("merge + dedupe are id-based and idempotent", () => {
    expect(mergeGraphs(g, g)).toEqual(dedupeEdges(dedupeNodes(g)));
    expect(mergeGraphs(g, g).nodes).toHaveLength(g.nodes.length);
  });
  it("filter by type / domain / confidence", () => {
    expect(filterByDomain(g, "sales").every((n) => n.domain === "sales")).toBe(true);
    expect(filterByType(g, "evidence")).toHaveLength(2);
    expect(filterByConfidence(g, 0).length).toBe(g.nodes.length);
    expect(filterByConfidence(g, 101)).toHaveLength(0);
  });
  it("traverse + supporting/conflicting evidence + affected domains", () => {
    expect(traverse(g, "ev:e1")).toContain("dom:s1:sales"); // evidence → domain
    expect(findSupportingEvidence(g, "dom:s1:sales")).toContain("e1");
    expect(findConflictingEvidence(g, "dom:s1:sales")).toEqual([]);
    expect(findAffectedDomains(g)).toEqual(["marketing", "sales"]);
  });
  it("topological validation flags missing nodes and depends_on cycles", () => {
    expect(validateTopology(g)).toEqual([]);
    const dangling = addEdge(emptyGraph("s1", null), graphEdgeSchema.parse({ id: "x", type: "supports", from: "a", to: "b", scanId: "s1", clientId: null, provenance: prov(), confidence: item().confidence, createdAt: NOW }));
    expect(validateTopology(dangling).length).toBeGreaterThan(0);
    const n = (id: string): GraphNode => graphNodeSchema.parse({ id, type: "system", scanId: "s1", clientId: null, provenance: prov(), confidence: item().confidence, createdAt: NOW });
    const e = (from: string, to: string) => graphEdgeSchema.parse({ id: `${from}${to}`, type: "depends_on", from, to, scanId: "s1", clientId: null, provenance: prov(), confidence: item().confidence, createdAt: NOW });
    let cyc: IntelligenceGraph = emptyGraph("s1", null);
    cyc = addNode(addNode(cyc, n("A")), n("B"));
    cyc = addEdge(addEdge(cyc, e("A", "B")), e("B", "A"));
    expect(validateTopology(cyc).some((p) => p.includes("cycle"))).toBe(true);
  });
});

/* ---- provenance preservation ---------------------------------------------- */
describe("provenance preservation", () => {
  it("evidence node keeps the item's exact provenance; merge never overwrites it", () => {
    const it1 = item({ id: "e1" });
    const g = assembleGraph(bundle([it1]), NOW);
    const ev = g.nodes.find((n) => n.id === "ev:e1")!;
    expect(ev.provenance).toEqual(it1.provenance);
    // a merge with a same-id node of different provenance keeps the first (no silent overwrite)
    const tampered = { ...ev, provenance: { ...ev.provenance, origin: "https://evil" } };
    const merged = mergeGraphs(g, { scanId: "s1", clientId: null, nodes: [tampered], edges: [] });
    expect(merged.nodes.find((n) => n.id === "ev:e1")!.provenance.origin).toBe(it1.provenance.origin);
  });
});

/* ---- conflict-aware updates ----------------------------------------------- */
describe("conflict-aware evidence updates", () => {
  const subj = { domains: ["sales" as const], metric: "conv" };
  it("confirmed / conflicted / superseded / confidence_changed / became_unavailable", () => {
    const prevItem = item({ id: "p", value: { v: 1 }, ...subj });
    const confirm = evidenceChanges("s1", [prevItem], [item({ id: "a", value: { v: 1 }, ...subj })]);
    expect(confirm[0]!.kind).toBe("confirmed");
    const conflict = evidenceChanges("s1", [prevItem], [item({ id: "b", value: { v: 2 }, ...subj })]);
    expect(conflict[0]!.kind).toBe("conflicted");
    const supersede = evidenceChanges("s1", [prevItem], [item({ id: "c", value: { v: 1 }, timestamp: daysAgo(-0), ...subj })]);
    // same value, strictly newer timestamp
    const sup = evidenceChanges("s1", [item({ id: "p2", value: { v: 1 }, timestamp: daysAgo(5), ...subj })], [item({ id: "c2", value: { v: 1 }, timestamp: NOW, ...subj })]);
    expect(sup[0]!.kind).toBe("superseded");
    const confChanged = evidenceChanges("s1", [prevItem], [item({ id: "d", value: { v: 1 }, reliabilityOverride: 0.2, ...subj })]);
    expect(confChanged[0]!.kind).toBe("confidence_changed");
    const unavail = evidenceChanges("s1", [prevItem], [item({ id: "e", source: "analytics", state: "unavailable", value: {}, domains: ["automation"] })]);
    expect(unavail[0]!.kind).toBe("became_unavailable");
    expect(supersede).toBeDefined();
  });
  it("a brand-new subject is not reported as a change (it is an addition)", () => {
    expect(evidenceChanges("s1", [], [item()])).toEqual([]);
  });
  it("assembly draws contradicts + supersedes edges", () => {
    const key = { domains: ["sales" as const], metric: "conv" };
    const conflictG = assembleGraph(bundle([item({ id: "a", value: { v: 1 }, ...key }), item({ id: "b", value: { v: 2 }, ...key })]), NOW);
    expect(conflictG.edges.some((e) => e.type === "contradicts")).toBe(true);
    const supG = assembleGraph(bundle([item({ id: "old", value: { v: 1 }, timestamp: daysAgo(5), ...key }), item({ id: "new", value: { v: 1 }, timestamp: NOW, ...key })]), NOW);
    expect(supG.edges.some((e) => e.type === "supersedes")).toBe(true);
  });
});

/* ---- snapshots ------------------------------------------------------------ */
describe("snapshots + checksum determinism", () => {
  it("identical input → identical graph + checksum; different input differs", () => {
    const b = bundle([item({ id: "e1", domains: ["sales"] })]);
    expect(assembleGraph(b, NOW)).toEqual(assembleGraph(b, NOW));
    expect(graphChecksum(assembleGraph(b, NOW))).toBe(graphChecksum(assembleGraph(b, NOW)));
    const other = graphChecksum(assembleGraph(bundle([item({ id: "e1", domains: ["brand"] })]), NOW));
    expect(other).not.toBe(graphChecksum(assembleGraph(b, NOW)));
  });
  it("snapshot carries counts, coverage, confidence, conflicts, checksum", () => {
    const b = bundle([item({ id: "e1", domains: ["sales"] })]);
    const snap = createSnapshot(assembleGraph(b, NOW), b, 1, NOW);
    expect(graphSnapshotSchema.parse(snap)).toEqual(snap);
    expect(snap.nodeCount).toBeGreaterThan(0);
    expect(snap.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(createSnapshot(assembleGraph(b, NOW), b, 1, NOW)).toEqual(snap); // deterministic
  });
});

/* ---- Index integration ---------------------------------------------------- */
describe("graph → Index inputs (formula untouched)", () => {
  it("one input per canonical dimension; unavailable flagged; score left unscored", () => {
    const inputs = graphToIndexInputs(bundle([item({ domains: ["sales"] })]));
    expect(inputs).toHaveLength(10);
    const sales = inputs.find((i) => i.dimension === "sales")!;
    expect(sales.unavailable).toBe(false);
    expect(sales.coverage).toBe(1);
    expect(sales.scoreInput).toBeNull(); // scoring is a later sprint
    expect(inputs.find((i) => i.dimension === "brand")!.unavailable).toBe(true);
  });
});

/* ---- recommendation queries ----------------------------------------------- */
describe("recommendation-query outputs (no recommendations generated)", () => {
  it("weakest domains, evidence gaps, conflicting conclusions; empty risk/opp until reasoning adds them", () => {
    const key = { domains: ["sales" as const], metric: "conv" };
    const b = bundle([item({ id: "a", value: { v: 1 }, ...key }), item({ id: "b", value: { v: 2 }, ...key })]);
    const q = recommendationQueries(assembleGraph(b, NOW), b);
    expect(q.weakestDomains.map((w) => w.dimension)).toContain("sales");
    expect(q.evidenceGaps).toContain("brand"); // no evidence
    expect(q.conflictingConclusions.length).toBeGreaterThan(0);
    expect(q.strongestRisks).toEqual([]); // no risk nodes yet
    expect(q.highestConfidenceOpportunities).toEqual([]);
    expect(q.potentialQuickWins).toEqual([]);
  });
});

/* ---- events + edge cases -------------------------------------------------- */
describe("events + empty/malformed cases", () => {
  it("event constructors are typed; change maps to §8 events", () => {
    const g = assembleGraph(bundle([item()]), NOW);
    expect(nodeAddedEvent(g.nodes[0]!, NOW).type).toBe("graph.node_added");
    expect(assemblyEvents(g, NOW).length).toBe(g.nodes.length + g.edges.length);
    const changes = evidenceChanges("s1", [item({ id: "p", value: { v: 1 }, domains: ["sales"], metric: "m" })], [item({ id: "b", value: { v: 2 }, domains: ["sales"], metric: "m" })]);
    expect(changeEvent(changes[0]!, "s1", NOW)!.type).toBe("graph.evidence_conflicted");
    expect(changeEvent({ ...changes[0]!, kind: "became_unavailable" }, "s1", NOW)).toBeNull();
  });
  it("empty bundle → business root only; empty graph has no topology problems", () => {
    const g = assembleGraph(bundle([]), NOW);
    expect(g.nodes.map((n) => n.type)).toEqual(["business"]);
    expect(g.edges).toEqual([]);
    expect(validateTopology(emptyGraph("s1", null))).toEqual([]);
    expect(graphToIndexInputs(bundle([])).every((i) => i.unavailable)).toBe(true);
  });
});
