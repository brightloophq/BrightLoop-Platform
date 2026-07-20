/* =============================================================================
 * Pipeline integration (Sprint 11 §15) — PURE extension point.
 *
 * Consumes the DecisionBrief, ranked recommendations, the selected
 * portfolio/scenario, the competitor snapshot, and the business profile; produces
 * a proposal request, strategy, packages, and the ProposalArtifact.
 *
 * Upstream artifacts are NEVER mutated — the artifact is registered as a NEW
 * pipeline artifact carrying its source ids, preserving lineage and checksums.
 * ========================================================================== */

import {
  proposalIntelligenceResultSchema,
  type CompetitorSnapshot,
  type DecisionBrief,
  type EngineRecommendation,
  type MarketPosition,
  type PipelineArtifact,
  type PipelineFinding,
  type Portfolio,
  type ProposalEvent,
  type ProposalIntelligenceResult,
  type ProposalRequest,
  type Scenario,
} from "@brightloop/schema";
import { recordArtifact, type ArtifactRegistry } from "../pipeline-run/artifacts.js";
import { newProposalRequest, validateProposalRequest, NO_BUDGET } from "./request.js";
import { buildProposalStrategy } from "./strategy.js";
import { buildScope } from "./scope.js";
import { buildDeliverables } from "./deliverables.js";
import { buildPhases, attachMilestones } from "./phases.js";
import { buildMilestones, sequenceMilestones } from "./milestones.js";
import { metricsFromRecommendations } from "./metrics.js";
import { deriveQualifiers } from "./qualifiers.js";
import { buildInvestmentInputs } from "./investment.js";
import { buildOptionPackages } from "./packages.js";
import { buildProposalArtifact } from "./artifact.js";
import * as evt from "./events.js";

export interface ProposalIntelligenceInput {
  scanId: string;
  clientId: string | null;
  pipelineRunId?: string | null;
  recommendations: readonly EngineRecommendation[];
  findings?: readonly PipelineFinding[];
  decisionBrief?: DecisionBrief | null;
  portfolio?: Portfolio | null;
  scenario?: Scenario | null;
  competitorSnapshot?: CompetitorSnapshot | null;
  marketPosition?: MarketPosition | null;
  businessProfile?: Record<string, unknown>;
  request?: ProposalRequest;
  sourceArtifactIds?: string[];
  idFor: (prefix: string) => string;
  now: string;
}

/**
 * Run the proposal-intelligence stage end to end. Deterministic given a
 * deterministic id generator + `now`.
 */
