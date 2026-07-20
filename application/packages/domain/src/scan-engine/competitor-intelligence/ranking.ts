/* =============================================================================
 * Competitor ranking (Sprint 10 §5 · AIS-005 §02/§03) — PURE.
 *
 * Total, stable ordering over VALIDATED candidates only:
 *   1. validation status (validated first)
 *   2. directness of competition (direct → partial → adjacent → unknown)
 *   3. aggregate similarity (desc)
 *   4. evidence confidence (desc)
 *   5. geographic relevance (desc)
 *   6. data availability (desc)
 *   7. candidate id (asc) — the stable tie-break
 *
 * The set is capped (default 10, AIS-005 §02 "set sizing") and every inclusion,
 * rejection, exclusion, and ambiguity is recorded — the grid is never padded.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  competitorRankingSchema,
  type CompetitionDirectness,
  type CompetitorRanking,
  type EngineCompetitorCandidate,
  type RankedCompetitor,
  type SimilarityScore,
} from "@brightloop/schema";

export const DEFAULT_MAX_SELECTED = 10;
/** Similarity floor below which a candidate is not admitted (AIS-005 selection threshold). */
export const DEFAULT_SIMILARITY_THRESHOLD = 30;

const DIRECTNESS_RANK: Record<CompetitionDirectness, number> = { direct: 0, partial: 1, adjacent: 2, unknown: 3 };

/** Directness derived from the similarity profile. Deterministic. */
export function deriveDirectness(similarity: SimilarityScore): CompetitionDirectness {
  const factor = (k: string) => similarity.factors.find((f) => f.key === k)?.score ?? null;
  const industry = factor("industry_similarity");
  const products = factor("product_service_overlap");
  const geography = factor("geography_relevance");
  if (industry === null && products === null) return "unknown";
  if ((industry ?? 0) >= 80 && (products ?? 0) >= 50 && (geography ?? 100) >= 50) return "direct";
  if ((industry ?? 0) >= 50 || (products ?? 0) >= 30) return "partial";
  return "adjacent";
}

export interface CompetitorRankingInput {
  candidates: readonly EngineCompetitorCandidate[];
  similarities: ReadonlyMap<string, SimilarityScore>;
  maxSelected?: number;
  similarityThreshold?: number;
}

interface Row {
  candidate: EngineCompetitorCandidate;
  similarity: SimilarityScore;
  directness: CompetitionDirectness;
  geography: number;
  availability: number;
}

function compare(a: Row, b: Row): number {
  if (DIRECTNESS_RANK[a.directness] !== DIRECTNESS_RANK[b.directness]) return DIRECTNESS_RANK[a.directness] - DIRECTNESS_RANK[b.directness];
  if (a.similarity.aggregate !== b.similarity.aggregate) return b.similarity.aggregate - a.similarity.aggregate;
  if (a.candidate.confidence.value !== b.candidate.confidence.value) return b.candidate.confidence.value - a.candidate.confidence.value;
  if (a.geography !== b.geography) return b.geography - a.geography;
  if (a.availability !== b.availability) return b.availability - a.availability;
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
}

/** The structured reason `a` outranks `b` — the first key that differed. Pure. */
export function competitorComparisonReason(a: Row, b: Row): string {
  if (DIRECTNESS_RANK[a.directness] !== DIRECTNESS_RANK[b.directness]) return `more direct competitor (${a.directness} > ${b.directness})`;
  if (a.similarity.aggregate !== b.similarity.aggregate) return `higher similarity (${a.similarity.aggregate} > ${b.similarity.aggregate})`;
  if (a.candidate.confidence.value !== b.candidate.confidence.value) return `stronger evidence confidence (${a.candidate.confidence.value} > ${b.candidate.confidence.value})`;
  if (a.geography !== b.geography) return "closer geographic relevance";
  if (a.availability !== b.availability) return "more complete data";
  return "stable_id_tiebreak";
}

/**
 * Rank and select the competitor set. Only `validated` candidates are eligible;
 * rejected / excluded / ambiguous / unavailable are reported separately, never
 * promoted to fill the set. Deterministic.
 */
export function rankCompetitors(input: CompetitorRankingInput): CompetitorRanking {
  const maxSelected = input.maxSelected ?? DEFAULT_MAX_SELECTED;
  const threshold = input.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const rejected: { candidateId: string; reason: string }[] = [];
  const ambiguous: string[] = [];
  const excluded: string[] = [];
  const rows: Row[] = [];

  for (const candidate of input.candidates) {
    if (candidate.status === "ambiguous") {
      ambiguous.push(candidate.id);
      continue;
    }
    if (candidate.status === "excluded") {
      excluded.push(candidate.id);
      continue;
    }
    if (candidate.status === "rejected" || candidate.status === "unavailable") {
      rejected.push({ candidateId: candidate.id, reason: candidate.exclusionReasons[0] ?? candidate.status });
      continue;
    }
    if (candidate.status !== "validated") {
      rejected.push({ candidateId: candidate.id, reason: `not validated (status: ${candidate.status})` });
      continue;
    }
    const similarity = input.similarities.get(candidate.id);
    if (similarity === undefined) {
      rejected.push({ candidateId: candidate.id, reason: "no similarity score computed" });
      continue;
    }
    if (similarity.aggregate < threshold) {
      rejected.push({ candidateId: candidate.id, reason: `similarity ${similarity.aggregate} below threshold ${threshold}` });
      continue;
    }
    const factor = (k: string) => similarity.factors.find((f) => f.key === k)?.score ?? 0;
    rows.push({ candidate, similarity, directness: deriveDirectness(similarity), geography: factor("geography_relevance"), availability: factor("data_availability") });
  }

  rows.sort(compare);
  const kept = rows.slice(0, maxSelected);
  for (const row of rows.slice(maxSelected)) rejected.push({ candidateId: row.candidate.id, reason: `outside the top ${maxSelected} of the competitor set` });

  const selected: RankedCompetitor[] = kept.map((row, i) => ({
    candidateId: row.candidate.id,
    rank: i + 1,
    directness: row.directness,
    similarity: row.similarity,
    comparisonToNext: i + 1 < kept.length ? competitorComparisonReason(row, kept[i + 1]!) : null,
  }));

  return competitorRankingSchema.parse({
    selected,
    rejected: rejected.sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1)),
    ambiguous: ambiguous.sort(),
    excluded: excluded.sort(),
    metadata: {
      consideredCount: input.candidates.length,
      maxSelected,
      orderedBy: ["status", "directness", "similarity", "confidence", "geography", "data_availability", "id"],
      formulaVersion: COMPETITOR_FORMULA_VERSION,
    },
  });
}
