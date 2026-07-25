/* =============================================================================
 * Prospect confidence (Phase C · Sprint C5) — PURE, monotonically non-inflating.
 *
 * C5 does NOT define a second confidence model. It composes the Sprint-3
 * evidence model (`computeEvidenceConfidence`, geometric mean of six factors)
 * and adds only the assessment-level context that model cannot see: how much of
 * the assessment was scoreable, how many factors were missing, how diverse the
 * sources were, and how many conflicts were detected.
 *
 * ██ THE NON-INFLATION RULE ██
 *   The final composite is `min(assessmentConfidence, evidenceConfidence)`. C5
 *   can only ever LOWER confidence relative to the evidence that backs it. There
 *   is no code path that raises a figure to fill a gap, and a test asserts it
 *   across randomized inputs.
 * ========================================================================== */

import {
  type EngineEvidenceItem,
  type EvidenceConfidence,
  type EvidenceConfidenceInputs,
} from "@brightloop/schema";
import { computeEvidenceConfidence, aggregateConfidence } from "../evidence/confidence.js";
import { provenanceQuality } from "../evidence/provenance.js";

const clamp01 = (n: number) => (Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0);
const mean = (ns: number[]) => (ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length);

export interface ProspectConfidenceInput {
  /** The evidence backing the assessment. `unavailable` items are excluded. */
  items: readonly EngineEvidenceItem[];
  /** Share of the assessment's weight that was scoreable (0–1). */
  coverage: number;
  /** Distinct factors/signals expected. */
  expected: number;
  /** Factors/signals that resolved. */
  resolved: number;
  /** Conflicts detected across the evidence set. */
  conflicts: number;
}

/** The six factors C5 derives, before the non-inflation cap is applied. */
export function prospectConfidenceInputs(input: ProspectConfidenceInput): EvidenceConfidenceInputs {
  const usable = input.items.filter((i) => i.state !== "unavailable");

  // Source diversity: distinct sources over a target of four independent
  // sources. One source can never look as strong as several agreeing ones.
  const distinctSources = new Set(usable.map((i) => i.source)).size;
  const diversity = clamp01(distinctSources / 4);

  // Agreement degrades with the conflict rate across the usable set.
  const agreement = usable.length === 0 ? 0 : clamp01(1 - input.conflicts / usable.length);

  // Completeness is the share of expected factors that actually resolved.
  const completeness = input.expected <= 0 ? 0 : clamp01(input.resolved / input.expected);

  return {
    coverage: clamp01(input.coverage),
    reliability: clamp01(mean(usable.map((i) => i.reliability))),
    freshness: clamp01(mean(usable.map((i) => i.freshness.score))),
    agreement,
    completeness,
    // Provenance quality is blended with source diversity: a perfectly
    // provenanced single source is still a single source.
    provenanceQuality: clamp01(mean(usable.map((i) => provenanceQuality(i.provenance))) * (0.5 + 0.5 * diversity)),
  };
}

/**
 * The assessment-level confidence, capped at the confidence of the evidence
 * behind it. Returns the LOWER of the two composites — never the higher.
 */
export function aggregateProspectConfidence(input: ProspectConfidenceInput): EvidenceConfidence {
  const usable = input.items.filter((i) => i.state !== "unavailable");
  if (usable.length === 0) {
    // No usable evidence ⇒ no confidence. Not a low score — a zero one.
    return computeEvidenceConfidence({ coverage: 0, reliability: 0, freshness: 0, agreement: 0, completeness: 0, provenanceQuality: 0 });
  }

  const assessment = computeEvidenceConfidence(prospectConfidenceInputs(input));
  const evidence = aggregateConfidence([...usable]);

  // The non-inflation cap: whichever composite is lower wins, and the inputs
  // reported are the ones that produced it.
  return assessment.value <= evidence.value ? assessment : evidence;
}

/**
 * Confidence for a single derived item (a finding, opportunity or risk) from the
 * specific evidence that supports it. Same model, narrower input set.
 */
export function itemConfidence(items: readonly EngineEvidenceItem[], supportingIds: readonly string[], coverage = 1): EvidenceConfidence {
  const supporting = items.filter((i) => supportingIds.includes(i.id) && i.state !== "unavailable");
  return aggregateProspectConfidence({
    items: supporting,
    coverage,
    expected: Math.max(1, supportingIds.length),
    resolved: supporting.length,
    conflicts: 0,
  });
}

/** Zero confidence — used wherever nothing is evidenced. */
export function zeroConfidence(): EvidenceConfidence {
  return computeEvidenceConfidence({ coverage: 0, reliability: 0, freshness: 0, agreement: 0, completeness: 0, provenanceQuality: 0 });
}
