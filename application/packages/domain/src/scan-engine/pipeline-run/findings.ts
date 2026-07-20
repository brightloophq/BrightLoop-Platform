/* =============================================================================
 * Finding synthesis (Sprint 8 §7 · AIS-001 §02 Evidence First) — PURE.
 *
 * Derives deterministic findings from VALIDATED claims only. A claim that failed
 * validation never becomes a finding, and no finding carries a statement without
 * its evidence ids, state, confidence, limitations, and provenance. Severity and
 * priority are COMPUTED (never asserted): weak evidence, inference, and unresolved
 * contradictions all pull priority down — weakness never launders into certainty.
 * ========================================================================== */

import {
  pipelineFindingSchema,
  type EvidenceState,
  type ContradictionStatus,
  type IndexDimension,
  type PipelineFinding,
  type FindingSeverity,
  type ValidatedClaim,
} from "@brightloop/schema";

/** How much each evidence state may contribute to priority (AIS-001 §06). */
const STATE_WEIGHT: Record<EvidenceState, number> = { observed: 1.0, estimated: 0.8, inferred: 0.6, unavailable: 0 };
/** An unresolved contradiction discounts priority; a reconciled one discounts less. */
const CONTRADICTION_FACTOR: Record<ContradictionStatus, number> = { none: 1.0, reconciled: 0.9, contradicted: 0.6 };

/** Deterministic severity from confidence + evidence state. Pure. */
export function deriveSeverity(confidenceValue: number, state: EvidenceState): FindingSeverity {
  if (state === "unavailable") return "low";
  if (confidenceValue >= 85 && state === "observed") return "critical";
  if (confidenceValue >= 70) return "high";
  if (confidenceValue >= 45) return "moderate";
  return "low";
}

/** Deterministic priority 0–100. Pure. */
export function derivePriority(confidenceValue: number, state: EvidenceState, contradiction: ContradictionStatus): number {
  const raw = confidenceValue * STATE_WEIGHT[state] * CONTRADICTION_FACTOR[contradiction];
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export interface SynthesizeFindingsOptions {
  pipelineRunId: string;
  /** Deterministic id for the finding derived from a claim at `index`. */
  idFor: (claim: ValidatedClaim, index: number) => string;
  /** Which Index dimension the claim speaks to. */
  domainFor: (claim: ValidatedClaim, index: number) => IndexDimension;
  graphNodeIdsFor?: (claim: ValidatedClaim, index: number) => string[];
  /** Business consequence statement (AIS-001 §15 Business-First). */
  businessImpactFor?: (claim: ValidatedClaim, index: number) => string;
  titleFor?: (claim: ValidatedClaim, index: number) => string;
}

/**
 * Synthesize findings from validated claims. Claims whose validation did not pass
 * are DROPPED (never promoted). Output order follows input order — deterministic.
 */
export function synthesizeFindings(claims: readonly ValidatedClaim[], opts: SynthesizeFindingsOptions): PipelineFinding[] {
  const out: PipelineFinding[] = [];
  claims.forEach((claim, index) => {
    if (!claim.validation.passed) return; // unvalidated output never enters the ledger
    const severity = deriveSeverity(claim.confidence.value, claim.evidenceState);
    const priority = derivePriority(claim.confidence.value, claim.evidenceState, claim.contradictionStatus);
    out.push(
      pipelineFindingSchema.parse({
        id: opts.idFor(claim, index),
        pipelineRunId: opts.pipelineRunId,
        title: (opts.titleFor?.(claim, index) ?? claim.claim).slice(0, 200),
        domain: opts.domainFor(claim, index),
        evidenceIds: claim.evidenceIds,
        graphNodeIds: opts.graphNodeIdsFor?.(claim, index) ?? [],
        evidenceState: claim.evidenceState,
        confidence: claim.confidence,
        severity,
        priority,
        businessImpact: opts.businessImpactFor?.(claim, index) ?? `Affects ${opts.domainFor(claim, index)} performance.`,
        limitations: claim.limitations,
        contradictionStatus: claim.contradictionStatus,
        provenance: claim.provenance,
      }),
    );
  });
  return out;
}

/** Findings ordered by severity then priority then id — a total, stable order. Pure. */
const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
export function orderFindings(findings: readonly PipelineFinding[]): PipelineFinding[] {
  return [...findings].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
