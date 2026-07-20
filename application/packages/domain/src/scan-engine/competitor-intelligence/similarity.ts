/* =============================================================================
 * Relevance & similarity scoring (Sprint 10 §4 · AIS-005 §03) — PURE.
 *
 *   Sim(c)  = Σ wk · simk(client, c)      — weighted per-axis similarity
 *   Rank(c) = Sim(c) · C(c)               — similarity scaled by evidence confidence
 *
 * Ten normalized 0–100 factors, each declaring its source inputs, evidence,
 * confidence, limitations, and missing-data treatment. A factor with no data is
 * `unavailable` and its weight is REDISTRIBUTED — missing data lowers confidence,
 * it never becomes an invented match.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  similarityScoreSchema,
  type EngineCompetitorCandidate,
  type SimilarityFactor,
  type SimilarityFactorKey,
  type SimilarityScore,
} from "@brightloop/schema";

/** Default axis weights (AIS-005 §03: per-category weighting is caller-overridable). */
export const DEFAULT_SIMILARITY_WEIGHTS: Record<SimilarityFactorKey, number> = {
  industry_similarity: 0.2,
  product_service_overlap: 0.2,
  geography_relevance: 0.15,
  customer_segment_overlap: 0.12,
  business_model_similarity: 0.1,
  price_position_similarity: 0.07,
  channel_overlap: 0.06,
  market_scale_similarity: 0.04,
  digital_presence_comparability: 0.03,
  data_availability: 0.03,
};

/** The client profile each candidate is compared against. */
export interface ClientProfile {
  industry?: string | null;
  subIndustry?: string | null;
  geography?: string[];
  customerSegment?: string[];
  businessModel?: EngineCompetitorCandidate["businessModel"];
  productsServices?: string[];
  pricePosition?: EngineCompetitorCandidate["pricePosition"];
  observedChannels?: string[];
  /** Optional scale proxy (e.g. employee band, traffic band) for market-scale similarity. */
  marketScale?: number | null;
  digitalPresenceScore?: number | null;
}

/** Jaccard overlap of two string sets, 0–100. Null when either side is empty. Pure. */
export function setOverlap(a: readonly string[], b: readonly string[]): number | null {
  if (a.length === 0 || b.length === 0) return null;
  const A = new Set(a.map((x) => x.toLowerCase().trim()));
  const B = new Set(b.map((x) => x.toLowerCase().trim()));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? null : Math.round((inter / union) * 100);
}

/** Ordinal closeness of two price positions, 0–100. Null when either is unknown. Pure. */
const PRICE_ORDER = ["budget", "mid_market", "premium", "luxury"];
export function priceCloseness(a: EngineCompetitorCandidate["pricePosition"], b: EngineCompetitorCandidate["pricePosition"]): number | null {
  const ia = PRICE_ORDER.indexOf(a);
  const ib = PRICE_ORDER.indexOf(b);
  if (ia < 0 || ib < 0) return null;
  return Math.round((1 - Math.abs(ia - ib) / (PRICE_ORDER.length - 1)) * 100);
}

/** Relative closeness of two magnitudes, 0–100. Null when either is absent. Pure. */
export function scaleCloseness(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  const hi = Math.max(Math.abs(a), Math.abs(b));
  if (hi === 0) return 100;
  return Math.round((1 - Math.abs(a - b) / hi) * 100);
}

function factor(key: SimilarityFactorKey, score: number | null, sourceInputs: string[], evidenceIds: string[], confidence: number, limitation?: string): SimilarityFactor {
  return {
    key,
    score: score === null ? null : Math.max(0, Math.min(100, Math.round(score))),
    sourceInputs,
    evidenceIds,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    limitations: limitation === undefined ? [] : [limitation],
    missingDataTreatment: score === null ? "unavailable" : "observed",
    formulaVersion: COMPETITOR_FORMULA_VERSION,
  };
}

