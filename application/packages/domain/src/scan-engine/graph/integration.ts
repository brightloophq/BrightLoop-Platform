/* =============================================================================
 * Graph → Index inputs (§6) + recommendation-query outputs (§7) — PURE.
 *
 * Produces the raw INPUTS the canonical Index formula (computeIndex, unchanged)
 * and future recommendation logic consume. This sprint does NOT score dimensions
 * or generate recommendations — `scoreInput` is null (honestly unscored), and the
 * node-typed queries return whatever the graph holds (empty until reasoning adds
 * risk/opportunity/finding nodes). Deterministic.
 * ========================================================================== */

import {
  indexDimensionSchema,
  type IndexDimension,
  type EvidenceBundle,
  type IntelligenceGraph,
  type IndexDimensionInput,
  type RecommendationQueryOutputs,
  type GraphNode,
} from "@brightloop/schema";
import { aggregateConfidence } from "../evidence/confidence.js";
import { detectConflicts } from "../evidence/conflict.js";
import { filterByType } from "./operations.js";

/** One IndexDimensionInput per canonical dimension. Score is left unscored (null). */
export function graphToIndexInputs(bundle: EvidenceBundle): IndexDimensionInput[] {
  const conflicts = detectConflicts(bundle);
  return indexDimensionSchema.options.map((dimension: IndexDimension) => {
    const items = bundle.items.filter((i) => i.affectedDomains.includes(dimension));
    const factual = items.filter((i) => i.state !== "unavailable");
    return {
      dimension,
      supportingEvidenceIds: factual.map((i) => i.id).sort(),
      scoreInput: null, // scoring is a later sprint; the formula is untouched
      coverage: factual.length > 0 ? 1 : 0,
      confidence: aggregateConfidence(factual),
      conflicts: conflicts.filter((c) => c.dimension === dimension),
      unavailable: factual.length === 0,
    };
  });
}

const byConfidenceDesc = (a: GraphNode, b: GraphNode) => b.confidence.value - a.confidence.value || (a.id < b.id ? -1 : 1);

/** Query outputs future recommendation logic consumes. Generates NO recommendations. */
export function recommendationQueries(graph: IntelligenceGraph, bundle: EvidenceBundle): RecommendationQueryOutputs {
  const inputs = graphToIndexInputs(bundle);
  return {
    strongestRisks: filterByType(graph, "risk").sort(byConfidenceDesc),
    highestConfidenceOpportunities: filterByType(graph, "opportunity").sort(byConfidenceDesc),
    weakestDomains: filterByType(graph, "domain")
      .map((n) => ({ dimension: n.domain!, scoreInput: null, confidence: n.confidence }))
      .filter((w) => w.dimension != null)
      .sort((a, b) => a.confidence.value - b.confidence.value || (a.dimension < b.dimension ? -1 : 1)),
    evidenceGaps: inputs.filter((i) => i.unavailable).map((i) => i.dimension),
    conflictingConclusions: inputs.flatMap((i) => i.conflicts).filter((c) => c.type === "conflict"),
    potentialQuickWins: filterByType(graph, "opportunity").filter((n) => n.attributes.effort === "low").sort(byConfidenceDesc),
  };
}
