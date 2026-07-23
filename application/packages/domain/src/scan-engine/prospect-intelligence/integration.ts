/* =============================================================================
 * Prospect Intelligence integration (Phase C · Sprint C5) — PURE composition.
 *
 * The one entry point that runs the engine end to end:
 *
 *   evidence → maturity → profile/industry → findings → risks/opportunities
 *            → readiness → executive summary → recommendation inputs → artifacts
 *
 * It CONSUMES existing engine outputs (evidence bundle, competitor snapshot,
 * decision brief, recommendations) and produces new records. It never mutates an
 * upstream artifact, never calls a provider, never touches the runtime, the
 * queue, persistence or a repository, and never generates a proposal or a price.
 *
 * Deterministic: given the same evidence, the same `idFor` and the same `now`,
 * it returns a byte-identical result (including artifact checksums).
 * ========================================================================== */

import {
  prospectIntelligenceResultSchema,
  type CompetitorSnapshot,
  type DecisionBrief,
  type EngineEvidenceItem,
  type EngineRecommendation,
  type EvidenceBundle,
  type ProspectArtifactKind,
  type ProspectEvent,
  type ProspectIntelligenceResult,
} from "@brightloop/schema";
import { detectConflicts } from "../evidence/conflict.js";
import { deriveProfile } from "./business-profile.js";
import { aggregateProspectConfidence } from "./confidence.js";
import { assembleExecutiveSummary } from "./executive-summary.js";
import { classifyIndustry } from "./industry.js";
import { assessMaturity } from "./maturity.js";
import { deriveOpportunities } from "./opportunities.js";
import { buildProspectArtifacts } from "./outputs.js";
import { buildRecommendationInputs } from "./recommendations.js";
import { deriveRisks } from "./risks.js";
import { signalsFor } from "./scoring.js";
import { deriveStrengths } from "./strengths.js";
import { computeReadiness } from "./transformation-readiness.js";
import { deriveWeaknesses } from "./weaknesses.js";
import * as evt from "./events.js";
import { maturityCategorySchema } from "@brightloop/schema";

export interface ProspectIntelligenceInput {
  scanId: string;
  /** The evidence to assess — a bundle or a bare item list. */
  evidence: EvidenceBundle | readonly EngineEvidenceItem[];
  /** Optional upstream context. Consumed read-only; never mutated. */
  competitorSnapshot?: CompetitorSnapshot | null;
  decisionBrief?: DecisionBrief | null;
  recommendations?: readonly EngineRecommendation[];
  /** Ids of the artifacts this assessment derives from, for lineage. */
  sourceArtifactIds?: readonly string[];
  /** Deterministic id generator: `idFor("opportunity", 0)`. */
  idFor: (prefix: string, index: number) => string;
  now: string;
}

const itemsOf = (evidence: ProspectIntelligenceInput["evidence"]): EngineEvidenceItem[] =>
  Array.isArray(evidence) ? [...evidence] : [...(evidence as EvidenceBundle).items];

/**
 * Run the Prospect Intelligence Engine.
 *
 * With no usable evidence the result is a fully-formed, honest EMPTY assessment:
 * null scores, unknown fields, zero confidence and an `evidence_insufficient`
 * event — never a zeroed or invented one.
 */
