/* =============================================================================
 * Intelligence Graph — SNAPSHOTS (PDF 27 §03) — PURE.
 *
 * An immutable, checksummed snapshot. Identical graph content + evidence yields
 * an identical checksum (nodes/edges are id-sorted before hashing). Deterministic
 * given `generatedAt`.
 * ========================================================================== */

import { graphSnapshotSchema, type IntelligenceGraph, type EvidenceBundle, type GraphSnapshot } from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { coverageSummary, confidenceSummary, conflictSummary } from "../evidence/bundle.js";

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Content checksum of a graph — id-sorted so it is independent of insertion order. */
export function graphChecksum(graph: IntelligenceGraph): string {
  return hashContent({
    scanId: graph.scanId,
    clientId: graph.clientId,
    nodes: [...graph.nodes].sort(byId),
    edges: [...graph.edges].sort(byId),
  });
}

/** Build an immutable snapshot. Coverage/confidence/conflicts come from the bundle. */
export function createSnapshot(graph: IntelligenceGraph, bundle: EvidenceBundle, version: number, generatedAt: string): GraphSnapshot {
  return graphSnapshotSchema.parse({
    version,
    scanId: graph.scanId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    domainCoverage: coverageSummary(bundle),
    confidence: confidenceSummary(bundle),
    conflicts: conflictSummary(bundle),
    checksum: graphChecksum(graph),
    generatedAt,
  });
}
