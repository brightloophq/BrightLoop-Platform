/* =============================================================================
 * Intelligence Graph — ASSEMBLY (PDF 27 §03/§04) — PURE.
 *
 * EvidenceBundle → nodes → typed relationships. Evidence-grounded only:
 *   • Observed evidence creates factual edges (observed_in + indicates).
 *   • Estimated / Inferred evidence creates indicates edges that RETAIN their
 *     state (edge.attributes.state) and confidence — never presented as fact.
 *   • Unavailable evidence NEVER creates a node or a factual claim.
 * No unsupported relationship is inferred. Deterministic given `now`: identical
 * input yields identical node/edge ids and content.
 * ========================================================================== */

import {
  graphNodeSchema,
  graphEdgeSchema,
  type EngineEvidenceItem,
  type EvidenceBundle,
  type EngineStage,
  type GraphNode,
  type GraphEdge,
  type GraphNodeType,
  type GraphEdgeType,
  type IntelligenceGraph,
  type EvidenceConfidence,
  type IndexDimension,
} from "@brightloop/schema";
import { emptyGraph, addNode, addEdge } from "./operations.js";
import { aggregateConfidence } from "../evidence/confidence.js";
import { subjectKey } from "../evidence/conflict.js";
import { buildProvenance } from "../evidence/provenance.js";
import { hashContent } from "../evidence/hash.js";

const metricOf = (item: EngineEvidenceItem) => (typeof item.metadata.metric === "string" ? item.metadata.metric : null);
const edgeId = (type: GraphEdgeType, from: string, to: string) => `e:${type}:${from}->${to}`;

export function assembleGraph(bundle: EvidenceBundle, now: string, clientId: string | null = null): IntelligenceGraph {
  let g = emptyGraph(bundle.scanId, clientId);
  const factual = bundle.items.filter((i) => i.state !== "unavailable"); // unavailable → no factual claims

  const computedProv = (stage: EngineStage) => buildProvenance({ origin: "computed", collectedAt: now, method: "computed", stage });
  const node = (over: { id: string; type: GraphNodeType; label: string | null; domain: IndexDimension | null; confidence: EvidenceConfidence; provenance: ReturnType<typeof computedProv>; evidenceIds: string[]; validFrom?: string | null; attributes?: Record<string, unknown> }): GraphNode =>
    graphNodeSchema.parse({ scanId: bundle.scanId, clientId, createdAt: now, validFrom: over.validFrom ?? null, ...over });
  const edge = (type: GraphEdgeType, from: string, to: string, confidence: EvidenceConfidence, provenance: ReturnType<typeof computedProv>, evidenceIds: string[], attributes: Record<string, unknown> = {}): GraphEdge =>
    graphEdgeSchema.parse({ id: edgeId(type, from, to), type, from, to, scanId: bundle.scanId, clientId, createdAt: now, confidence, provenance, evidenceIds, attributes });

  // ---- business root ----
  const bizId = `biz:${bundle.scanId}`;
  g = addNode(g, node({ id: bizId, type: "business", label: "Business", domain: null, confidence: aggregateConfidence(factual), provenance: computedProv("business_profile"), evidenceIds: factual.map((i) => i.id) }));

  // ---- domain nodes ----
  const domains = [...new Set(factual.flatMap((i) => i.affectedDomains))].sort() as IndexDimension[];
  for (const d of domains) {
    const domId = `dom:${bundle.scanId}:${d}`;
    const items = factual.filter((i) => i.affectedDomains.includes(d));
    const conf = aggregateConfidence(items);
    g = addNode(g, node({ id: domId, type: "domain", label: d, domain: d, confidence: conf, provenance: computedProv("normalization"), evidenceIds: items.map((i) => i.id) }));
    g = addEdge(g, edge("belongs_to", domId, bizId, conf, computedProv("normalization"), []));
  }

  // ---- evidence nodes + edges (+ metric nodes) ----
  for (const item of factual) {
    const evId = `ev:${item.id}`;
    g = addNode(g, node({ id: evId, type: "evidence", label: item.source, domain: item.affectedDomains[0] ?? null, confidence: item.confidence, provenance: item.provenance, evidenceIds: [item.id], validFrom: item.timestamp }));
    for (const d of item.affectedDomains) {
      const domId = `dom:${bundle.scanId}:${d}`;
      // indicates edge retains the evidence STATE (never presented as fact for estimated/inferred)
      g = addEdge(g, edge("indicates", evId, domId, item.confidence, item.provenance, [item.id], { state: item.state }));
      if (item.state === "observed") g = addEdge(g, edge("observed_in", evId, domId, item.confidence, item.provenance, [item.id]));
    }
    const metric = metricOf(item);
    if (metric) {
      const metId = `met:${bundle.scanId}:${metric}`;
      g = addNode(g, node({ id: metId, type: "metric", label: metric, domain: item.affectedDomains[0] ?? null, confidence: item.confidence, provenance: computedProv("normalization"), evidenceIds: [item.id] }));
      g = addEdge(g, edge("supports", evId, metId, item.confidence, item.provenance, [item.id]));
      for (const d of item.affectedDomains) g = addEdge(g, edge("affects", metId, `dom:${bundle.scanId}:${d}`, item.confidence, computedProv("normalization"), [item.id]));
    }
  }

  // ---- conflict edges (contradicts / supersedes) grouped by subject ----
  const groups = new Map<string, EngineEvidenceItem[]>();
  for (const i of factual) groups.set(subjectKey(i), [...(groups.get(subjectKey(i)) ?? []), i]);
  for (const [, group] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (group.length < 2) continue;
    const conf = aggregateConfidence(group);
    const distinctValues = new Set(group.map((i) => hashContent(i.value)));
    if (distinctValues.size >= 2) {
      const ids = group.map((i) => i.id).sort();
      for (let k = 1; k < ids.length; k += 1) g = addEdge(g, edge("contradicts", `ev:${ids[0]}`, `ev:${ids[k]}`, conf, computedProv("ai_reasoning"), ids));
    } else {
      const newest = group.reduce((a, b) => (Date.parse(b.timestamp) > Date.parse(a.timestamp) ? b : a));
      for (const older of group) {
        if (Date.parse(older.timestamp) < Date.parse(newest.timestamp)) g = addEdge(g, edge("supersedes", `ev:${newest.id}`, `ev:${older.id}`, conf, computedProv("ai_reasoning"), [newest.id, older.id]));
      }
    }
  }

  return g;
}
