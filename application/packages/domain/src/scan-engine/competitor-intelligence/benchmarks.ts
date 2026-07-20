/* =============================================================================
 * Benchmark records & evidence basis (Sprint 10 §6/§7 · AIS-005 §05) — PURE.
 *
 * RULE 2: never fabricate a benchmark. A dimension without evidence for a party is
 * recorded `available:false` with a null value — never back-filled from the client,
 * an average, or a category default. An `estimated` value MUST declare its basis;
 * an `inferred` value stays clearly marked; a comparison is only as strong as the
 * WEAKER side's evidence, and weak bases take a confidence penalty.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  engineCompetitorBenchmarkSchema,
  type BenchmarkDimension,
  type EngineCompetitorBenchmark,
  type EvidenceConfidence,
  type EvidenceState,
  type Freshness,
  type NormalizationPolicy,
  type Provenance,
} from "@brightloop/schema";
import { normalizeValue } from "./normalize.js";

/** Confidence multiplier per evidence basis (AIS-005 §07: weak basis is penalized). */
export const BASIS_PENALTY: Record<EvidenceState, number> = { observed: 1.0, estimated: 0.8, inferred: 0.6, unavailable: 0 };

/** Whether a basis may support a direct like-for-like comparison. Pure. */
export function supportsDirectComparison(state: EvidenceState): boolean {
  return state === "observed";
}

/** The effective basis of a comparison — the WEAKER of the two sides. Pure. */
const BASIS_RANK: Record<EvidenceState, number> = { observed: 0, estimated: 1, inferred: 2, unavailable: 3 };
export function weakerBasis(a: EvidenceState, b: EvidenceState): EvidenceState {
  return BASIS_RANK[a] >= BASIS_RANK[b] ? a : b;
}

/** Confidence for a comparison cell, penalized by the weaker side's basis. Pure. */
export function comparisonConfidence(aConfidence: number, aState: EvidenceState, bConfidence: number, bState: EvidenceState): number {
  const basis = weakerBasis(aState, bState);
  return Math.round(Math.min(aConfidence, bConfidence) * BASIS_PENALTY[basis]);
}

export interface NewBenchmarkInput {
  id: string;
  scanId: string;
  dimension: BenchmarkDimension;
  subjectBusinessId: string;
  competitorId?: string | null;
  /** Raw value; omit/null when the dimension could not be evidenced. */
  value?: number | string | null;
  unit?: string | null;
  evidenceIds?: string[];
  evidenceState: EvidenceState;
  confidence: EvidenceConfidence;
  freshness?: Freshness | null;
  provenance: Provenance;
  /** REQUIRED when evidenceState is `estimated` (§7). */
  estimationBasis?: string | null;
  policy?: NormalizationPolicy;
  population?: readonly (number | null)[];
  limitations?: string[];
}

/**
 * Build a benchmark record. Availability is derived, never asserted: a value is
 * available only when it is non-null AND the basis is not `unavailable` AND
 * evidence backs it. An `estimated` value without a declared basis is DOWNGRADED to
 * unavailable with a limitation — the engine refuses to publish an unexplained estimate.
 */
export function newBenchmark(input: NewBenchmarkInput): EngineCompetitorBenchmark {
  const limitations = [...(input.limitations ?? [])];
  const evidenceIds = input.evidenceIds ?? [];
  let state = input.evidenceState;
  let raw = input.value ?? null;

  if (state === "estimated" && (input.estimationBasis == null || input.estimationBasis.trim() === "")) {
    limitations.push("Estimated value supplied without an estimation basis; recorded Unavailable rather than published unexplained.");
    state = "unavailable";
    raw = null;
  }
  if (state !== "unavailable" && evidenceIds.length === 0) {
    limitations.push("No evidence linked; recorded Unavailable rather than fabricated.");
    state = "unavailable";
    raw = null;
  }

  const available = raw !== null && state !== "unavailable";
  const numeric = typeof raw === "number" ? raw : null;
  const normalized = available && input.policy !== undefined ? normalizeValue(raw, input.policy, input.population ?? []) : null;

  if (available && input.policy !== undefined && normalized === null) {
    limitations.push("Value could not be normalized under the supplied policy; comparison withheld.");
  }
  if (state === "inferred") limitations.push("Inferred value — not a direct measurement.");

  return engineCompetitorBenchmarkSchema.parse({
    id: input.id,
    scanId: input.scanId,
    dimension: input.dimension,
    subjectBusinessId: input.subjectBusinessId,
    competitorId: input.competitorId ?? null,
    value: numeric,
    normalizedScore: normalized,
    unit: input.unit ?? null,
    evidenceIds,
    evidenceState: state,
    confidence: input.confidence,
    freshness: input.freshness ?? null,
    provenance: input.provenance,
    available,
    estimationBasis: input.estimationBasis ?? null,
    limitations,
    formulaVersion: COMPETITOR_FORMULA_VERSION,
  });
}

/** Benchmarks for one dimension, competitors only (client excluded). Pure. */
export function competitorBenchmarks(all: readonly EngineCompetitorBenchmark[], dimension: BenchmarkDimension): EngineCompetitorBenchmark[] {
  return all.filter((b) => b.dimension === dimension && b.competitorId !== null).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The client's benchmark for a dimension (competitorId === null). Pure. */
export function clientBenchmark(all: readonly EngineCompetitorBenchmark[], dimension: BenchmarkDimension): EngineCompetitorBenchmark | null {
  return all.find((b) => b.dimension === dimension && b.competitorId === null) ?? null;
}

/** Share of dimensions actually evidenced for a party, 0–1 (coverage reporting). Pure. */
export function benchmarkCoverage(all: readonly EngineCompetitorBenchmark[], dimensions: readonly BenchmarkDimension[], competitorId: string | null): number {
  if (dimensions.length === 0) return 0;
  const covered = dimensions.filter((d) => all.some((b) => b.dimension === d && b.competitorId === competitorId && b.available)).length;
  return covered / dimensions.length;
}
