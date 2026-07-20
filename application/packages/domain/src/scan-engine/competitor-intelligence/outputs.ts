/* =============================================================================
 * Opportunity & threat outputs (Sprint 10 §11 · AIS-005 §07) — PURE.
 *
 * Every output is DERIVED from the gap/benchmark set, never authored free-hand, and
 * links back to its benchmarks, gaps, evidence, competitors, and graph nodes.
 *
 * These are competitive OBSERVATIONS, not recommendations — Sprint 9 owns
 * recommendation generation, and nothing here produces or ranks a move.
 * ========================================================================== */

import {
  type CompetitiveGap,
  type CompetitiveOutput,
  type CompetitiveOutputKind,
  type EngineCompetitorBenchmark,
} from "@brightloop/schema";
import { orderGaps } from "./gaps.js";

export interface OutputsInput {
  idFor: (kind: CompetitiveOutputKind, index: number) => string;
  gaps: readonly CompetitiveGap[];
  benchmarks: readonly EngineCompetitorBenchmark[];
  /** Graph node ids per dimension, when the graph layer has produced them. */
  graphNodeIdsFor?: (gap: CompetitiveGap) => string[];
  competitorIds?: readonly string[];
}

function benchmarkIdsFor(benchmarks: readonly EngineCompetitorBenchmark[], gap: CompetitiveGap): string[] {
  return benchmarks.filter((b) => b.dimension === gap.dimension).map((b) => b.id).sort();
}

/**
 * Derive the full structured output set: opportunities, threats, differentiation,
 * parity gaps, defensible strengths, evidence gaps, and monitoring candidates.
 * Deterministic — gaps are processed in severity order and ids are index-stable.
 */
export function buildCompetitiveOutputs(input: OutputsInput): CompetitiveOutput[] {
  const ordered = orderGaps(input.gaps);
  const outputs: CompetitiveOutput[] = [];
  let index = 0;

  const push = (kind: CompetitiveOutputKind, gap: CompetitiveGap, title: string, detail: string) => {
    outputs.push({
      id: input.idFor(kind, index++),
      kind,
      dimension: gap.dimension,
      title,
      detail,
      benchmarkIds: benchmarkIdsFor(input.benchmarks, gap),
      gapIds: [gap.id],
      evidenceIds: gap.evidenceIds,
      competitorIds: [...(input.competitorIds ?? [])].sort(),
      graphNodeIds: input.graphNodeIdsFor?.(gap) ?? [],
      affectedDomains: gap.affectedDomains,
      confidence: gap.confidence,
      severity: gap.severity,
      limitations: gap.limitations,
      reviewRequired: gap.reviewRequired,
    });
  };

  for (const gap of ordered) {
    switch (gap.type) {
      case "deficit": {
        push("opportunity", gap, `Close the ${gap.dimension} gap`, `Client trails the competitor median by ${Math.abs(gap.absoluteGap ?? 0).toFixed(1)} points.`);
        // a rival lead is simultaneously a threat when it is material
        if (gap.severity === "high" || gap.severity === "critical") {
          push("threat", gap, `Rival lead on ${gap.dimension}`, `Competitors lead by ${Math.abs(gap.absoluteGap ?? 0).toFixed(1)} points (${gap.severity}).`);
        }
        break;
      }
      case "advantage": {
        push("defensible_strength", gap, `Defend the ${gap.dimension} lead`, `Client leads the competitor median by ${(gap.absoluteGap ?? 0).toFixed(1)} points.`);
        push("differentiation", gap, `Differentiate on ${gap.dimension}`, "Client uniquely leads this dimension within the evidenced set.");
        break;
      }
      case "parity": {
        push("parity_gap", gap, `Parity on ${gap.dimension}`, "Client sits within the parity band of the competitor median.");
        break;
      }
      case "unknown": {
        push("evidence_gap", gap, `Evidence gap on ${gap.dimension}`, "Insufficient evidence on one or both sides; no comparison is asserted.");
        push("monitoring_candidate", gap, `Monitor ${gap.dimension}`, "Re-scan to establish a comparable value for this dimension.");
        break;
      }
    }
  }
  return outputs;
}

/** Outputs of a given kind, in derivation order. Pure. */
export function outputsOfKind(outputs: readonly CompetitiveOutput[], kind: CompetitiveOutputKind): CompetitiveOutput[] {
  return outputs.filter((o) => o.kind === kind);
}
