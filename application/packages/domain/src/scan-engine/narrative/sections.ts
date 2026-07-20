/* =============================================================================
 * Section primitives + domain narratives (Sprint 12 §2/§11/§12/§13) — PURE.
 *
 * Sections are assembled from STRUCTURED data through deterministic templates.
 * No section may exist without traceable source artifacts, and each carries a
 * content checksum so identical inputs always produce an identical section.
 *
 * §11 competitor · §12 recommendation · §13 proposal narratives live here because
 * each is simply a typed section builder over an upstream artifact.
 * ========================================================================== */

import {
  narrativeSectionSchema,
  type CompetitorSnapshot,
  type EngineRecommendation,
  type MarketPosition,
  type NarrativeAudience,
  type NarrativeClaim,
  type NarrativeSection,
  type NarrativeSectionType,
  type ProposalArtifact,
  type StatementData,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { statement } from "./claims.js";
import { certaintyPhrase, tonePolicy } from "./policy.js";
import type { NarrativeToneProfile } from "@brightloop/schema";

/* ---- section primitive ------------------------------------------------------ */
export interface BuildSectionInput {
  id: string;
  type: NarrativeSectionType;
  title: string;
  sourceData: Record<string, unknown>;
  body: StatementData[];
  claimIds?: string[];
  evidenceIds?: string[];
  graphNodeIds?: string[];
  recommendationIds?: string[];
  competitorIds?: string[];
  affectedDomains?: NarrativeSection["affectedDomains"];
  confidence: number;
  limitations?: string[];
  citationIds?: string[];
  visibility?: NarrativeAudience[];
  reviewRequired?: boolean;
  provenance?: Record<string, unknown>;
}

/**
 * Build a section. Returns null when the section has NO traceable source —
 * a section without evidence, claims, recommendations, or competitors is refused.
 */
export function buildSection(input: BuildSectionInput): NarrativeSection | null {
  const traceable =
    (input.evidenceIds ?? []).length > 0 ||
    (input.claimIds ?? []).length > 0 ||
    (input.recommendationIds ?? []).length > 0 ||
    (input.competitorIds ?? []).length > 0 ||
    (input.graphNodeIds ?? []).length > 0;
  // `limitations` and `next_steps` are meta-sections; they may exist without a source.
  const metaSection = input.type === "limitations" || input.type === "next_steps" || input.type === "confidence_summary";
  if (!traceable && !metaSection) return null;

  const content = {
    type: input.type,
    title: input.title,
    sourceData: input.sourceData,
    body: input.body,
    claimIds: input.claimIds ?? [],
    evidenceIds: input.evidenceIds ?? [],
    limitations: input.limitations ?? [],
  };

  return narrativeSectionSchema.parse({
    id: input.id,
    type: input.type,
    title: input.title,
    sourceData: input.sourceData,
    body: input.body,
    claimIds: input.claimIds ?? [],
    evidenceIds: input.evidenceIds ?? [],
    graphNodeIds: input.graphNodeIds ?? [],
    recommendationIds: input.recommendationIds ?? [],
    competitorIds: input.competitorIds ?? [],
    affectedDomains: input.affectedDomains ?? [],
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    limitations: input.limitations ?? [],
    citationIds: input.citationIds ?? [],
    visibility: input.visibility ?? [],
    reviewRequired: input.reviewRequired ?? false,
    provenance: input.provenance ?? {},
    checksum: hashContent(content),
  });
}

/** Truncate a section's body to the budget, recording the omission. Pure. */
export function truncateSection(section: NarrativeSection, maxSentences: number): { section: NarrativeSection; truncated: boolean } {
  if (section.body.length <= maxSentences) return { section, truncated: false };
  const kept = section.body.slice(0, maxSentences);
  const dropped = section.body.length - kept.length;
  return {
    section: {
      ...section,
      body: kept,
      // limitations are NEVER dropped silently — the omission is stated
      limitations: [...section.limitations, `${dropped} further statement(s) omitted by the length budget.`],
    },
    truncated: true,
  };
}

/* ---- 11 · competitor narrative ---------------------------------------------- */
export interface CompetitorNarrativeInput {
  id: string;
  snapshot: CompetitorSnapshot;
  marketPosition?: MarketPosition | null;
  toneProfile: NarrativeToneProfile;
  claims?: readonly NarrativeClaim[];
  citationIds?: string[];
  visibility?: NarrativeAudience[];
}

/**
 * Evidence-safe competitor summary. A market-standing statement is emitted ONLY
 * when the Sprint-10 competitor-set gate permits it. Pure.
 */
export function buildCompetitorSection(input: CompetitorNarrativeInput): NarrativeSection | null {
  const snap = input.snapshot;
  const mp = input.marketPosition ?? null;
  const cap = tonePolicy(input.toneProfile).maxCertaintyBand;
  const setConfidence = snap.setConfidence?.score ?? 0;
  const supportsClaims = (snap.setConfidence?.supportsMarketClaims ?? false) && (mp?.supportsMarketClaims ?? false);

  const body: StatementData[] = [
    statement("The comparison uses {n} validated competitor(s).", { n: snap.selectedCompetitorIds.length }),
  ];
  const limitations: string[] = [];

  if (mp !== null) {
    body.push(statement("Across {covered} evidenced dimension(s), the position is {phrase}.", {
      covered: Object.keys(mp.dimensionPercentiles).length,
      phrase: certaintyPhrase(mp.confidence, cap),
    }));
    if (mp.defensibleAdvantages.length > 0) body.push(statement("Defensible advantage(s): {dims}.", { dims: mp.defensibleAdvantages.join(", ") }));
    if (mp.materialDeficits.length > 0) body.push(statement("Material deficit(s): {dims}.", { dims: mp.materialDeficits.join(", ") }));
    if (mp.parityDimensions.length > 0) body.push(statement("At parity on: {dims}.", { dims: mp.parityDimensions.join(", ") }));
    if (mp.unavailableDimensions.length > 0) {
      limitations.push(`${mp.unavailableDimensions.length} dimension(s) lacked comparable evidence and were excluded — not scored as zero.`);
    }
    limitations.push(...mp.limitations);

    // market-standing statement ONLY behind the gate
    if (supportsClaims && mp.overallPercentile !== null) {
      body.push(statement("Overall standing sits at the {pct}th percentile of the evidenced set.", { pct: mp.overallPercentile }));
    } else {
      limitations.push("Competitor-set quality is insufficient to support market-standing claims; no ranking statement is made.");
    }
  } else {
    limitations.push("No market position was computed; only the competitor set is described.");
  }

  limitations.push(...(snap.setConfidence?.limitations ?? []));

  return buildSection({
    id: input.id,
    type: "competitor_summary",
    title: "Competitive position",
    sourceData: { snapshotId: snap.id, setConfidence, supportsMarketClaims: supportsClaims },
    body,
    competitorIds: snap.selectedCompetitorIds,
    claimIds: (input.claims ?? []).map((c) => c.id),
    confidence: setConfidence,
    limitations,
    citationIds: input.citationIds ?? [],
    visibility: input.visibility ?? [],
    reviewRequired: !supportsClaims,
    provenance: { snapshotId: snap.id },
  });
}

/* ---- 12 · recommendation narrative ------------------------------------------ */
export interface RecommendationNarrativeInput {
  id: string;
  recommendations: readonly EngineRecommendation[];
  toneProfile: NarrativeToneProfile;
  citationIds?: string[];
  visibility?: NarrativeAudience[];
  maxItems?: number;
}

/**
 * Recommendation summary. Uses ONLY fields present on the recommendation — no
 * invented ROI and no invented implementation detail. Pure.
 */
export function buildRecommendationSection(input: RecommendationNarrativeInput): NarrativeSection | null {
  const cap = tonePolicy(input.toneProfile).maxCertaintyBand;
  const recs = [...input.recommendations].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, input.maxItems ?? 5);
  if (recs.length === 0) return null;

  const body: StatementData[] = [];
  const limitations: string[] = [];

  for (const r of recs) {
    body.push(statement("{title}: {action} — {phrase} (priority {impact}, effort {effort}, horizon {horizon}).", {
      title: r.title,
      action: r.proposedAction,
      phrase: certaintyPhrase(r.confidence.value, cap),
      impact: r.impact,
      effort: r.effort,
      horizon: r.timeHorizon,
    }));
    if (r.dependencies.length > 0) body.push(statement("{title} depends on {n} prerequisite(s).", { title: r.title, n: r.dependencies.length }));
    limitations.push(...r.limitations);
    if (r.reviewRequired) limitations.push(`${r.id} requires human review before action.`);
  }

  return buildSection({
    id: input.id,
    type: "recommendation_summary",
    title: "Recommended actions",
    sourceData: { count: recs.length },
    body,
    recommendationIds: recs.map((r) => r.id),
    evidenceIds: [...new Set(recs.flatMap((r) => r.evidenceIds))].sort(),
    affectedDomains: [...new Set(recs.flatMap((r) => r.affectedDomains))].sort(),
    confidence: Math.round(recs.reduce((a, r) => a + r.confidence.value, 0) / recs.length),
    limitations: [...new Set(limitations)].sort(),
    citationIds: input.citationIds ?? [],
    visibility: input.visibility ?? [],
    reviewRequired: recs.some((r) => r.reviewRequired),
  });
}

