/* =============================================================================
 * Reliability scoring (PDF 27 §05/§08) — PURE.
 *
 * Each source carries a base trustworthiness weight; the evidence STATE then
 * modifies it (an observed fact outweighs an inference). Effective reliability =
 * base × state modifier, optionally overridden per-item. Deterministic.
 * ========================================================================== */

import { evidenceSourceSchema, type EvidenceSource, type EvidenceState } from "@brightloop/schema";

/** Canonical base reliability per source (0–1). Official first-party surfaces
 *  rank highest; inferred/estimated sources lower. */
export const SOURCE_RELIABILITY: Record<EvidenceSource, number> = {
  website: 0.95,
  pages: 0.9,
  seo: 0.85,
  performance: 0.9,
  accessibility: 0.85,
  security: 0.85,
  brand: 0.5,
  forms: 0.8,
  analytics: 0.9,
  social_media: 0.7,
  google_business: 0.85,
  reviews: 0.75,
  competitors: 0.6,
  industry_benchmarks: 0.65,
  public_apis: 0.8,
  manual_input: 0.9,
  client_documents: 0.9,
  existing_crm: 0.85,
  historical_scans: 0.7,
};

/** How much the evidence state discounts reliability. Unavailable carries none. */
export const STATE_RELIABILITY_MODIFIER: Record<EvidenceState, number> = {
  observed: 1,
  estimated: 0.7,
  inferred: 0.5,
  unavailable: 0,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Base reliability for a source (before state discount). */
export function reliabilityForSource(source: EvidenceSource): number {
  return SOURCE_RELIABILITY[source];
}

/**
 * Effective reliability = (override ?? source base) × state modifier, clamped to
 * [0,1]. Pure + deterministic.
 */
export function effectiveReliability(source: EvidenceSource, state: EvidenceState, override?: number): number {
  const base = clamp01(override ?? SOURCE_RELIABILITY[source]);
  return clamp01(base * STATE_RELIABILITY_MODIFIER[state]);
}

/** Guard: every source has a weight (a spec edit can't silently drop one). */
export function everySourceWeighted(): boolean {
  return evidenceSourceSchema.options.every((s) => typeof SOURCE_RELIABILITY[s] === "number");
}
