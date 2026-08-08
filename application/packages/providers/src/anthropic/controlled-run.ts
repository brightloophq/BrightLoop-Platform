/* =============================================================================
 * One controlled execution path (Phase C · Sprint C2 §13).
 *
 * A server-side, single-turn entry point that drives ONE reasoning job through
 * the EXISTING stack — routing selection → `executeReasoningJob` → grounding /
 * citation / cost validation → provider attempt + runtime event persistence —
 * against the live Anthropic adapter.
 *
 * It builds nothing new: it constructs a minimal valid `ReasoningJob` +
 * `ReasoningInput` + `SelectionResult` + `GroundingContext`, runs the Sprint-7
 * orchestrator, and (when runtime services are supplied) records the outcome
 * exactly as the runtime already does. It is NOT a worker loop and NOT a public
 * endpoint — the caller invokes it explicitly, server-side.
 * ========================================================================== */

import {
  executeReasoningJob,
  RUNTIME_EVENTS,
  type ExecutionContext,
  type GroundingContext,
  type ParsedProviderOutput,
  type ReasoningProviderAdapter,
  type RuntimeServices,
} from "@brightloop/domain";
import {
  reasoningInputSchema,
  reasoningJobSchema,
  selectionResultSchema,
  type ExecutionOutcome,
  type ReasoningInput,
  type ReasoningJob,
  type SelectionResult,
} from "@brightloop/schema";
import type { AnthropicConfig } from "./config.js";

export interface ControlledReasoningInput {
  runId: string;
  clientId: string | null;
  scanId: string;
  /** The reasoning objective for this controlled turn. */
  objective: string;
  /** The output-contract id the model must satisfy. */
  outputSchemaId: string;
  /** Structured, non-secret business context handed to the model as DATA. */
  businessContext?: Record<string, unknown>;
  policyRules?: string[];
  allowedClaims?: string[];
  prohibitedClaims?: string[];
  /** Token/cost budget for the single turn. */
  budget?: { inputTokens?: number; outputTokens?: number; costCeiling?: number; latencyCeilingMs?: number };
  deadline?: string | null;
  /**
   * The CANONICAL reasoning-job id — the `public.reasoning_jobs` ledger row created
   * by `ReasoningService.create()` at reasoning_job_creation. It is REQUIRED: this
   * path never mints a reasoning id, so the provider attempt always persists against
   * that ledger row (satisfying the `provider_attempts.reasoning_job_id` FK).
   */
  jobId: string;
  /**
   * The attempt number to record for the provider attempt. Defaults to the in-run
   * reasoning attempt count; supply the ledger's monotonic attempt to keep
   * `unique(reasoning_job_id, attempt)` distinct across queue retries.
   */
  attemptNumber?: number;
}

export interface ControlledReasoningDeps {
  config: AnthropicConfig;
  adapter: ReasoningProviderAdapter;
  /** ISO clock reading — determinism, no wall clock in the orchestration. */
  now: string;
  traceId: string;
  /** Id generator for the reasoning job. */
  ids: (prefix: string) => string;
  /**
   * Optional: parse the provider output into claims + citations for grounding.
   * The default treats a well-formed JSON object as claim-free (grounding passes
   * trivially), which is correct for a smoke test where the model returns a
   * structured object without asserting evidence-bound claims.
   */
  parse?: (raw: unknown) => ParsedProviderOutput;
  /** When present, record a provider attempt + runtime event for the run. */
  runtime?: RuntimeServices;
}

const DEFAULT_PARSE = (): ParsedProviderOutput => ({ claims: [], citations: [] });

/** Assemble the minimal valid reasoning job for a controlled turn. */
function buildJob(input: ControlledReasoningInput, deps: ControlledReasoningDeps): ReasoningJob {
  const budget = {
    costCeiling: input.budget?.costCeiling ?? 1,
    inputTokens: input.budget?.inputTokens ?? 4_000,
    outputTokens: input.budget?.outputTokens ?? 512,
    latencyCeilingMs: input.budget?.latencyCeilingMs ?? 60_000,
  };
  return reasoningJobSchema.parse({
    // The canonical ledger id — never minted here (only ReasoningService.create mints).
    id: input.jobId,
    scanId: input.scanId,
    clientId: input.clientId,
    taskType: "reasoning",
    stage: "research",
    inputRefs: { evidenceIds: [], graphRefs: [], graphSnapshotChecksum: null, discoveryManifestId: null },
    requiredOutputs: [input.outputSchemaId],
    providerRequirements: { capabilities: ["structured_output"], minContextTokens: 0, preferredProviderIds: [deps.config.providerId] },
    budget,
    deadline: input.deadline ?? null,
    priority: 0,
    status: "routed",
    attempt: 0,
    createdAt: deps.now,
  });
}

