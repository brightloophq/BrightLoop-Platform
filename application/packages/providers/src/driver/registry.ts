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
import { providerEnrichmentSchema, type PipelineRunStage, type ProviderEnrichment, type RuntimeRun } from "@brightloop/schema";
import type { AnthropicConfig } from "../anthropic/config.js";
import { PROVIDER_DISABLED_REASON } from "../anthropic/config.js";
import { runControlledReasoning } from "../anthropic/controlled-run.js";
import { parseProviderClaims, type ParseClaimsResult } from "../anthropic/claim-parser.js";
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
/** A reasoning job's declared token/cost budget. */
interface ReasoningBudget {
  inputTokens: number;
  outputTokens: number;
  costCeiling: number;
  latencyCeilingMs: number;
}

interface ReasoningJobRef {
  id: string;
  stage: string;
  evidenceIds: string[];
  /** The job's declared budget, or null when the envelope carried none. */
  budget: ReasoningBudget | null;
}

function posNum(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The first job in a `reasoning_jobs` envelope, reduced to what execution needs. */
function firstReasoningJob(envelope: Record<string, unknown>): ReasoningJobRef | null {
  const jobs = envelope["jobs"];
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const job = jobs[0] as Record<string, unknown>;
  const inputRefs = (job["inputRefs"] ?? {}) as Record<string, unknown>;
  const rawBudget = job["budget"];
  const budget: ReasoningBudget | null =
    rawBudget !== null && typeof rawBudget === "object"
      ? {
          inputTokens: posNum((rawBudget as Record<string, unknown>)["inputTokens"], 8_000),
          outputTokens: posNum((rawBudget as Record<string, unknown>)["outputTokens"], 2_000),
          costCeiling: posNum((rawBudget as Record<string, unknown>)["costCeiling"], 1),
          latencyCeilingMs: posNum((rawBudget as Record<string, unknown>)["latencyCeilingMs"], 60_000),
        }
      : null;
  return {
    id: typeof job["id"] === "string" ? job["id"] : "",
    stage: typeof job["stage"] === "string" ? job["stage"] : "reasoning",
    evidenceIds: Array.isArray(inputRefs["evidenceIds"]) ? (inputRefs["evidenceIds"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    budget,
  };
}

/* ---- evidence hydration ------------------------------------------------------
 * The reasoning turn needs the actual evidence CONTENT, not just the ids. The
 * live diagnostic proved the model was handed only evidence identifiers + scan
 * metadata and (correctly) refused to reason, so the runtime must hydrate the
 * referenced bundle items. Bounded by construction: only the job's referenced
 * OBSERVED items, a capped count, flat signals, and truncated strings. The digest
 * travels as fenced BUSINESS_CONTEXT DATA (prompt.ts), never as instructions. */

const MAX_EVIDENCE_ITEMS = 8;
const MAX_SIGNAL_STRING = 800;
const MAX_SIGNAL_ARRAY = 12;

interface EvidenceDigestItem {
  id: string;
  source: string;
  state: string;
  url: string | null;
  signals: Record<string, unknown>;
}

/** Flatten + bound one evidence item's `value` into safe, capped signals. */
function boundSignals(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v.length > MAX_SIGNAL_STRING ? `${v.slice(0, MAX_SIGNAL_STRING)}…` : v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, MAX_SIGNAL_ARRAY).filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean");
    // nested objects are dropped to keep the digest flat + within budget
  }
  return out;
}

/** Load the referenced OBSERVED evidence items from the bundle, bounded + safe. */
async function loadEvidenceDigest(deps: DefaultRegistryDeps, runId: string, evidenceIds: string[]): Promise<EvidenceDigestItem[]> {
  const bundle = await deps.runtime.artifacts.latest(runId, "evidence_bundle");
  if (!bundle.ok || bundle.value === null) return [];
  const items = bundle.value.envelope["items"];
  if (!Array.isArray(items)) return [];
  const wanted = new Set(evidenceIds);
  const digest: EvidenceDigestItem[] = [];
  for (const raw of items) {
    if (raw === null || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = item["id"];
    if (typeof id !== "string") continue;
    if (wanted.size > 0 && !wanted.has(id)) continue; // only what the job references
    if (item["state"] === "unavailable") continue; // never hydrate an unavailable item
    const provenance = (item["provenance"] ?? {}) as Record<string, unknown>;
    const citations = Array.isArray(item["citations"]) ? (item["citations"] as unknown[]) : [];
    digest.push({
      id,
      source: typeof item["source"] === "string" ? item["source"] : "pages",
      state: typeof item["state"] === "string" ? item["state"] : "observed",
      url: typeof provenance["origin"] === "string" ? (provenance["origin"] as string) : typeof citations[0] === "string" ? (citations[0] as string) : null,
      signals: boundSignals(item["value"]),
    });
    if (digest.length >= MAX_EVIDENCE_ITEMS) break;
  }
  return digest;
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

    // EVIDENCE HYDRATION — hand the model the actual referenced evidence CONTENT,
    // not just its ids, so it can ground claims instead of refusing for lack of
    // evidence. Bounded + observed-only; travels as fenced BUSINESS_CONTEXT DATA.
    const evidence = job === null ? [] : await loadEvidenceDigest(deps, run.id, job.evidenceIds);

    // TOKEN BUDGET — use the reasoning job's declared budget (≈2000 output tokens)
    // instead of the 512 default that truncated the JSON mid-string. Falls back to
    // a safe value (capped by the provider config) when the job declares none.
    const budget: ReasoningBudget = job?.budget ?? {
      inputTokens: 8_000,
      outputTokens: Math.min(deps.config.maxOutputTokens, 2_000),
      costCeiling: 1,
      latencyCeilingMs: 60_000,
    };

    const outcome = await runControlledReasoning(
      {
        runId: run.id,
        clientId: run.clientId,
        scanId: run.scanId,
        objective: job === null ? "Execute the reasoning stage for this scan and return a grounded structured result." : `Execute the ${job.stage} reasoning job and return a grounded structured result.`,
        outputSchemaId: "execution_outcomes",
        businessContext: job === null ? run.metadata : { ...run.metadata, reasoningJobId: job.id, evidenceIds: job.evidenceIds, evidence },
        budget,
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

    // C7 · distil SAFE, structured claim candidates from the VALIDATED output,
    // bounded to the evidence the reasoning job referenced. The parser is the
    // leak boundary: it copies only a bounded statement, an enum category, known
    // evidence ids and an integer confidence — never raw prose. The artifact
    // still carries NO raw model output.
    const known = new Set(job?.evidenceIds ?? []);
    const parsed = parseProviderClaims(response?.output ?? null, known);
    const enrichment = buildEnrichment(parsed);

    return {
      envelope: {
        kind: "execution_outcomes",
        providerId: adapter.providerId,
        model: response?.model?.model ?? deps.config.model,
        finalStatus: outcome.finalStatus,
        validationStatus,
        attempts: outcome.attempts.length,
        enrichment,
      },
      kind: "execution_outcomes",
      sourceArtifactIds,
    };
  };
}

/** Build the safe enrichment section from a parse result. Never carries prose. */
function buildEnrichment(parsed: ParseClaimsResult): ProviderEnrichment {
  const accepted = parsed.candidates.length;
  const rejected = parsed.rejections.length;
  const status: ProviderEnrichment["status"] =
    accepted > 0 && rejected > 0 ? "partial" : accepted > 0 ? "accepted" : rejected > 0 ? "rejected" : "attempted";
  return providerEnrichmentSchema.parse({
    status,
    accepted,
    rejected,
    candidates: parsed.candidates,
    rejectionCategories: parsed.rejections,
  });
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
