/* =============================================================================
 * Pipeline runner (Sprint 8 §10 · AIS-001 S14 Supervisor) — PURE runtime.
 *
 * Walks the 13 orchestration stages, wiring the Phase-A layers end to end:
 * discovery fixture → evidence (validate/bundle) → graph (assemble/snapshot) →
 * reasoning jobs → routing → provider execution → grounding → findings →
 * candidates → internal report. Before EVERY stage it enforces cancellation,
 * deadline, budget, and artifact dependencies; after every stage it checkpoints.
 * Deterministic given a deterministic clock, id generator, and adapter.
 * No DB writes, no workers, no crawler, no live AI.
 * ========================================================================== */

import {
  type ArtifactKind,
  type EvidenceBundle,
  type ExecutionOutcome,
  type PipelineArtifact,
  type PipelineCheckpoint,
  type PipelineEvent,
  type PipelineFailure,
  type PipelineFinding,
  type PipelineOutcome,
  type PipelineRecommendationCandidate,
  type PipelineRun,
  type PipelineRunStage,
  type ProviderDescriptor,
  type ReasoningInput,
  type ReasoningJob,
  type ValidatedClaim,
  type IndexDimension,
} from "@brightloop/schema";
import { validateBundle } from "../evidence/validate.js";
import { coverageSummary, confidenceSummary, conflictSummary } from "../evidence/bundle.js";
import { assembleGraph } from "../graph/assembly.js";
import { createSnapshot } from "../graph/snapshot.js";
import { validateTopology } from "../graph/operations.js";
import { newReasoningJob } from "../reasoning/job.js";
import { routeReasoningJob } from "../reasoning/routing-integration.js";
import type { GroundingContext } from "../reasoning/grounding.js";
import { executeReasoningJob } from "../execution/orchestrator.js";
import type { ParsedProviderOutput } from "../execution/validate.js";
import type { ProviderPricing } from "../execution/accounting.js";
import type { CancellationToken, ReasoningProviderAdapter } from "../execution/contract.js";
import { newArtifactRegistry, recordArtifact, availableKinds, allArtifacts, type ArtifactRegistry } from "./artifacts.js";
import { PIPELINE_STAGE_ORDER, missingDependencies } from "./stages.js";
import { newCheckpoint, resumeStage, shouldSkipStage } from "./checkpoint.js";
import { accrueSpend, canAffordStage, reasoningBudgetFor } from "./budget.js";
import { pipelineFailure, blockedDependency } from "./failure.js";
import { synthesizeFindings } from "./findings.js";
import { buildRecommendationCandidates } from "./candidates.js";
import { buildInternalIntelligenceReport } from "./report.js";
import { STATUS_FOR_STAGE, recordAttempt, transitionRun } from "./run.js";
import * as evt from "./events.js";

/** A reasoning job the plan calls for (no crawler/live AI — jobs are declared). */
export interface ReasoningJobSpec {
  stage: ReasoningJob["stage"];
  taskType: ReasoningJob["taskType"];
  tokens: { inputTokens: number; outputTokens: number };
  latencyCeilingMs?: number;
  capabilities?: ReasoningJob["providerRequirements"]["capabilities"];
  evidenceIds?: string[];
}

export interface PipelineInputs {
  /** Discovery result, or a deterministic fixture (no crawler this sprint). */
  discoveryManifest: unknown;
  /** Normalized evidence ingress. */
  evidenceBundle: EvidenceBundle;
}

export interface PipelineRunnerInput {
  run: PipelineRun;
  inputs: PipelineInputs;
  reasoning: {
    policy: ReasoningInput;
    plan: ReasoningJobSpec[];
    registry: ProviderDescriptor[];
    adapters: Map<string, ReasoningProviderAdapter>;
    groundingContext: GroundingContext;
    parse: (raw: unknown) => ParsedProviderOutput;
    pricingFor: (providerId: string) => ProviderPricing;
    claimsFrom: (outcome: ExecutionOutcome, job: ReasoningJob) => ValidatedClaim[];
  };
  synthesis: {
    domainFor: (claim: ValidatedClaim, index: number) => IndexDimension;
    businessImpactFor?: (claim: ValidatedClaim, index: number) => string;
    graphNodeIdsFor?: (claim: ValidatedClaim, index: number) => string[];
  };
  /** Prior checkpoints to resume from (§4). */
  resumeFrom?: PipelineCheckpoint[];
}