/* ---- 13 · proposal narrative ------------------------------------------------ */
export interface ProposalNarrativeInput {
  id: string;
  proposal: ProposalArtifact;
  toneProfile: NarrativeToneProfile;
  citationIds?: string[];
  visibility?: NarrativeAudience[];
}

/**
 * Proposal summary from the Sprint-11 artifact. Emits NO price figures and no
 * contractual or legal promises — investment is described as inputs only. Pure.
 */
export function buildProposalSection(input: ProposalNarrativeInput): NarrativeSection | null {
  const p = input.proposal;
  const cap = tonePolicy(input.toneProfile).maxCertaintyBand;

  const body: StatementData[] = [
    statement("{headline}", { headline: p.executiveSummary.headline }),
    statement("Scope covers {scope} item(s) across {phases} phase(s) with {milestones} milestone(s).", {
      scope: p.scope.length, phases: p.phases.length, milestones: p.milestones.length,
    }),
    statement("{n} option package(s) are available; selection is {phrase}.", {
      n: p.optionPackages.length,
      phrase: certaintyPhrase(p.strategy.confidence, cap),
    }),
  ];
  if (p.successMetrics.length > 0) body.push(statement("{n} success metric(s) are defined.", { n: p.successMetrics.length }));
  if (p.validityPeriodDays !== null) body.push(statement("The proposal is valid for {days} day(s).", { days: p.validityPeriodDays }));

  const limitations = [...p.strategy.limitations, ...p.investmentInputs.limitations];
  // investment is INPUTS only — say so explicitly rather than implying a price
  limitations.push("Investment is described as structural inputs only; no price is stated.");
  if (p.investmentInputs.budgetUnavailable) limitations.push("No client budget was supplied; none has been inferred.");

  return buildSection({
    id: input.id,
    type: "proposal_summary",
    title: "Proposal summary",
    sourceData: {
      proposalId: p.id, version: p.version, packages: p.optionPackages.map((x) => x.kind),
      approvalsMet: p.approvalRequirementsMet,
    },
    body,
    recommendationIds: [...new Set(p.scope.flatMap((s) => s.sourceRecommendationIds))].sort(),
    evidenceIds: p.evidenceSummary.evidenceIds,
    confidence: p.strategy.confidence,
    limitations: [...new Set(limitations)].sort(),
    citationIds: input.citationIds ?? [],
    visibility: input.visibility ?? [],
    reviewRequired: !p.approvalRequirementsMet,
    provenance: { proposalId: p.id, version: p.version },
  });
}
