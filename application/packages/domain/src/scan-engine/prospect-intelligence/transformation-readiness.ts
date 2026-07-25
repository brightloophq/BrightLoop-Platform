/* =============================================================================
 * Transformation readiness (Phase C · Sprint C5) — PURE, weighted, documented.
 *
 * Readiness answers a narrower question than maturity: how much of a working
 * foundation exists for a transformation programme to build on?
 *
 * Six factors, each composed from declared maturity categories with published
 * weights (`READINESS_FACTOR_WEIGHTS`). A factor whose categories were all
 * unassessable is EXCLUDED and its weight redistributed — it is never scored
 * zero, because "not observed" is not "not present".
 * ========================================================================== */

import {
  READINESS_FACTOR_WEIGHTS,
  readinessFactorScoreSchema,
  readinessFactorSchema,
  transformationReadinessSchema,
  type EngineEvidenceItem,
  type MaturityAssessment,
  type MaturityCategory,
  type ReadinessFactor,
  type ReadinessFactorScore,
  type TransformationReadiness,
} from "@brightloop/schema";
import { aggregateProspectConfidence } from "./confidence.js";
import { redistributeWeights, weightCoverage, weightedComposite, weightedSignalScore, type ResolvedSignal } from "./scoring.js";

/**
 * Which maturity categories compose each readiness factor, and their relative
 * weight WITHIN the factor. Declared here so a readiness figure is always
 * explainable from the category scores that produced it.
 */
export const FACTOR_COMPOSITION: Record<ReadinessFactor, { category: MaturityCategory; weight: number }[]> = {
  digital_foundation: [
    { category: "website", weight: 3 },
    { category: "performance", weight: 2 },
    { category: "accessibility", weight: 1 },
  ],
  market_visibility: [
    { category: "seo", weight: 3 },
    { category: "content", weight: 2 },
    { category: "social_presence", weight: 1 },
  ],
  conversion_capability: [
    { category: "lead_capture", weight: 3 },
    { category: "customer_journey", weight: 2 },
  ],
  trust_and_credibility: [
    { category: "trust", weight: 3 },
    { category: "branding", weight: 2 },
  ],
  measurement_capability: [{ category: "analytics", weight: 1 }],
  operational_signal: [
    { category: "operations", weight: 2 },
    { category: "automation", weight: 1 },
  ],
};

const FACTOR_LABEL: Record<ReadinessFactor, string> = {
  digital_foundation: "digital foundation",
  market_visibility: "market visibility",
  conversion_capability: "conversion capability",
  trust_and_credibility: "trust and credibility",
  measurement_capability: "measurement capability",
  operational_signal: "operational signal",
};

export interface ReadinessInput {
  scanId: string;
  items: readonly EngineEvidenceItem[];
  maturity: MaturityAssessment;
  conflicts?: number;
  now: string;
}

/** Score ONE factor from its composing categories. Null when none scored. */
export function scoreFactor(factor: ReadinessFactor, maturity: MaturityAssessment): ReadinessFactorScore {
  const composition = FACTOR_COMPOSITION[factor];
  const byCategory = new Map(maturity.categories.map((c) => [c.category, c]));

  const resolved: ResolvedSignal[] = [];
  const missing: string[] = [];
  const evidenceIds = new Set<string>();
  const contributing: MaturityCategory[] = [];

  for (const part of composition) {
    const scored = byCategory.get(part.category);
    if (scored === undefined || scored.score === null) {
      missing.push(part.category);
      continue;
    }
    resolved.push({
      key: part.category,
      category: part.category,
      weight: part.weight,
      value: scored.score / 100,
      evidenceIds: scored.evidenceIds,
    });
    contributing.push(part.category);
    for (const id of scored.evidenceIds) evidenceIds.add(id);
  }

  const { score, calculation } = weightedSignalScore(resolved, missing);

  const limitations: string[] = [];
  if (missing.length > 0) {
    limitations.push(`${missing.length} contributing categor${missing.length === 1 ? "y was" : "ies were"} unassessable and excluded: ${missing.sort().join(", ")}.`);
  }
  if (score === null) {
    limitations.push(`No category composing ${FACTOR_LABEL[factor]} could be assessed, so the factor is excluded rather than scored zero.`);
  }

  return readinessFactorScoreSchema.parse({
    factor,
    score,
    weight: 0, // assigned by the assessment after redistribution
    contributingCategories: contributing.sort(),
    evidenceIds: [...evidenceIds].sort(),
    calculation,
    available: score !== null,
    limitations,
  });
}

/**
 * Compute transformation readiness.
 *
 *   factorScore  = round(100 × Σ(categoryWeight × categoryScore/100) / ΣcategoryWeight)
 *   appliedWeight = baseWeight × 100 / Σ baseWeight(available factors)
 *   overall      = round( Σ(appliedWeight × factorScore) / Σ appliedWeight )
 *   coverage     = Σ baseWeight(available) / Σ baseWeight(all)
 */
export function computeReadiness(input: ReadinessInput): TransformationReadiness {
  const factors = readinessFactorSchema.options.map((f) => scoreFactor(f, input.maturity));

  const available = factors.filter((f) => f.available).map((f) => f.factor);
  const applied = redistributeWeights(READINESS_FACTOR_WEIGHTS, available);
  const coverage = weightCoverage(READINESS_FACTOR_WEIGHTS, available);

  const withWeights = factors.map((f) => readinessFactorScoreSchema.parse({ ...f, weight: Number(applied[f.factor].toFixed(4)) }));
  const excluded = withWeights.filter((f) => !f.available).map((f) => f.factor);

  const { score: overall, calculation } = weightedComposite(
    withWeights.map((f) => ({ key: f.factor, score: f.score, weight: f.weight })),
    "round(Σ(appliedWeightᶠ × factorScoreᶠ) / Σ appliedWeightᶠ), appliedWeightᶠ = baseWeightᶠ × 100 / Σ baseWeight(available)",
    excluded,
  );

  const limitations: string[] = [];
  if (excluded.length > 0) {
    limitations.push(`${excluded.length} of ${factors.length} readiness factors were excluded for lack of evidence: ${excluded.map((f) => FACTOR_LABEL[f]).join(", ")}.`);
  }
  if (coverage < 0.6) {
    limitations.push(`Only ${Math.round(coverage * 100)}% of the readiness weight was assessable; the overall figure is indicative and needs a discovery conversation to confirm.`);
  }
  if (overall === null) {
    limitations.push("No readiness factor could be assessed, so no overall readiness is reported.");
  }

  return transformationReadinessSchema.parse({
    scanId: input.scanId,
    overall,
    factors: withWeights,
    coverage,
    confidence: aggregateProspectConfidence({
      items: input.items,
      coverage,
      expected: readinessFactorSchema.options.length,
      resolved: available.length,
      conflicts: input.conflicts ?? 0,
    }),
    calculation,
    excludedFactors: excluded,
    limitations,
    computedAt: input.now,
  });
}

/** Readiness band for reporting. Null stays null — no band is invented. */
export function readinessBand(overall: number | null): string | null {
  if (overall === null) return null;
  if (overall < 25) return "not_ready";
  if (overall < 50) return "early";
  if (overall < 75) return "developing";
  return "ready";
}
