/* =============================================================================
 * Business maturity assessment (Phase C · Sprint C5) — PURE.
 *
 * Scores the thirteen capability categories from evidence-derived signals. Each
 * category returns its score, the weight actually applied, the evidence behind
 * it, the full calculation, and its limitations.
 *
 * A category with no resolved signal is `available: false` with a null score —
 * NOT a zero. Its weight is redistributed across the categories that could be
 * assessed, so an unobservable capability never drags the composite down. No
 * benchmark is fabricated: the score is a function of observed signals only.
 * ========================================================================== */

import {
  maturityAssessmentSchema,
  maturityCategorySchema,
  maturityScoreSchema,
  type EngineEvidenceItem,
  type MaturityAssessment,
  type MaturityCategory,
  type MaturityScore,
} from "@brightloop/schema";
import { aggregateProspectConfidence, itemConfidence, zeroConfidence } from "./confidence.js";
import {
  CATEGORY_WEIGHTS,
  extractSignals,
  redistributeWeights,
  signalsFor,
  weightCoverage,
  weightedComposite,
  weightedSignalScore,
  UNCOVERED_CATEGORIES,
} from "./scoring.js";

/** Why a category could not be assessed, in operator language. */
const UNCOVERED_LIMITATION: Record<string, string> = {
  analytics: "No analytics property is connected, so analytics maturity cannot be observed from a public crawl.",
  automation: "Automation tooling is not observable from a public website; this requires a connected system or an interview.",
  operations: "Internal operations are not observable from a public website; this requires a discovery conversation.",
};

export interface MaturityInput {
  scanId: string;
  items: readonly EngineEvidenceItem[];
  conflicts?: number;
  now: string;
}

/** Score one category from the evidence. Never returns a fabricated figure. */
export function scoreCategory(category: MaturityCategory, items: readonly EngineEvidenceItem[]): MaturityScore {
  const specs = signalsFor(category);
  const limitations: string[] = [];

  if (specs.length === 0) {
    const reason = UNCOVERED_LIMITATION[category] ?? `No signal in the registry can observe ${category} from the available sources.`;
    return maturityScoreSchema.parse({
      category,
      score: null,
      weight: 0,
      confidence: zeroConfidence(),
      evidenceIds: [],
      calculation: { formula: "unassessable — no signal defined for this category", inputs: {}, signalCount: 0, missingSignals: [] },
      limitations: [reason],
      available: false,
    });
  }

  const { resolved, missing } = extractSignals(items, specs);
  const { score, calculation } = weightedSignalScore(resolved, missing);
  const evidenceIds = [...new Set(resolved.flatMap((s) => s.evidenceIds))].sort();

  if (missing.length > 0) {
    limitations.push(`${missing.length} of ${specs.length} ${category} signals had no supporting evidence and were excluded: ${missing.join(", ")}.`);
  }
  if (score === null) {
    limitations.push(`No ${category} signal resolved, so the category is reported unassessed rather than scored zero.`);
  }

  return maturityScoreSchema.parse({
    category,
    score,
    // The applied weight is assigned by the assessment after redistribution.
    weight: 0,
    confidence: score === null ? zeroConfidence() : itemConfidence(items, evidenceIds, resolved.length / specs.length),
    evidenceIds,
    calculation,
    limitations,
    available: score !== null,
  });
}

/**
 * The full maturity assessment.
 *
 *   appliedWeightₖ = baseWeightₖ × 100 / Σ baseWeight(available)
 *   overall        = round( Σ(appliedWeightₖ × scoreₖ) / Σ appliedWeightₖ )
 *   coverage       = Σ baseWeight(available) / Σ baseWeight(all)
 */
export function assessMaturity(input: MaturityInput): MaturityAssessment {
  const categories = maturityCategorySchema.options;
  const scored = categories.map((c) => scoreCategory(c, input.items));

  const available = scored.filter((s) => s.available).map((s) => s.category);
  const applied = redistributeWeights(CATEGORY_WEIGHTS, available);
  const coverage = weightCoverage(CATEGORY_WEIGHTS, available);

  // Re-stamp each category with the weight actually applied to it.
  const withWeights = scored.map((s) => maturityScoreSchema.parse({ ...s, weight: Number(applied[s.category].toFixed(4)) }));

  const unavailable = withWeights.filter((s) => !s.available).map((s) => s.category);
  const { score: overall, calculation } = weightedComposite(
    withWeights.map((s) => ({ key: s.category, score: s.score, weight: s.weight })),
    "round(Σ(appliedWeightₖ × scoreₖ) / Σ appliedWeightₖ), appliedWeightₖ = baseWeightₖ × 100 / Σ baseWeight(available)",
    unavailable,
  );

  const limitations: string[] = [];
  if (unavailable.length > 0) {
    limitations.push(`${unavailable.length} of ${categories.length} categories could not be assessed and were excluded from the composite: ${unavailable.join(", ")}.`);
  }
  if (UNCOVERED_CATEGORIES.length > 0) {
    limitations.push(`Not observable from a public crawl: ${[...UNCOVERED_CATEGORIES].join(", ")}.`);
  }
  if (coverage < 0.5) {
    limitations.push(`Only ${Math.round(coverage * 100)}% of the maturity weight was assessable; treat the composite as indicative only.`);
  }
  if (overall === null) {
    limitations.push("No category could be scored, so no composite maturity is reported.");
  }

  const expectedSignals = categories.reduce((a, c) => a + signalsFor(c).length, 0);
  const resolvedSignals = withWeights.reduce((a, s) => a + s.calculation.signalCount, 0);

  return maturityAssessmentSchema.parse({
    scanId: input.scanId,
    overall,
    categories: withWeights,
    coverage,
    confidence: aggregateProspectConfidence({
      items: input.items,
      coverage,
      expected: expectedSignals,
      resolved: resolvedSignals,
      conflicts: input.conflicts ?? 0,
    }),
    calculation,
    limitations,
    computedAt: input.now,
  });
}

/** Categories that were assessed, weakest first (stable by category on ties). */
export function weakestCategories(assessment: MaturityAssessment): MaturityScore[] {
  return assessment.categories
    .filter((c): c is MaturityScore & { score: number } => c.score !== null)
    .sort((a, b) => a.score - b.score || (a.category < b.category ? -1 : 1));
}

/** Categories that were assessed, strongest first (stable by category on ties). */
export function strongestCategories(assessment: MaturityAssessment): MaturityScore[] {
  return assessment.categories
    .filter((c): c is MaturityScore & { score: number } => c.score !== null)
    .sort((a, b) => b.score - a.score || (a.category < b.category ? -1 : 1));
}