export interface PipelineRunnerDeps {
  clock: () => string;
  ids: (prefix: string) => string;
  signal?: CancellationToken;
}

/** Internal mutable state threaded through the stage loop. */
interface RunState {
  run: PipelineRun;
  registry: ArtifactRegistry;
  checkpoints: PipelineCheckpoint[];
  events: PipelineEvent[];
  claims: ValidatedClaim[];
  findings: PipelineFinding[];
  candidates: PipelineRecommendationCandidate[];
  jobs: ReasoningJob[];
  outcomes: ExecutionOutcome[];
  bundle: EvidenceBundle | null;
  report: PipelineOutcome["report"];
}

/**
 * Run the pipeline. Returns a completed / blocked / failed / cancelled outcome.
 * Every stage is gated on dependencies, budget, cancellation, and deadline.
 */
export async function runPipeline(input: PipelineRunnerInput, deps: PipelineRunnerDeps): Promise<PipelineOutcome> {
  const { clock, ids } = deps;
  const state: RunState = {
    run: input.run,
    registry: newArtifactRegistry(),
    checkpoints: [...(input.resumeFrom ?? [])],
    events: [],
    claims: [],
    findings: [],
    candidates: [],
    jobs: [],
    outcomes: [],
    bundle: null,
    report: null,
  };
  const emit = (e: PipelineEvent) => state.events.push(e);
  emit(evt.created(state.run.id, clock()));

  const resumeAt = state.checkpoints.length > 0 ? resumeStage(state.checkpoints) : PIPELINE_STAGE_ORDER[0]!;
  if (state.checkpoints.length > 0) emit(evt.resumed(state.run.id, resumeAt, clock()));

  let failure: PipelineFailure | null = null;

  for (const stage of PIPELINE_STAGE_ORDER) {
    // resume: skip stages already covered by a valid checkpoint
    if (shouldSkipStage(stage, state.checkpoints)) continue;

    // ---- pre-flight gates: cancellation → deadline → budget → dependencies
    if (deps.signal?.cancelled) {
      state.run = transitionRun(state.run, "cancelled", clock());
      emit(evt.cancelled(state.run.id, stage, clock(), deps.signal.source ?? "system"));
      return finish(state, "cancelled", pipelineFailure({ kind: "cancellation", stage, detail: "run cancelled", now: clock() }));
    }
    const now = clock();
    if (state.run.deadline !== null && now >= state.run.deadline) {
      failure = pipelineFailure({ kind: "timeout", stage, detail: "deadline exceeded", now });
      break;
    }
    if (!canAffordStage(state.run.budget, state.run.spend)) {
      failure = pipelineFailure({ kind: "budget_exhaustion", stage, detail: "no remaining budget", now });
      emit(evt.budgetWarning(state.run.id, stage, now, "hard ceiling reached"));
      break;
    }
    const missing = missingDependencies(stage, availableKinds(state.registry));
    if (missing.length > 0) {
      failure = blockedDependency(stage, missing, now);
      emit(evt.blocked(state.run.id, stage, now, failure.detail));
      state.run = transitionRun(state.run, "blocked", now);
      return finish(state, "blocked", failure);
    }

    // ---- execute the stage
    state.run = transitionRun(state.run, STATUS_FOR_STAGE[stage], now);
    emit(evt.stageStarted(state.run.id, stage, now));
    const result = await runStage(stage, state, input, deps);

    if (result !== null) {
      failure = result;
      state.run = recordAttempt(state.run, stage, false, null, clock());
      emit(evt.stageFailed(state.run.id, stage, clock(), failure.detail));
      break;
    }

    // ---- checkpoint the completed stage
    state.run = recordAttempt(state.run, stage, true, null, clock());
    state.run = { ...state.run, completedStages: [...state.run.completedStages, stage], currentStage: stage };
    const cp = newCheckpoint({ id: ids("cp"), pipelineRunId: state.run.id, stage, artifactIds: allArtifacts(state.registry).map((a) => a.id), now: clock() });
    state.checkpoints.push(cp);
    emit(evt.stageCompleted(state.run.id, stage, clock()));
    emit(evt.checkpointCreated(state.run.id, stage, clock()));
    if (state.run.spend.softWarning) emit(evt.budgetWarning(state.run.id, stage, clock(), `spend ${state.run.spend.actual}`));
  }

  if (failure !== null) {
    state.run = transitionRun(state.run, "failed", clock());
    state.run = { ...state.run, failedStage: failure.stage };
    return finish(state, "failed", failure);
  }

  state.run = transitionRun(state.run, "completed", clock());
  emit(evt.completed(state.run.id, clock()));
  return finish(state, "completed", null);
}

