/* =============================================================================
 * Pipeline integration (Sprint 9 §12) — PURE extension point.
 *
 * A deterministic decision-science stage that runs AFTER the Sprint-8 pipeline's
 * `recommendation_candidates` stage. It reads validated artifacts and produces NEW
 * ones — it never mutates an existing artifact in place, and it records the source
 * artifact ids so lineage and checksums stay intact.
 * ========================================================================== */

import {
  decisionScienceResultSchema,
  type ArtifactKind,
  type DecisionScienceResult,
  type DecisionWeights,
  type DependencyEdge,
  type ExpectedValue,
  type FactorSet,
  type PipelineFinding,
  type PipelineRecommendationCandidate,
  type PortfolioConstraints,
  type PriorityScore,
  type EngineRecommendation,
  type RecommendationEvent,
  type UncertaintyAssessment,
} from "@brightloop/schema";
import { recordArtifact, type ArtifactRegistry } from "../pipeline-run/artifacts.js";
import { buildRecommendations, type BuildRecommendationsOptions } from "./model.js";
import { computeFactors, type FactorInputs } from "./factors.js";
import { assessUncertainty, type UncertaintyInputs } from "./uncertainty.js";
import { computeExpectedValue, type ExpectedValueInputs } from "./expected-value.js";
import { computePriority, DEFAULT_WEIGHTS } from "./priority.js";
import { analyzeDependencies } from "./dependencies.js";
import { rankRecommendations } from "./ranking.js";
import { selectPortfolio } from "./portfolio.js";
import { buildAllScenarios } from "./scenarios.js";
import { analyzeSensitivity } from "./sensitivity.js";
import { buildDecisionBrief } from "./brief.js";
import * as evt from "./events.js";

export interface DecisionScienceInput {
  scanId: string;
  clientId: string | null;
  pipelineRunId?: string | null;
  candidates: readonly PipelineRecommendationCandidate[];
  findings: readonly PipelineFinding[];
  /** Explicit dependency edges beyond each recommendation's own `dependencies`. */
  dependencyEdges?: readonly DependencyEdge[];
  weights?: DecisionWeights;
  constraints?: PortfolioConstraints;
  model: BuildRecommendationsOptions;
  factorInputsFor?: (rec: EngineRecommendation) => FactorInputs;
  uncertaintyInputsFor?: (rec: EngineRecommendation) => UncertaintyInputs;
  expectedValueInputsFor?: (rec: EngineRecommendation) => ExpectedValueInputs;
  idFor: (prefix: string) => string;
  now: string;
  includeSensitivity?: boolean;
}

/**
 * Run the full decision-science stage. Deterministic given deterministic id/now.
 * Order: build → factors → uncertainty → expected value → priority → dependencies
 * → ranking → portfolio → scenarios → sensitivity → brief.
 */