export function runProspectIntelligence(input: ProspectIntelligenceInput): ProspectIntelligenceResult {
  const items = itemsOf(input.evidence);
  const usable = items.filter((i) => i.state !== "unavailable");
  const events: ProspectEvent[] = [];

  // Conflicts come from the existing Sprint-3 detector — not re-implemented.
  const conflicts = detectConflicts({ scanId: input.scanId, items }).length;

  /* ---- 1 · maturity ---------------------------------------------------------- */
  const maturity = assessMaturity({ scanId: input.scanId, items, conflicts, now: input.now });
  events.push(evt.maturityScored(input.scanId, input.now, `${maturity.categories.filter((c) => c.available).length} of ${maturity.categories.length} categories assessed`));

  /* ---- 2 · identity ---------------------------------------------------------- */
  const industry = classifyIndustry({ scanId: input.scanId, items });
  const profile = deriveProfile({
    scanId: input.scanId,
    items,
    maturity,
    industryCategory: industry.category,
    industryEvidenceIds: industry.evidenceIds,
    now: input.now,
  });
  events.push(evt.profileDerived(input.scanId, input.now, `${profile.unknownFields.length} field(s) remain unknown`));

  /* ---- 3 · findings ---------------------------------------------------------- */
  const strengths = deriveStrengths({ items, maturity, idFor: (i) => input.idFor("strength", i) });
  const weaknesses = deriveWeaknesses({ items, maturity, idFor: (i) => input.idFor("weakness", i) });
  events.push(evt.findingsDerived(input.scanId, input.now, `${strengths.length} strength(s), ${weaknesses.length} weakness(es)`));

  /* ---- 4 · risks + opportunities --------------------------------------------- */
  const risks = deriveRisks({ items, maturity, idFor: (i) => input.idFor("risk", i) });
  const opportunities = deriveOpportunities({ items, maturity, idFor: (i) => input.idFor("opportunity", i) });
  events.push(evt.risksDerived(input.scanId, input.now, `${risks.length} risk(s)`));
  events.push(evt.opportunitiesDerived(input.scanId, input.now, `${opportunities.length} opportunit(ies)`));

  /* ---- 5 · readiness ---------------------------------------------------------- */
  const readiness = computeReadiness({ scanId: input.scanId, items, maturity, conflicts, now: input.now });
  events.push(evt.readinessComputed(input.scanId, input.now, readiness.overall === null ? "unassessable" : `${readiness.overall}/100`));

  /* ---- 6 · aggregate confidence ----------------------------------------------- */
  const expectedSignals = maturityCategorySchema.options.reduce((a, c) => a + signalsFor(c).length, 0);
  const resolvedSignals = maturity.categories.reduce((a, c) => a + c.calculation.signalCount, 0);
  const confidence = aggregateProspectConfidence({
    items,
    coverage: maturity.coverage,
    expected: expectedSignals,
    resolved: resolvedSignals,
    conflicts,
  });

  /* ---- 7 · executive summary --------------------------------------------------- */
  const executiveSummary = assembleExecutiveSummary({
    scanId: input.scanId,
    profile,
    industry,
    maturity,
    strengths,
    weaknesses,
    risks,
    opportunities,
    readiness,
    confidence,
    now: input.now,
  });
  events.push(evt.summaryAssembled(input.scanId, input.now, `${executiveSummary.sections.length} sections`));

  /* ---- 8 · recommendation inputs (handoff, not recommendations) ----------------- */
  const recommendationInputs = buildRecommendationInputs({ opportunities, risks, idFor: (i) => input.idFor("recinput", i) });

  /* ---- 9 · limitations ---------------------------------------------------------- */
  const limitations = [
    ...profile.limitations,
    ...maturity.limitations,
    ...readiness.limitations,
    ...industry.limitations,
  ].filter((v, i, a) => a.indexOf(v) === i);

  if (usable.length === 0) {
    limitations.unshift("No usable evidence was available; every figure is reported as unassessed rather than zero.");
    events.push(evt.evidenceInsufficient(input.scanId, input.now, "no usable evidence"));
  }
  if (conflicts > 0) {
    limitations.push(`${conflicts} evidence conflict(s) were detected and reduced the reported confidence.`);
  }

  /* ---- 10 · artifacts ------------------------------------------------------------ */
  const intelligencePayload = { profile, industry, maturity, strengths, weaknesses, opportunities, risks, readiness, recommendationInputs };
  const artifacts = buildProspectArtifacts({
    scanId: input.scanId,
    intelligencePayload,
    executiveSummary,
    readiness,
    sourceArtifactIds: input.sourceArtifactIds,
    idFor: (kind: ProspectArtifactKind) => input.idFor(kind, 0),
    now: input.now,
  });
  for (const artifact of artifacts) events.push(evt.artifactCreated(input.scanId, artifact.id, input.now, artifact.kind));

  // The engine never signs off on its own output.
  events.push(evt.reviewRequired(input.scanId, input.now, "machine-derived assessment requires strategist review"));

  return prospectIntelligenceResultSchema.parse({
    scanId: input.scanId,
    profile,
    industry,
    maturity,
    strengths,
    weaknesses,
    opportunities,
    risks,
    readiness,
    executiveSummary,
    recommendationInputs,
    artifacts,
    events,
    confidence,
    limitations,
    generatedAt: input.now,
  });
}
