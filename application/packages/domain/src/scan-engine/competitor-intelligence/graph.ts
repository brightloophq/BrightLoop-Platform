/* =============================================================================
 * Intelligence Graph integration (Sprint 10 §12) — PURE.
 *
 * Projects competitor intelligence into graph nodes + edges: competitor nodes,
 * `compares_to` edges, benchmark metric nodes, gap finding nodes, opportunity and
 * risk nodes — every one carrying full provenance/evidence attribution.
 *
 * The existing graph is NEVER mutated in place. `extendGraph` returns a NEW graph
 * value, and `recordCompetitorGraphArtifact` registers it as a new artifact VERSION
 * with source artifact ids and a deterministic checksum.
 * ========================================================================== */

import {
  intelligenceGraphSchema,
  type CompetitiveGap,
  type CompetitiveOutput,
  type EngineCompetitorBenchmark,
  type EngineCompetitorCandidate,
  type EvidenceConfidence,
  type GraphEdge,
  type GraphNode,
  type IntelligenceGraph,
  type PipelineArtifact,
  type Provenance,
} from "@brightloop/schema";
import { recordArtifact, type ArtifactRegistry } from "../pipeline-run/artifacts.js";

export interface GraphProjectionInput {
  scanId: string;
  clientId: string | null;
  /** The client's own business node id, for compares_to edges. */
  clientNodeId: string;
  candidates: readonly EngineCompetitorCandidate[];
  selectedIds: readonly string[];
  benchmarks: readonly EngineCompetitorBenchmark[];
  gaps: readonly CompetitiveGap[];
  outputs?: readonly CompetitiveOutput[];
  provenance: Provenance;
  confidence: EvidenceConfidence;
  now: string;
  idFor: (kind: string, key: string) => string;
}

export interface GraphProjection {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build the competitor projection (nodes + edges). Deterministic: inputs are
 * processed in id/dimension order and every id comes from the supplied generator.
 */
export function buildCompetitorProjection(input: GraphProjectionInput): GraphProjection {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const base = {
    scanId: input.scanId,
    clientId: input.clientId,
    provenance: input.provenance,
    confidence: input.confidence,
    createdAt: input.now,
    validFrom: null,
    validTo: null,
  };

  const selected = [...input.selectedIds].sort();
  const byId = new Map(input.candidates.map((c) => [c.id, c]));

  // ---- competitor nodes + compares_to edges (client → competitor)
  for (const id of selected) {
    const c = byId.get(id);
    if (c === undefined) continue;
    const nodeId = input.idFor("competitor", id);
    nodes.push({
      ...base,
      id: nodeId,
      type: "competitor",
      label: c.businessName,
      domain: null,
      evidenceIds: c.evidenceIds,
      confidence: c.confidence,
      attributes: { normalizedDomain: c.normalizedDomain, status: c.status, candidateId: c.id },
    });
    edges.push({
      ...base,
      id: input.idFor("edge_compares_to", id),
      type: "compares_to",
      from: input.clientNodeId,
      to: nodeId,
      evidenceIds: c.evidenceIds,
      confidence: c.confidence,
      attributes: { candidateId: c.id },
    });
  }

  // ---- benchmark metric nodes (available ones only — never fabricate a node)
  for (const b of [...input.benchmarks].filter((x) => x.available).sort((a, z) => (a.id < z.id ? -1 : 1))) {
    const nodeId = input.idFor("metric", b.id);
    nodes.push({
      ...base,
      id: nodeId,
      type: "metric",
      label: `${b.dimension}${b.competitorId === null ? " (client)" : ""}`,
      domain: null,
      evidenceIds: b.evidenceIds,
      confidence: b.confidence,
      attributes: { dimension: b.dimension, normalizedScore: b.normalizedScore, evidenceState: b.evidenceState, competitorId: b.competitorId },
    });
    if (b.competitorId !== null) {
      edges.push({
        ...base,
        id: input.idFor("edge_observed_in", b.id),
        type: "observed_in",
        from: nodeId,
        to: input.idFor("competitor", b.competitorId),
        evidenceIds: b.evidenceIds,
        confidence: b.confidence,
        attributes: {},
      });
    }
  }

  // ---- gap finding nodes + affects edges into their Index domains
  for (const g of [...input.gaps].sort((a, z) => (a.dimension < z.dimension ? -1 : 1))) {
    const nodeId = input.idFor("finding", g.id);
    nodes.push({
      ...base,
      id: nodeId,
      type: "finding",
      label: `${g.type} gap: ${g.dimension}`,
      domain: g.affectedDomains[0] ?? null,
      evidenceIds: g.evidenceIds,
      attributes: { gapId: g.id, gapType: g.type, severity: g.severity, absoluteGap: g.absoluteGap },
    });
  }

  // ---- opportunity / risk nodes from the derived outputs
  for (const o of [...(input.outputs ?? [])].sort((a, z) => (a.id < z.id ? -1 : 1))) {
    const type = o.kind === "threat" ? "risk" : o.kind === "opportunity" || o.kind === "differentiation" ? "opportunity" : null;
    if (type === null) continue;
    nodes.push({
      ...base,
      id: input.idFor(type, o.id),
      type,
      label: o.title,
      domain: o.affectedDomains[0] ?? null,
      evidenceIds: o.evidenceIds,
      attributes: { outputId: o.id, kind: o.kind, severity: o.severity },
    });
  }

  return { nodes, edges };
}

/**
 * Return a NEW graph with the projection appended. The input graph value is not
 * mutated; nodes/edges already present (by id) are not duplicated. Pure.
 */
export function extendGraph(graph: IntelligenceGraph, projection: GraphProjection): IntelligenceGraph {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  return intelligenceGraphSchema.parse({
    scanId: graph.scanId,
    clientId: graph.clientId,
    nodes: [...graph.nodes, ...projection.nodes.filter((n) => !nodeIds.has(n.id))],
    edges: [...graph.edges, ...projection.edges.filter((e) => !edgeIds.has(e.id))],
  });
}

/**
 * Register the extended graph as a NEW artifact version carrying source artifact
 * ids + a deterministic checksum. The upstream graph artifact is left untouched.
 */
export function recordCompetitorGraphArtifact(
  registry: ArtifactRegistry,
  graph: IntelligenceGraph,
  opts: { id: string; pipelineRunId: string; scanId: string; sourceArtifactIds?: string[]; version?: number; now: string },
): PipelineArtifact {
  const priorGraphId = registry.latestByKind.get("intelligence_graph");
  const priorVersion = priorGraphId === undefined ? 1 : (registry.byId.get(priorGraphId)?.version ?? 1);
  const sources = opts.sourceArtifactIds ?? (priorGraphId === undefined ? [] : [priorGraphId]);
  return recordArtifact(registry, {
    id: opts.id,
    pipelineRunId: opts.pipelineRunId,
    scanId: opts.scanId,
    kind: "intelligence_graph",
    payload: graph,
    sourceArtifactIds: sources,
    validationStatus: "valid",
    provenance: { stage: "competitor_intelligence" },
    version: opts.version ?? priorVersion + 1,
    now: opts.now,
  });
}
