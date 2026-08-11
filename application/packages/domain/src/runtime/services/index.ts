/* =============================================================================
 * Runtime services (Phase B · Sprint 13C) — barrel + composition root.
 * ========================================================================== */

export * from "./support.js";
export * from "./event.service.js";
export * from "./run.service.js";
export * from "./pipeline.service.js";
export * from "./checkpoint.service.js";
export * from "./artifact.service.js";
export * from "./queue.service.js";
export * from "./reasoning.service.js";
export * from "./provider-attempt.service.js";
export * from "./derived.services.js";
export * from "./execution-engine.js";
export * from "./coordinator.js";
export * from "../commercial/index.js";
export * as runtimeReadModels from "./read-models.js";

import { systemClock, type Clock } from "../../guard.js";
import type { RuntimeRepository } from "../repository.js";
import { CommercialCoordinator } from "../commercial/index.js";
import { ArtifactService } from "./artifact.service.js";
import { CheckpointService } from "./checkpoint.service.js";
import { RuntimeCoordinator } from "./coordinator.js";
import {
  CompetitorService,
  FindingService,
  NarrativeService,
  ProposalService,
  RecommendationService,
} from "./derived.services.js";
import { EventService } from "./event.service.js";
import { PipelineService } from "./pipeline.service.js";
import { ProviderAttemptService } from "./provider-attempt.service.js";
import { QueueService } from "./queue.service.js";
import { ReasoningService } from "./reasoning.service.js";
import { RunService } from "./run.service.js";
import type { RuntimeIdGen, RuntimeServiceContext } from "./support.js";

/** Every runtime service, plus the coordinator that sequences them. */
export interface RuntimeServices {
  runs: RunService;
  pipeline: PipelineService;
  checkpoints: CheckpointService;
  artifacts: ArtifactService;
  queue: QueueService;
  reasoning: ReasoningService;
  providerAttempts: ProviderAttemptService;
  findings: FindingService;
  recommendations: RecommendationService;
  competitors: CompetitorService;
  proposals: ProposalService;
  narratives: NarrativeService;
  events: EventService;
  coordinator: RuntimeCoordinator;
  /** Post-scan commercial workflow scheduler (separate from the core pipeline). */
  commercial: CommercialCoordinator;
}

export interface RuntimeServicesDeps {
  repo: RuntimeRepository;
  ids: RuntimeIdGen;
  clock?: Clock;
  actorId?: string | null;
}

/**
 * Build the full service set from one repository.
 *
 * This is the ONLY place the composite `RuntimeRepository` is used. Each service
 * receives it narrowed to the interface it actually needs (TypeScript accepts the
 * composite wherever a member interface is required), so a service can never
 * reach an aggregate it has no business touching.
 */
export function createRuntimeServices(deps: RuntimeServicesDeps): RuntimeServices {
  const ctx: RuntimeServiceContext = {
    ids: deps.ids,
    clock: deps.clock ?? systemClock,
    actorId: deps.actorId ?? null,
  };
  const { repo } = deps;

  const events = new EventService(repo, ctx);
  const runs = new RunService(repo, events, ctx);
  const pipeline = new PipelineService(repo, repo, events, ctx);
  const checkpoints = new CheckpointService(repo, events, ctx);
  const artifacts = new ArtifactService(repo, events, ctx);
  const queue = new QueueService(repo, events, ctx);
  const reasoning = new ReasoningService(repo, events, ctx);
  const providerAttempts = new ProviderAttemptService(repo, events, ctx);
  const findings = new FindingService(repo, ctx);
  const recommendations = new RecommendationService(repo, ctx);
  const competitors = new CompetitorService(repo, ctx);
  const proposals = new ProposalService(repo, ctx);
  const narratives = new NarrativeService(repo, ctx);

  const coordinator = new RuntimeCoordinator(
    { runs, pipeline, checkpoints, artifacts, queue, events },
    ctx,
  );
  const commercial = new CommercialCoordinator({ queue, artifacts, proposals, narratives, events }, ctx);

  return {
    runs, pipeline, checkpoints, artifacts, queue, reasoning, providerAttempts,
    findings, recommendations, competitors, proposals, narratives, events, coordinator, commercial,
  };
}