/* ---- stage bodies: return a failure, or null on success -------------------- */
async function runStage(stage: PipelineRunStage, s: RunState, input: PipelineRunnerInput, deps: PipelineRunnerDeps): Promise<PipelineFailure | null> {
  const { clock, ids } = deps;
  const base = { pipelineRunId: s.run.id, scanId: s.run.scanId };
  const record = (kind: ArtifactKind, payload: unknown, sources: string[] = [], valid = true): PipelineArtifact =>
    recordArtifact(s.registry, { id: ids(kind), ...base, kind, payload, sourceArtifactIds: sources, validationStatus: valid ? "valid" : "invalid", now: clock() });
  const idsOf = (...kinds: ArtifactKind[]) => kinds.map((k) => s.registry.latestByKind.get(k)).filter((x): x is string => x !== undefined);

  switch (stage) {
    case "discovery_planning": {
      if (input.inputs.discoveryManifest === null || input.inputs.discoveryManifest === undefined) {
        return pipelineFailure({ kind: "discovery_failure", stage, detail: "no discovery manifest supplied", now: clock() });
      }
      return null;
    }
    case "discovery_completion": {
      record("discovery_manifest", input.inputs.discoveryManifest);
      return null;
    }
    case "evidence_normalization": {
      s.bundle = input.inputs.evidenceBundle;
      if (s.bundle.items.length === 0) {
        return pipelineFailure({ kind: "malformed_artifact", stage, detail: "evidence ingress is empty", now: clock() });
      }
      record("evidence_ingress", s.bundle, idsOf("discovery_manifest"));
      return null;
    }
    case "evidence_validation": {
      const errors = validateBundle(s.bundle!, clock());
      if (errors.length > 0) {
        const bad = record("evidence_bundle", s.bundle, idsOf("evidence_ingress"), false); // preserved for audit
        return pipelineFailure({ kind: "evidence_validation_failure", stage, detail: `${errors.length} validation error(s): ${errors[0]!.code}`, now: clock(), artifactIds: [bad.id] });
      }
      record("evidence_bundle", s.bundle, idsOf("evidence_ingress"));
      return null;
    }
    case "graph_assembly": {
      const graph = assembleGraph(s.bundle!, clock(), s.run.clientId);
      const problems = validateTopology(graph);
      if (problems.length > 0) {
        const bad = record("intelligence_graph", graph, idsOf("evidence_bundle"), false);
        return pipelineFailure({ kind: "graph_validation_failure", stage, detail: `invalid topology: ${problems[0]}`, now: clock(), artifactIds: [bad.id] });
      }
      record("intelligence_graph", graph, idsOf("evidence_bundle"));
      return null;
    }
    case "graph_snapshot": {
      const graph = s.registry.payloads.get(s.registry.latestByKind.get("intelligence_graph")!) as Parameters<typeof createSnapshot>[0];
      record("graph_snapshot", createSnapshot(graph, s.bundle!, 1, clock()), idsOf("intelligence_graph"));
      return null;
    }
    case "reasoning_job_creation": {
      const snapshotId = s.registry.latestByKind.get("graph_snapshot")!;
      const snapshot = s.registry.byId.get(snapshotId)!;
      s.jobs = input.reasoning.plan.map((spec, i) =>
        newReasoningJob(
          {
            id: ids(`job-${i}`),
            scanId: s.run.scanId,
            clientId: s.run.clientId,
            taskType: spec.taskType,
            stage: spec.stage,
            inputRefs: { evidenceIds: spec.evidenceIds ?? s.bundle!.items.map((it) => it.id), graphSnapshotChecksum: snapshot.checksum },
            providerRequirements: { capabilities: spec.capabilities ?? [] },
            budget: reasoningBudgetFor(s.run.budget, s.run.spend, spec.tokens, spec.latencyCeilingMs ?? 30_000),
          },
          clock(),
        ),
      );
      if (s.jobs.length === 0) return pipelineFailure({ kind: "malformed_artifact", stage, detail: "reasoning plan produced no jobs", now: clock() });
      record("reasoning_jobs", s.jobs, idsOf("graph_snapshot"));
      return null;
    }
    case "provider_routing": {
      for (const job of s.jobs) {
        const sel = routeReasoningJob(job, { registry: input.reasoning.registry, now: clock() });
        if (sel.selected === null) {
          return pipelineFailure({ kind: "provider_routing_failure", stage, detail: `no eligible provider for job ${job.id}`, now: clock() });
        }
      }
      return null;
    }
    case "provider_execution": {
      for (const job of s.jobs) {
        const selection = routeReasoningJob(job, { registry: input.reasoning.registry, now: clock() });
        const outcome = await executeReasoningJob(job, selection, input.reasoning.adapters, {
          now: clock(),
          traceId: ids("trace"),
          policy: input.reasoning.policy,
          groundingContext: input.reasoning.groundingContext,
          parse: input.reasoning.parse,
          pricingFor: input.reasoning.pricingFor,
          priorJobSpend: 0,
          signal: deps.signal,
        });
        s.outcomes.push(outcome);
        const cost = outcome.response?.cost;
        s.run = { ...s.run, spend: accrueSpend(s.run.budget, s.run.spend, cost?.estimatedCost ?? 0, cost?.actualCost ?? cost?.stageSpend ?? 0) };

        if (outcome.finalStatus === "cancelled") return pipelineFailure({ kind: "cancellation", stage, detail: `job ${job.id} cancelled`, now: clock() });
        if (outcome.finalStatus === "budget_exhausted") return pipelineFailure({ kind: "budget_exhaustion", stage, detail: `job ${job.id} exhausted budget`, now: clock() });
        if (outcome.finalStatus === "timed_out") return pipelineFailure({ kind: "timeout", stage, detail: `job ${job.id} timed out`, now: clock() });
        if (outcome.finalStatus === "failed") return pipelineFailure({ kind: "provider_execution_failure", stage, detail: `job ${job.id} failed`, now: clock() });
      }
      record("execution_outcomes", s.outcomes, idsOf("reasoning_jobs"));
      if (s.run.spend.hardStop) return pipelineFailure({ kind: "budget_exhaustion", stage, detail: "spend exceeded scan ceiling", now: clock() });
      return null;
    }
    case "grounding_validation": {
      s.claims = s.outcomes.flatMap((o, i) => input.reasoning.claimsFrom(o, s.jobs[i]!));
      const rejected = s.outcomes.filter((o) => o.finalStatus === "rejected");
      if (s.claims.length === 0) {
        const bad = record("validated_claims", s.claims, idsOf("execution_outcomes"), false);
        return pipelineFailure({ kind: "grounding_rejection", stage, detail: `no claims survived grounding (${rejected.length} rejected outcome(s))`, now: clock(), artifactIds: [bad.id] });
      }
      record("validated_claims", s.claims, idsOf("execution_outcomes"));
      return null;
    }
    case "finding_synthesis": {
      s.findings = synthesizeFindings(s.claims, {
        pipelineRunId: s.run.id,
        idFor: (_c, i) => ids(`finding-${i}`),
        domainFor: input.synthesis.domainFor,
        businessImpactFor: input.synthesis.businessImpactFor,
        graphNodeIdsFor: input.synthesis.graphNodeIdsFor,
      });
      record("findings", s.findings, idsOf("validated_claims"));
      return null;
    }
    case "recommendation_candidates": {
      s.candidates = buildRecommendationCandidates(s.findings, { pipelineRunId: s.run.id, idFor: (_f, i) => ids(`cand-${i}`) });
      record("recommendation_candidates", s.candidates, idsOf("findings"));
      return null;
    }
    case "report_assembly": {
      s.report = buildInternalIntelligenceReport({
        id: ids("report"),
        run: s.run,
        findings: s.findings,
        candidates: s.candidates,
        evidenceCoverage: s.bundle ? coverageSummary(s.bundle) : null,
        confidenceSummary: s.bundle ? confidenceSummary(s.bundle) : null,
        conflicts: s.bundle ? conflictSummary(s.bundle) : [],
        artifactIds: allArtifacts(s.registry).map((a) => a.id),
        now: clock(),
      });
      record("internal_intelligence_report", s.report, idsOf("findings", "recommendation_candidates"));
      return null;
    }
  }
}

function finish(s: RunState, status: PipelineOutcome["status"], failure: PipelineFailure | null): PipelineOutcome {
  return {
    pipelineRunId: s.run.id,
    status,
    run: { ...s.run, checkpoints: s.checkpoints },
    artifacts: allArtifacts(s.registry),
    validatedClaims: s.claims,
    findings: s.findings,
    candidates: s.candidates,
    report: s.report,
    failure,
    events: s.events,
  };
}