/** Compute the ten similarity factors for a candidate. Deterministic. */
export function computeSimilarityFactors(client: ClientProfile, candidate: EngineCompetitorCandidate): SimilarityFactor[] {
  const ev = candidate.evidenceIds;
  const c = candidate.confidence.value;
  const unavailable = (k: SimilarityFactorKey, why: string) => factor(k, null, [], ev, c, why);

  const industry =
    client.industry == null || candidate.industry == null
      ? unavailable("industry_similarity", "industry unknown on one or both sides")
      : factor("industry_similarity", candidate.industry === client.industry ? (candidate.subIndustry != null && candidate.subIndustry === client.subIndustry ? 100 : 80) : 0, ["client.industry", "candidate.industry"], ev, c);

  const products = setOverlap(client.productsServices ?? [], candidate.productsServices);
  const geography = setOverlap(client.geography ?? [], candidate.geography);
  const segment = setOverlap(client.customerSegment ?? [], candidate.customerSegment);
  const channels = setOverlap(client.observedChannels ?? [], candidate.observedChannels);
  const price = priceCloseness(client.pricePosition ?? "unknown", candidate.pricePosition);
  const scale = scaleCloseness(client.marketScale, null);
  const digital = scaleCloseness(client.digitalPresenceScore, null);

  const model =
    client.businessModel === undefined || client.businessModel === "unknown" || candidate.businessModel === "unknown"
      ? unavailable("business_model_similarity", "business model unknown on one or both sides")
      : factor("business_model_similarity", candidate.businessModel === client.businessModel ? 100 : 25, ["client.businessModel", "candidate.businessModel"], ev, c);

  // data availability: share of the candidate's descriptive fields actually populated
  const populated = [candidate.industry != null, candidate.geography.length > 0, candidate.customerSegment.length > 0, candidate.productsServices.length > 0, candidate.pricePosition !== "unknown", candidate.observedChannels.length > 0].filter(Boolean).length;
  const availability = Math.round((populated / 6) * 100);

  return [
    industry,
    products === null ? unavailable("product_service_overlap", "no product/service data on one side") : factor("product_service_overlap", products, ["client.productsServices", "candidate.productsServices"], ev, c),
    geography === null ? unavailable("geography_relevance", "no geography data on one side") : factor("geography_relevance", geography, ["client.geography", "candidate.geography"], ev, c),
    segment === null ? unavailable("customer_segment_overlap", "no segment data on one side") : factor("customer_segment_overlap", segment, ["client.customerSegment", "candidate.customerSegment"], ev, c),
    model,
    price === null ? unavailable("price_position_similarity", "price position unknown on one side") : factor("price_position_similarity", price, ["client.pricePosition", "candidate.pricePosition"], ev, c),
    channels === null ? unavailable("channel_overlap", "no channel data on one side") : factor("channel_overlap", channels, ["client.observedChannels", "candidate.observedChannels"], ev, c),
    scale === null ? unavailable("market_scale_similarity", "market scale not measured for the candidate") : factor("market_scale_similarity", scale, ["client.marketScale"], ev, c),
    digital === null ? unavailable("digital_presence_comparability", "digital presence not measured for the candidate") : factor("digital_presence_comparability", digital, ["client.digitalPresenceScore"], ev, c),
    factor("data_availability", availability, ["candidate.*"], ev, c),
  ];
}

/**
 * Aggregate Sim(c) with weight redistribution over available factors, then
 * Rank(c) = Sim(c) × C(c). Deterministic.
 */
export function computeSimilarity(
  client: ClientProfile,
  candidate: EngineCompetitorCandidate,
  weights: Record<SimilarityFactorKey, number> = DEFAULT_SIMILARITY_WEIGHTS,
): SimilarityScore {
  const factors = computeSimilarityFactors(client, candidate);
  const available = factors.filter((f) => f.score !== null);
  const missing = factors.filter((f) => f.score === null);
  const warnings = missing.map((f) => `${f.key} unavailable; weight redistributed (not scored as a match).`);

  const weightTotal = available.reduce((acc, f) => acc + weights[f.key], 0);
  const aggregate = weightTotal === 0 ? 0 : available.reduce((acc, f) => acc + (weights[f.key] / weightTotal) * f.score!, 0);
  if (weightTotal === 0) warnings.push("No similarity axis could be computed; aggregate is 0 with no evidentiary support.");

  const confidence01 = candidate.confidence.value / 100;
  return similarityScoreSchema.parse({
    candidateId: candidate.id,
    aggregate: Math.round(aggregate),
    confidenceScaled: Math.round(aggregate * confidence01),
    factors,
    unavailableFactors: missing.map((f) => f.key),
    warnings,
    formulaVersion: COMPETITOR_FORMULA_VERSION,
  });
}
