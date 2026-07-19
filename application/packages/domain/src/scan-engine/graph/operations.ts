/* =============================================================================
 * Intelligence Graph — OPERATIONS (PDF 27 §04) — PURE.
 *
 * Immutable graph operations: add / merge / dedupe / filter / traverse / query.
 * Every function returns a new graph (no mutation) and is deterministic. Nodes
 * and edges are de-duplicated by id; provenance is never silently overwritten
 * (first occurrence wins — updates go through ./updates.ts).
 * ========================================================================== */

import type { IndexDimension, GraphNode, GraphEdge, GraphNodeType, IntelligenceGraph } from "@brightloop/schema";

export function emptyGraph(scanId: string, clientId: string | null): IntelligenceGraph {
  return { scanId, clientId, nodes: [], edges: [] };
}

/** Add a node, ignoring a repeat id (first wins — provenance preserved). */
export function addNode(graph: IntelligenceGraph, node: GraphNode): IntelligenceGraph {
  if (graph.nodes.some((n) => n.id === node.id)) return graph;
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** Add an edge, ignoring a repeat id. */
export function addEdge(graph: IntelligenceGraph, edge: GraphEdge): IntelligenceGraph {
  if (graph.edges.some((e) => e.id === edge.id)) return graph;
  return { ...graph, edges: [...graph.edges, edge] };
}

const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of items) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
};

export function dedupeNodes(graph: IntelligenceGraph): IntelligenceGraph {
  return { ...graph, nodes: dedupeById(graph.nodes) };
}
export function dedupeEdges(graph: IntelligenceGraph): IntelligenceGraph {
  return { ...graph, edges: dedupeById(graph.edges) };
}

/** Union two graphs (same scan), de-duplicating nodes + edges by id. */
export function mergeGraphs(a: IntelligenceGraph, b: IntelligenceGraph): IntelligenceGraph {
  return {
    scanId: a.scanId,
    clientId: a.clientId,
    nodes: dedupeById([...a.nodes, ...b.nodes]),
    edges: dedupeById([...a.edges, ...b.edges]),
  };
}

export function filterByDomain(graph: IntelligenceGraph, dimension: IndexDimension): GraphNode[] {
  return graph.nodes.filter((n) => n.domain === dimension);
}
export function filterByType(graph: IntelligenceGraph, type: GraphNodeType): GraphNode[] {
  return graph.nodes.filter((n) => n.type === type);
}
export function filterByConfidence(graph: IntelligenceGraph, minValue: number): GraphNode[] {
  return graph.nodes.filter((n) => n.confidence.value >= minValue);
}

/** Node ids reachable from `startId` in ≤ `maxDepth` hops (directed). Deterministic (id-sorted). */
export function traverse(graph: IntelligenceGraph, startId: string, maxDepth = Infinity): string[] {
  const adjacency = new Map<string, string[]>();
  for (const e of graph.edges) adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to]);
  const visited = new Set<string>();
  let frontier = [startId];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const to of (adjacency.get(id) ?? []).sort()) {
        if (!visited.has(to)) {
          visited.add(to);
          next.push(to);
        }
      }
    }
    frontier = next;
    depth += 1;
  }
  return [...visited].sort();
}

/** Evidence ids supporting a node: its own refs + those on `supports`/`indicates`/`observed_in` edges into it. */
export function findSupportingEvidence(graph: IntelligenceGraph, nodeId: string): string[] {
  const ids = new Set<string>();
  const node = graph.nodes.find((n) => n.id === nodeId);
  for (const id of node?.evidenceIds ?? []) ids.add(id);
  for (const e of graph.edges) {
    if (e.to === nodeId && (e.type === "supports" || e.type === "indicates" || e.type === "observed_in")) {
      for (const id of e.evidenceIds) ids.add(id);
    }
  }
  return [...ids].sort();
}

/** Evidence ids conflicting with a node (via `contradicts` edges touching it). */
export function findConflictingEvidence(graph: IntelligenceGraph, nodeId: string): string[] {
  const ids = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === "contradicts" && (e.from === nodeId || e.to === nodeId)) for (const id of e.evidenceIds) ids.add(id);
  }
  return [...ids].sort();
}

/** All Index dimensions touched by the graph's domain-bearing nodes. */
export function findAffectedDomains(graph: IntelligenceGraph): IndexDimension[] {
  const dims = new Set<IndexDimension>();
  for (const n of graph.nodes) if (n.domain) dims.add(n.domain);
  return [...dims].sort();
}

/**
 * Topological validation: reports edges that reference a missing node, and any
 * cycle among `depends_on` edges (which must form a DAG). Returns [] when valid.
 */
export function validateTopology(graph: IntelligenceGraph): string[] {
  const problems: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.from)) problems.push(`edge ${e.id} from missing node ${e.from}`);
    if (!ids.has(e.to)) problems.push(`edge ${e.id} to missing node ${e.to}`);
  }
  // cycle check over depends_on only
  const deps = new Map<string, string[]>();
  for (const e of graph.edges) if (e.type === "depends_on") deps.set(e.from, [...(deps.get(e.from) ?? []), e.to]);
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  const dfs = (id: string): boolean => {
    if (state.get(id) === 1) return true; // back-edge → cycle
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const to of (deps.get(id) ?? []).sort()) if (dfs(to)) return true;
    state.set(id, 2);
    return false;
  };
  for (const id of [...deps.keys()].sort()) if (dfs(id)) { problems.push("cycle detected among depends_on edges"); break; }
  return problems;
}
