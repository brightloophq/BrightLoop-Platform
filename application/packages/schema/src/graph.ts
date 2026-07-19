/* =============================================================================
 * Business / Intelligence Graph — CONTRACTS (PDF 27 §03/§04 · L4).
 *
 * The typed, queryable representation a business is normalized into from an
 * EvidenceBundle. Shapes only — assembly, operations, snapshots, Index inputs,
 * and recommendation queries are pure domain code
 * (@brightloop/domain/scan-engine/graph/*). Named `IntelligenceGraph` to sit
 * beside the existing L4 `BusinessGraph` PORT (which produces it).
 * ========================================================================== */

import { z } from "zod";
import { indexDimensionSchema } from "./engine.js";
import {
  provenanceSchema,
  evidenceConfidenceSchema,
  coverageSummarySchema,
  evidenceConflictSchema,
} from "./evidence.js";

/* ---- node + edge types ---------------------------------------------------- */
export const graphNodeTypeSchema = z.enum([
  "business",
  "domain",
  "metric",
  "evidence",
  "finding",
  "risk",
  "opportunity",
  "competitor",
  "process",
  "system",
  "capability",
]);
export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;

export const graphEdgeTypeSchema = z.enum([
  "belongs_to",
  "supports",
  "contradicts",
  "affects",
  "depends_on",
  "compares_to",
  "indicates",
  "caused_by",
  "mitigates",
  "supersedes",
  "observed_in",
]);
export type GraphEdgeType = z.infer<typeof graphEdgeTypeSchema>;

/* ---- shared attribution (every node + edge carries the full trace) -------- */
const attributionShape = {
  scanId: z.string(),
  clientId: z.string().nullable(),
  provenance: provenanceSchema,
  confidence: evidenceConfidenceSchema,
  evidenceIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  validFrom: z.string().nullable().default(null),
  validTo: z.string().nullable().default(null),
  attributes: z.record(z.string(), z.unknown()).default({}),
};

export const graphNodeSchema = z.object({
  id: z.string(),
  type: graphNodeTypeSchema,
  label: z.string().nullable().default(null),
  domain: indexDimensionSchema.nullable().default(null), // set on domain/metric/finding nodes
  ...attributionShape,
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string(),
  type: graphEdgeTypeSchema,
  from: z.string(), // node id
  to: z.string(), // node id
  ...attributionShape,
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const intelligenceGraphSchema = z.object({
  scanId: z.string(),
  clientId: z.string().nullable(),
  nodes: z.array(graphNodeSchema).default([]),
  edges: z.array(graphEdgeSchema).default([]),
});
export type IntelligenceGraph = z.infer<typeof intelligenceGraphSchema>;

/* ---- snapshots (immutable, checksummed) ----------------------------------- */
export const graphSnapshotSchema = z.object({
  version: z.number().int().nonnegative(),
  scanId: z.string(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  domainCoverage: coverageSummarySchema,
  confidence: evidenceConfidenceSchema,
  conflicts: z.array(evidenceConflictSchema).default([]),
  checksum: z.string(),
  generatedAt: z.string(),
});
export type GraphSnapshot = z.infer<typeof graphSnapshotSchema>;

/* ---- conflict-aware change results (§4) ----------------------------------- */
export const graphChangeKindSchema = z.enum([
  "confirmed",
  "conflicted",
  "superseded",
  "confidence_changed",
  "became_unavailable",
]);
export type GraphChangeKind = z.infer<typeof graphChangeKindSchema>;

export const graphChangeSchema = z.object({
  kind: graphChangeKindSchema,
  nodeId: z.string(),
  evidenceIds: z.array(z.string()).default([]),
  previousConfidence: z.number().int().min(0).max(100).nullable().default(null),
  newConfidence: z.number().int().min(0).max(100).nullable().default(null),
  detail: z.string(),
});
export type GraphChange = z.infer<typeof graphChangeSchema>;

/* ---- pure domain events (§8) — no transport, no persistence --------------- */
export const graphEventTypeSchema = z.enum([
  "graph.node_added",
  "graph.edge_added",
  "graph.evidence_confirmed",
  "graph.evidence_conflicted",
  "graph.evidence_superseded",
  "graph.snapshot_created",
]);
export type GraphEventType = z.infer<typeof graphEventTypeSchema>;

export const graphEventSchema = z.object({
  type: graphEventTypeSchema,
  scanId: z.string(),
  at: z.string(),
  refId: z.string(), // node id / edge id / snapshot checksum
  detail: z.string().nullable().default(null),
});
export type GraphEvent = z.infer<typeof graphEventSchema>;

/* ---- Index integration (§6) ----------------------------------------------- */
export const indexDimensionInputSchema = z.object({
  dimension: indexDimensionSchema,
  supportingEvidenceIds: z.array(z.string()).default([]),
  scoreInput: z.number().min(0).max(100).nullable(), // null when unavailable / no evidence
  coverage: z.number().min(0).max(1),
  confidence: evidenceConfidenceSchema,
  conflicts: z.array(evidenceConflictSchema).default([]),
  unavailable: z.boolean(), // no factual evidence collected for this dimension
});
export type IndexDimensionInput = z.infer<typeof indexDimensionInputSchema>;

/* ---- recommendation-query outputs (§7 — inputs only, no recommendations) --- */
export const weakDomainSchema = z.object({
  dimension: indexDimensionSchema,
  scoreInput: z.number().min(0).max(100).nullable(),
  confidence: evidenceConfidenceSchema,
});
export type WeakDomain = z.infer<typeof weakDomainSchema>;

export const recommendationQueryOutputsSchema = z.object({
  strongestRisks: z.array(graphNodeSchema).default([]),
  highestConfidenceOpportunities: z.array(graphNodeSchema).default([]),
  weakestDomains: z.array(weakDomainSchema).default([]),
  evidenceGaps: z.array(indexDimensionSchema).default([]),
  conflictingConclusions: z.array(evidenceConflictSchema).default([]),
  potentialQuickWins: z.array(graphNodeSchema).default([]),
});
export type RecommendationQueryOutputs = z.infer<typeof recommendationQueryOutputsSchema>;
