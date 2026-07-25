/* =============================================================================
 * Stage-executor registry (Phase C · Sprint C2.1 §3).
 *
 * Maps the current runtime stage to an executable implementation or a stable
 * block. The default registry makes the ONE stage the live provider can execute
 * — `provider_execution` — executable via the controlled reasoning path, and
 * blocks every other stage whose runtime dependency (crawler, discovery,
 * evidence, graph, synthesis) is not yet wired.
 *
 * There is no fabricated placeholder artifact, no fake success, and no hidden
 * fallthrough — an unsupported stage returns a stable, named block.
 * ========================================================================== */

import { StageBlockedError, type ReasoningProviderAdapter, type RuntimeServices, type StageExecutor, type StageWork } from "@brightloop/domain";
import type { PipelineRunStage, RuntimeRun } from "@brightloop/schema";
import type { AnthropicConfig } from "../anthropic/config.js";
import { PROVIDER_DISABLED_REASON } from "../anthropic/config.js";
import { runControlledReasoning } from "../anthropic/controlled-run.js";
import type { StageExecutorRegistry, StageSupport } from "./contract.js";

/** The one stage a live reasoning provider drives. */
const REASONING_STAGE: PipelineRunStage = "provider_execution";

/** Safe reasoning telemetry captured for the driver result — never content. */
export interface ReasoningTelemetry {
  providerId: string;
  modelId: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimated: boolean;
  validationStatus: string | null;
  finalStatus: string;
}

export interface DefaultRegistryDeps {
  config: AnthropicConfig;
  /** null when the live provider is disabled — the reasoning stage then blocks. */
  adapter: ReasoningProviderAdapter | null;
  runtime: RuntimeServices;
  now: string;
  traceId: string;
  ids: (prefix: string) => string;
  /** Sink for reasoning telemetry — the driver reads it after the turn. */
  onReasoning?: (telemetry: ReasoningTelemetry) => void;
}

/** Human-readable block reasons for stages not yet wired. */
const BLOCK_REASONS: Partial<Record<PipelineRunStage, string>> = {
  discovery_planning: "discovery/crawler runtime not implemented (C3)",
  discovery_completion: "discovery/crawler runtime not implemented (C3)",
  evidence_normalization: "evidence ingestion runtime not implemented (C3)",
  evidence_validation: "evidence ingestion runtime not implemented (C3)",
  graph_assembly: "graph assembly runtime not implemented",
  graph_snapshot: "graph snapshot runtime not implemented",
  reasoning_job_creation: "reasoning-job creation runtime not implemented",
  provider_routing: "provider routing runtime not implemented",
  grounding_validation: "grounding-validation runtime not implemented",
  finding_synthesis: "finding-synthesis runtime not implemented",
  recommendation_candidates: "recommendation runtime not implemented",
  report_assembly: "report-assembly runtime not implemented",
};

/**
 * Build the reasoning executor. It runs the controlled reasoning path against the
 * live adapter (which records the provider attempt through the runtime), captures
 * SAFE telemetry, and returns an execution-outcome artifact envelope carrying
 * only metadata — never raw model output.
 *
 * A disabled provider throws `StageBlockedError("provider_disabled")`; a
 * non-succeeded reasoning outcome throws a plain error whose message names the
 * final status, so the engine records a stage failure and the driver maps the
 * disposition (budget_exhausted / deadline / retryable).
 */
/** The first job in a `reasoning_jobs` envelope, reduced to what execution needs. */
function firstReasoningJob(envelope: Record<string, unknown>): { id: string; stage: string; evidenceIds: string[] } | null {
  const jobs = envelope["jobs"];
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const job = jobs[0] as Record<string, unknown>;
  const inputRefs = (job["inputRefs"] ?? {}) as Record<string, unknown>;
  return {
    id: typeof job["id"] === "string" ? job["id"] : "",
    stage: typeof job["stage"] === "string" ? job["stage"] : "reasoning",
    evidenceIds: Array.isArray(inputRefs["evidenceIds"]) ? (inputRefs["evidenceIds"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
  };
}

function reasoningExecutor(deps: DefaultRegistryDeps): StageExecutor {
  return async (_stage: PipelineRunStage, run: RuntimeRun): Promise<StageWork> => {
    if (!deps.config.enabled || deps.adapter === null) {
      throw new StageBlockedError(PROVIDER_DISABLED_REASON);
    }
    const adapter = deps.adapter;

    // C6.2c · consume the `reasoning_jobs` artifact when it exists, so the runtime
    // job (produced by reasoning_job_creation) drives this execution's input and
    // lineage. Backward-compatible: with no job artifact, the input falls back to
    // the run itself, exactly as before. This never changes the execution_outcomes
    // envelope (still metadata-only — no model output is persisted).
    const jobsArtifact = await deps.runtime.artifacts.latest(run.id, "reasoning_jobs");
    const job = jobsArtifact.ok && jobsArtifact.value !== null ? firstReasoningJob(jobsArtifact.value.envelope) : null;
    const sourceArtifactIds = jobsArtifact.ok && jobsArtifact.value !== null ? [jobsArtifact.value.id] : [];

    const outcome = await runControlledReasoning(
      {
        runId: run.id,
        clientId: run.clientId,
        scanId: run.scanId,
        objective: job === null ? "Execute the reasoning stage for this scan and return a grounded structured result." : `Execute the ${job.stage} reasoning job and return a grounded structured result.`,
        outputSchemaId: "execution_outcomes",
        businessContext: job === null ? run.metadata : { ...run.metadata, reasoningJobId: job.id, evidenceIds: job.evidenceIds },
      },
      { config: deps.config, adapter, now: deps.now, traceId: deps.traceId, ids: deps.ids, runtime: deps.runtime },
    );

    const response = outcome.response;
    const validationStatus = response === null ? null : response.validation.passed ? "passed" : "rejected";
    deps.onReasoning?.({
      providerId: adapter.providerId,
      modelId: response?.model?.model ?? deps.config.model,
      latencyMs: response?.latencyMs ?? null,
      inputTokens: response?.usage.actualInputTokens ?? null,
      outputTokens: response?.usage.actualOutputTokens ?? null,
      estimated: response?.usage.estimated ?? true,
      validationStatus,
      finalStatus: outcome.finalStatus,
    });

    if (outcome.finalStatus !== "succeeded") {
      // Not a StageBlockedError — a genuine stage failure the engine records and
      // the queue retries/dead-letters per the existing policy.
      throw new Error(`reasoning ${outcome.finalStatus}`);
    }

    // The artifact carries execution METADATA only — never the raw model output.
    // The validated output already flowed through the provider-attempt ledger.
    return {
      envelope: {
        kind: "execution_outcomes",
        providerId: adapter.providerId,
        model: response?.model?.model ?? deps.config.model,
        finalStatus: outcome.finalStatus,
        validationStatus,
        attempts: outcome.attempts.length,
      },
      kind: "execution_outcomes",
      sourceArtifactIds,
    };
  };
}

/** The default registry: reasoning stage executable, everything else blocked. */
export function createDefaultStageRegistry(deps: DefaultRegistryDeps): StageExecutorRegistry {
  const reasoning = reasoningExecutor(deps);
  return {
    resolve(stage: PipelineRunStage): StageSupport {
      if (stage === REASONING_STAGE) return { kind: "executable", execute: reasoning };
      return { kind: "blocked", reason: BLOCK_REASONS[stage] ?? `stage '${stage}' is not yet implemented` };
    },
  };
}