/** Assemble the structured reasoning input (policy, objective, claims, contract). */
function buildInput(job: ReasoningJob, input: ControlledReasoningInput): ReasoningInput {
  return reasoningInputSchema.parse({
    jobId: job.id,
    businessContext: input.businessContext ?? {},
    evidenceRefs: [],
    graphRefs: [],
    taskObjective: input.objective,
    constraints: [],
    policyRules: input.policyRules ?? ["You are a careful business-intelligence analyst. Ground every claim in supplied evidence."],
    allowedClaims: input.allowedClaims ?? [],
    prohibitedClaims: input.prohibitedClaims ?? [],
    outputSchemaId: input.outputSchemaId,
    costBudget: job.budget.costCeiling,
    tokenBudget: { inputTokens: job.budget.inputTokens, outputTokens: job.budget.outputTokens },
    deadline: job.deadline,
    providerCapabilityRequirements: ["structured_output"],
  });
}

/** A single-provider selection targeting the Anthropic adapter (no fallback). */
function buildSelection(deps: ControlledReasoningDeps): SelectionResult {
  return selectionResultSchema.parse({
    selected: deps.config.providerId,
    estimatedCost: 0,
    estimatedLatencyMs: 0,
    fallbackOrder: [],
    rejected: [],
    rationale: { taskType: "reasoning", consideredCount: 1, eligibleCount: 1, orderedBy: ["preferred"], softBudgetWarning: false, projectedJobSpend: 0 },
  });
}

/**
 * Run the controlled reasoning turn. Returns the full execution outcome from the
 * existing orchestrator. When `deps.runtime` is supplied, records a provider
 * attempt and a runtime event through the runtime services — the Phase-B
 * persistence path — proving the live adapter flows end to end.
 */
export async function runControlledReasoning(
  input: ControlledReasoningInput,
  deps: ControlledReasoningDeps,
): Promise<ExecutionOutcome> {
  const job = buildJob(input, deps);
  const policy = buildInput(job, input);
  const selection = buildSelection(deps);

  const groundingContext: GroundingContext = {
    evidenceById: new Map(),
    knownCompetitorIds: new Set(),
    prohibitedClaims: (input.prohibitedClaims ?? []).map((c) => c.toLowerCase()),
  };

  const adapters = new Map<string, ReasoningProviderAdapter>([[deps.adapter.providerId, deps.adapter]]);

  const ctx: ExecutionContext = {
    now: deps.now,
    traceId: deps.traceId,
    policy,
    groundingContext,
    parse: deps.parse ?? DEFAULT_PARSE,
    pricingFor: () => ({ inputPerMTokens: deps.config.cost.inputPerMTokens, outputPerMTokens: deps.config.cost.outputPerMTokens }),
  };

  const outcome = await executeReasoningJob(job, selection, adapters, ctx);

  if (deps.runtime !== undefined) {
    await persistAttempt(deps.runtime, input, job, outcome, deps.config.providerId);
  }
  return outcome;
}

/** Record the terminal attempt + a runtime event through the Phase-B runtime. */
async function persistAttempt(
  runtime: RuntimeServices,
  input: ControlledReasoningInput,
  job: ReasoningJob,
  outcome: ExecutionOutcome,
  providerId: string,
): Promise<void> {
  const response = outcome.response;
  const succeeded = outcome.finalStatus === "succeeded";
  const attempt = input.attemptNumber ?? outcome.attempts.length;
  // SAFE failure telemetry — present for a non-succeeded outcome (esp. the
  // malformed/transport path where `response` is null). Classification + counts
  // only; the `runtime.provider.attempted` event surfaces it, never raw output.
  const ft = outcome.failureTelemetry;
  const recorded = await runtime.providerAttempts.record({
    reasoningJobId: job.id,
    runId: input.runId,
    clientId: input.clientId,
    scanId: input.scanId,
    providerId,
    attempt,
    status: succeeded ? "succeeded" : outcome.finalStatus === "timed_out" ? "timed_out" : outcome.finalStatus === "cancelled" ? "cancelled" : "failed",
    latencyMs: response?.latencyMs ?? ft?.latencyMs ?? null,
    estimatedCost: response?.cost.estimatedCost ?? null,
    actualCost: response?.cost.actualCost ?? null,
    inputTokens: response?.usage.actualInputTokens ?? ft?.inputTokens ?? null,
    outputTokens: response?.usage.actualOutputTokens ?? ft?.outputTokens ?? null,
    usageEstimated: response?.usage.estimated ?? true,
    // Safe pointer only — never raw model content.
    rawResponseRef: response?.rawResponseRef ?? null,
    lastError: succeeded ? null : outcome.finalStatus,
    // Safe failure telemetry for the event payload (never a raw message/body).
    failureKind: ft?.failureKind ?? null,
    finishReason: ft?.finishReason ?? response?.finishReason ?? null,
    stopReason: ft?.stopReason ?? null,
    parserOutcome: ft?.parserOutcome ?? null,
    providerErrorCode: ft?.providerErrorCode ?? null,
    responseLength: ft?.responseLength ?? null,
  });

  // SAFE, PERMANENT OBSERVABILITY — a persistence failure is NEVER swallowed. On
  // error, record an append-only runtime event carrying only safe metadata (ids +
  // stable error code + final status) — never raw provider text.
  if (!recorded.ok) {
    await runtime.events.emitRunEvent(
      RUNTIME_EVENTS.providerAttemptPersistFailed,
      { id: input.runId, clientId: input.clientId, scanId: input.scanId },
      { reasoningJobId: job.id, attempt, providerId, error: recorded.code, finalStatus: outcome.finalStatus },
    );
  }
}