export function runProposalIntelligence(input: ProposalIntelligenceInput): ProposalIntelligenceResult {
  const events: ProposalEvent[] = [];
  const recs = [...input.recommendations].sort((a, b) => (a.id < b.id ? -1 : 1));

  // ---- 1 · request (budget never inferred)
  const request =
    input.request ??
    newProposalRequest({
      id: input.idFor("proposal-request"),
      scanId: input.scanId,
      clientId: input.clientId,
      businessProfile: input.businessProfile ?? {},
      selectedRecommendationIds: recs.map((r) => r.id),
      selectedScenarioId: input.scenario?.kind ?? null,
      decisionBriefId: input.decisionBrief?.id ?? null,
      competitorSnapshotId: input.competitorSnapshot?.id ?? null,
      budgetRange: NO_BUDGET,
      sourceArtifactIds: input.sourceArtifactIds ?? [],
      createdAt: input.now,
    });
  events.push(evt.requested(input.scanId, input.now, `${recs.length} recommendation(s)`));

  // ---- 2 · strategy
  const strategy = buildProposalStrategy({
    id: input.idFor("strategy"),
    proposalRequestId: request.id,
    recommendations: recs,
    findings: input.findings,
    competitorEvidenceIds: input.competitorSnapshot === null || input.competitorSnapshot === undefined ? [] : [input.competitorSnapshot.id],
    workstreamIdFor: (_rec, i) => input.idFor(`ws-${i}`),
  });
  events.push(evt.strategyCreated(input.scanId, input.now, `${strategy.workstreams.length} workstream(s)`));

  // ---- 3/4 · scope + deliverables
  const { items: scope } = buildScope({
    idFor: (kind, i) => input.idFor(`scope-${kind}-${i}`),
    recommendations: recs,
    workstreams: strategy.workstreams,
    deferredRecommendationIds: input.portfolio?.deferred ?? [],
    excludedServices: request.excludedServices,
  });
  events.push(evt.scopeCreated(input.scanId, input.now, `${scope.length} scope item(s)`));

  const { deliverables } = buildDeliverables({ idFor: (_s, i) => input.idFor(`deliverable-${i}`), scope });

  // ---- 5/6 · phases + milestones
  const basePhases = buildPhases({ idFor: (kind) => input.idFor(`phase-${kind}`), workstreams: strategy.workstreams, deliverables });
  const milestones = buildMilestones({ idFor: (phase) => input.idFor(`milestone-${phase.kind}`), phases: basePhases, deliverables });
  const milestoneSequence = sequenceMilestones(milestones);
  const byPhase = new Map<string, string[]>();
  for (const m of milestones) byPhase.set(m.phaseId, [...(byPhase.get(m.phaseId) ?? []), m.id]);
  const phases = attachMilestones(basePhases, byPhase);

  // ---- 7/8/9 · metrics, qualifiers, investment inputs
  const successMetrics = metricsFromRecommendations(recs, (_r, i) => input.idFor(`metric-${i}`));
  const qualifiers = deriveQualifiers({ idFor: (kind, i) => input.idFor(`qualifier-${kind}-${i}`), recommendations: recs, scope });
  const investmentInputs = buildInvestmentInputs({ request, workstreams: strategy.workstreams, scope, qualifiers });

  // ---- 10 · option packages
  const optionPackages = buildOptionPackages({
    idFor: (kind) => input.idFor(`package-${kind}`),
    workstreams: strategy.workstreams,
    deliverables,
    scenarioRecommendationIds: input.scenario?.selected,
  });
  events.push(evt.optionsCreated(input.scanId, input.now, `${optionPackages.length} package(s)`));

  // ---- 12 · artifact
  const artifact = buildProposalArtifact({
    id: input.idFor("proposal"),
    request,
    strategy,
    scope,
    deliverables,
    phases,
    milestones,
    milestoneSequence,
    successMetrics,
    qualifiers,
    investmentInputs,
    optionPackages,
    competitorContext: {
      snapshotId: input.competitorSnapshot?.id ?? null,
      marketPercentile: input.marketPosition?.overallPercentile ?? null,
      supportsMarketClaims: input.marketPosition?.supportsMarketClaims ?? false,
      competitorIds: input.competitorSnapshot?.selectedCompetitorIds ?? [],
    },
    evidenceGaps: input.decisionBrief?.evidenceGaps ?? [],
    sourceArtifactIds: input.sourceArtifactIds ?? request.sourceArtifactIds,
    now: input.now,
  });
  events.push(evt.versionCreated(input.scanId, artifact.id, artifact.version, input.now));
  events.push(evt.reviewRequired(input.scanId, artifact.id, input.now, "human approval required before send"));

  return proposalIntelligenceResultSchema.parse({
    scanId: input.scanId,
    pipelineRunId: input.pipelineRunId ?? null,
    request,
    strategy,
    scope,
    deliverables,
    phases,
    milestones,
    optionPackages,
    artifact,
    events,
  });
}

/** Structural problems with the inputs, before any proposal is built. Pure. */
export function validateProposalInputs(request: ProposalRequest): string[] {
  return validateProposalRequest(request);
}

/** Artifact kinds this stage reads (never mutates). */
export const PROPOSAL_SOURCE_KINDS = ["findings", "recommendation_candidates"] as const;

/**
 * Register the proposal as a NEW pipeline artifact with lineage preserved.
 * Existing artifacts are left untouched.
 */
export function recordProposalArtifact(
  registry: ArtifactRegistry,
  result: ProposalIntelligenceResult,
  opts: { id: string; pipelineRunId: string; scanId: string; now: string },
): PipelineArtifact {
  const sources = PROPOSAL_SOURCE_KINDS.map((k) => registry.latestByKind.get(k)).filter((x): x is string => x !== undefined);
  const priorId = registry.latestByKind.get("recommendation_candidates");
  const priorVersion = priorId === undefined ? 1 : (registry.byId.get(priorId)?.version ?? 1);
  return recordArtifact(registry, {
    id: opts.id,
    pipelineRunId: opts.pipelineRunId,
    scanId: opts.scanId,
    kind: "recommendation_candidates", // continues the candidate lineage as a new version
    payload: { proposal: result.artifact, packages: result.optionPackages },
    sourceArtifactIds: sources,
    validationStatus: "valid",
    provenance: { stage: "proposal_intelligence", proposalId: result.artifact?.id ?? null },
    version: priorVersion + 1,
    now: opts.now,
  });
}