export function runDecisionScience(input: DecisionScienceInput): DecisionScienceResult {
  const events: RecommendationEvent[] = [];
  const weights = input.weights ?? DEFAULT_WEIGHTS;

  const { recommendations } = buildRecommendations(input.candidates, input.findings, input.model);
  for (const r of recommendations) events.push(evt.created(input.scanId, r.id, input.now));

  const factorSets = new Map<string, FactorSet>();
  const uncertainties = new Map<string, UncertaintyAssessment>();
  const expectedValues = new Map<string, ExpectedValue>();
  const priorities = new Map<string, PriorityScore>();

  const dependencies = analyzeDependencies(recommendations, input.dependencyEdges ?? []);

  for (const rec of recommendations) {
    const factors = computeFactors(rec, input.factorInputsFor?.(rec) ?? {});
    factorSets.set(rec.id, factors);

    const unresolved = rec.dependencies.filter((d) => !recommendations.some((r) => r.id === d)).length;
    const uncertainty = assessUncertainty(rec, factors, { ...(input.uncertaintyInputsFor?.(rec) ?? {}), unresolvedDependencies: unresolved });
    uncertainties.set(rec.id, uncertainty);
    if (uncertainty.reviewRequired) events.push(evt.reviewRequired(input.scanId, rec.id, input.now, uncertainty.flags.join(", ")));

    expectedValues.set(rec.id, computeExpectedValue(rec, input.expectedValueInputsFor?.(rec) ?? {}));
    priorities.set(rec.id, computePriority(rec, factors, { weights, uncertainty, unresolvedDependencies: unresolved }));
    events.push(evt.scored(input.scanId, rec.id, input.now, `priority ${priorities.get(rec.id)!.total}`));
  }

  for (const id of dependencies.blocked) events.push(evt.blocked(input.scanId, id, input.now, "unmet prerequisite"));

  const ranking = rankRecommendations({ recommendations, priorities, expectedValues, blockedIds: dependencies.blocked, weights });

  const constraints: PortfolioConstraints = input.constraints ?? {
    budgetCeiling: null, capacityCeiling: null, timeHorizon: null, riskTolerance: "moderate", requiredDomains: [], excludedRecommendationIds: [],
  };
  const portfolio = selectPortfolio({ id: input.idFor("portfolio"), recommendations, priorities, dependencies, constraints });
  events.push(evt.portfolioCreated(input.scanId, input.now, `${portfolio.selected.length} selected`));

  const scenarios = buildAllScenarios(recommendations, priorities, dependencies);
  for (const _s of scenarios) events.push(evt.scenarioCreated(input.scanId, input.now, _s.kind));

  const sensitivity =
    input.includeSensitivity === false
      ? null
      : analyzeSensitivity({ recommendations, factorSets, uncertainties, expectedValues, blockedIds: dependencies.blocked, baseWeights: weights });

  const decisionBrief = buildDecisionBrief({
    id: input.idFor("brief"),
    scanId: input.scanId,
    pipelineRunId: input.pipelineRunId ?? null,
    recommendations,
    ranking,
    dependencies,
    scenarios,
    expectedValues,
    uncertainties,
    weights,
    now: input.now,
  });
  events.push(evt.decisionBriefCreated(input.scanId, input.now));

  return decisionScienceResultSchema.parse({
    scanId: input.scanId,
    pipelineRunId: input.pipelineRunId ?? null,
    recommendations,
    factorSets: [...factorSets.values()],
    priorities: [...priorities.values()],
    expectedValues: [...expectedValues.values()],
    dependencies,
    ranking,
    portfolio,
    scenarios,
    sensitivity,
    decisionBrief,
    events,
  });
}

/** Artifact kinds this stage reads (never mutates). */
export const DECISION_SCIENCE_SOURCE_KINDS: ArtifactKind[] = ["findings", "recommendation_candidates"];

/**
 * Register the decision-science outputs as NEW pipeline artifacts, carrying the
 * source artifact ids so lineage + checksums are preserved. Existing artifacts are
 * left untouched. Returns the ids of the artifacts written.
 */
export function recordDecisionScienceArtifacts(
  registry: ArtifactRegistry,
  result: DecisionScienceResult,
  opts: { pipelineRunId: string; scanId: string; idFor: (prefix: string) => string; now: string },
): string[] {
  const sources = DECISION_SCIENCE_SOURCE_KINDS.map((k) => registry.latestByKind.get(k)).filter((x): x is string => x !== undefined);
  const written: string[] = [];
  // The decision brief supersedes nothing — it is an ADDITIONAL artifact derived
  // from the validated candidate/finding set.
  const brief = recordArtifact(registry, {
    id: opts.idFor("decision_brief"),
    pipelineRunId: opts.pipelineRunId,
    scanId: opts.scanId,
    kind: "recommendation_candidates", // reuses the candidate kind slot for lineage continuity
    payload: { decisionBrief: result.decisionBrief, ranking: result.ranking, portfolio: result.portfolio },
    sourceArtifactIds: sources,
    validationStatus: "valid",
    provenance: { stage: "decision_science", formulaVersion: result.priorities[0]?.formulaVersion ?? null },
    now: opts.now,
    version: 2, // a new VERSION of the candidate artifact lineage, not an in-place edit
  });
  written.push(brief.id);
  return written;
}
