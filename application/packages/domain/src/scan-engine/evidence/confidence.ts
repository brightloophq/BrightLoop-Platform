/* =============================================================================
 * Confidence model (PDF 27 §08) — PURE.
 *
 * Composite confidence (0–100) as the GEOMETRIC MEAN of six factors: coverage,
 * reliability, freshness, agreement, completeness, provenance quality. A
 * geometric mean means any factor near zero caps the composite — the engine
 * never raises confidence to fill a gap. Returns a value, a band, and the inputs
 * (inspectable metadata — no natural-language explanation).
 * ========================================================================== */

import {
  evidenceConfidenceInputsSchema,
  type EvidenceConfidenceInputs,
  type EvidenceConfidence,
  type ConfidenceBand,
  type EngineEvidenceItem,
} from "@brightloop/schema";

export function confidenceBand(value: number): ConfidenceBand {
  if (value < 20) return "very_low";
  if (value < 40) return "low";
  if (value < 60) return "moderate";
  if (value < 80) return "high";
  return "very_high";
}

/** Composite confidence from the six factors (geometric mean → 0–100 + band). */
export function computeEvidenceConfidence(inputs: EvidenceConfidenceInputs): EvidenceConfidence {
  const p = evidenceConfidenceInputsSchema.parse(inputs);
  const factors = [p.coverage, p.reliability, p.freshness, p.agreement, p.completeness, p.provenanceQuality];
  const product = factors.reduce((acc, f) => acc * f, 1);
  const geomean = Math.pow(product, 1 / factors.length);
  const value = Math.round(geomean * 100);
  return { value, band: confidenceBand(value), inputs: p };
}

const mean = (ns: number[]) => (ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length);

/**
 * Aggregate confidence across items: reliability-weighted mean of each factor,
 * then recompute the composite. Deterministic; empty → all-zero (very_low).
 */
export function aggregateConfidence(items: EngineEvidenceItem[]): EvidenceConfidence {
  if (items.length === 0) {
    return computeEvidenceConfidence({ coverage: 0, reliability: 0, freshness: 0, agreement: 0, completeness: 0, provenanceQuality: 0 });
  }
  const totalWeight = items.reduce((a, i) => a + i.reliability, 0);
  const weighted = (pick: (i: EvidenceConfidenceInputs) => number) =>
    totalWeight === 0
      ? mean(items.map((i) => pick(i.confidence.inputs)))
      : items.reduce((a, i) => a + pick(i.confidence.inputs) * i.reliability, 0) / totalWeight;
  return computeEvidenceConfidence({
    coverage: weighted((i) => i.coverage),
    reliability: weighted((i) => i.reliability),
    freshness: weighted((i) => i.freshness),
    agreement: weighted((i) => i.agreement),
    completeness: weighted((i) => i.completeness),
    provenanceQuality: weighted((i) => i.provenanceQuality),
  });
}
