/* =============================================================================
 * Graph domain EVENTS (PDF 27 §08/§18) — PURE constructors.
 *
 * The canonical graph events as inspectable data. No transport, no persistence —
 * a sink is a composition-root concern. `at` is supplied (no clock).
 * ========================================================================== */

import {
  graphEventSchema,
  type GraphEvent,
  type GraphNode,
  type GraphEdge,
  type GraphChange,
  type GraphSnapshot,
  type IntelligenceGraph,
} from "@brightloop/schema";

export function nodeAddedEvent(node: GraphNode, at: string): GraphEvent {
  return graphEventSchema.parse({ type: "graph.node_added", scanId: node.scanId, at, refId: node.id, detail: node.type });
}
export function edgeAddedEvent(edge: GraphEdge, at: string): GraphEvent {
  return graphEventSchema.parse({ type: "graph.edge_added", scanId: edge.scanId, at, refId: edge.id, detail: edge.type });
}
export function snapshotCreatedEvent(snapshot: GraphSnapshot, at: string): GraphEvent {
  return graphEventSchema.parse({ type: "graph.snapshot_created", scanId: snapshot.scanId, at, refId: snapshot.checksum, detail: `v${snapshot.version}` });
}

const CHANGE_EVENT: Partial<Record<GraphChange["kind"], GraphEvent["type"]>> = {
  confirmed: "graph.evidence_confirmed",
  conflicted: "graph.evidence_conflicted",
  superseded: "graph.evidence_superseded",
};

/** Map a GraphChange to its §8 event, when one exists (confidence_changed /
 *  became_unavailable have no §8 event and yield null). */
export function changeEvent(change: GraphChange, scanId: string, at: string): GraphEvent | null {
  const type = CHANGE_EVENT[change.kind];
  if (!type) return null;
  return graphEventSchema.parse({ type, scanId, at, refId: change.nodeId, detail: change.detail });
}

/** node_added + edge_added events for an assembled graph, in id order. */
export function assemblyEvents(graph: IntelligenceGraph, at: string): GraphEvent[] {
  const nodes = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)).map((n) => nodeAddedEvent(n, at));
  const edges = [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) => edgeAddedEvent(e, at));
  return [...nodes, ...edges];
}
