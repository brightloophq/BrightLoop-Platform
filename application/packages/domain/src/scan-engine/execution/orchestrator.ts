/* =============================================================================
 * Execution orchestrator (Sprint 7 §6 · AIS-001 §13/§14 · AIS-002 A01/A03/A05) — PURE runtime.
 *
 * Runs a routed reasoning job through provider adapters: selected provider first,
 * retry the same provider on transient errors, ordered fallback on provider
 * failure, stop on fatal / hard-budget / deadline / cancellation — never an
 * infinite retry. Every attempt, routing decision, and validation result is
 * preserved; the accepted output is grounded, accounted, and provenanced.
 * Deterministic given a deterministic adapter + supplied `now`. No I/O of its own.
 * ========================================================================== */

import {
  buildResultProvenance,
} from "../reasoning/provenance.js";
import {
  decideRetry,
  isRetryableFailure,
  nextFallbackProvider,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
} from "../reasoning/retry.js";
import { providerChain } from "../reasoning/routing-integration.js";
import {
  newCancellationToken,
  cancel,
  adapterMeetsCapabilities,
  ProviderExecutionError,
  type CancellationToken,
  type ExecutionControl,
  type ReasoningProviderAdapter,
} from "./contract.js";
import { buildExecutionRequest } from "./request.js";
import { normalizeExecutionResponse } from "./response.js";
import { validateExecutionOutput, type ParsedProviderOutput } from "./validate.js";
import { buildUsage, buildCostAccounting, projectedExceedsCeiling, exceedsHardCeiling, type ProviderPricing } from "./accounting.js";
import * as evt from "./events.js";
import type {
  ReasoningJob,
  ReasoningInput,
  SelectionResult,
  ExecutionAttempt,
  ExecutionEvent,
  ExecutionResponse,
  ExecutionOutcome,
  ExecutionStatus,
  ReasoningFailureKind,
} from "@brightloop/schema";
import type { GroundingContext } from "../reasoning/grounding.js";

const SOFT_WARNING_FRACTION = 0.8;

export interface ExecutionContext {
  now: string;
  traceId: string;
  policy: ReasoningInput; // reasoning input — objective, claims, output schema, business context
  groundingContext: GroundingContext;
  /** Parse + shape-validate raw provider output, extracting claims + citations. */
  parse: (raw: unknown) => ParsedProviderOutput;
  /** Per-provider pricing (opaque id → price). */
  pricingFor: (providerId: string) => ProviderPricing;
  priorJobSpend?: number;
  softWarningFraction?: number;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number; // per-attempt timeout override (defaults to the job latency ceiling)
  signal?: CancellationToken; // external cancellation token
  onProgress?: (e: ExecutionEvent) => void;
}

const STATUS_FOR_KIND: Record<ReasoningFailureKind, ExecutionStatus> = {
  timeout: "timed_out",
  cancelled: "cancelled",
  budget_exhausted: "budget_exhausted",
  validation: "rejected",
  fatal: "failed",
  retryable: "failed",
};

/**
 * Execute a routed reasoning job with retry + ordered fallback. Returns the full
 * outcome: terminal status, terminal response, attempt history, event stream, and
 * result provenance. Deterministic.
 */
export async function executeReasoningJob(
  job: ReasoningJob,
  selection: SelectionResult,
  adapters: Map<string, ReasoningProviderAdapter>,
  ctx: ExecutionContext,
): Promise<ExecutionOutcome> {
  const events: ExecutionEvent[] = [];
  const attempts: ExecutionAttempt[] = [];
  const signal = ctx.signal ?? newCancellationToken();
  const retryPolicy: RetryPolicy = ctx.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const softWarningAt = job.budget.costCeiling * (ctx.softWarningFraction ?? SOFT_WARNING_FRACTION);
  const timeoutMs = ctx.timeoutMs ?? job.budget.latencyCeilingMs;

  const emit = (e: ExecutionEvent) => {
    events.push(e);
    ctx.onProgress?.(e);
  };

  const chain = providerChain(selection);
  let priorJobSpend = ctx.priorJobSpend ?? 0;
  let finalStatus: ExecutionStatus = "failed";
  let terminalResponse: ExecutionResponse | null = null;
  let terminalModel: ExecutionResponse["model"] = null;

  const tried: string[] = [];
  let providerId: string | null = chain[0] ?? null;

  if (providerId === null) {
    emit(evt.executionFailed(job.id, "", ctx.now, "no eligible provider"));
    return finalize(job, selection, "failed", null, attempts, events, ctx.now, null);
  }

  for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt++) {
    // ---- pre-flight: cancellation → deadline → provider presence → capability → budget
    if (signal.cancelled) {
      finalStatus = "cancelled";
      emit(evt.executionCancelled(job.id, providerId, ctx.now, signal.source ?? "system"));
      break;
    }
    if (job.deadline !== null && ctx.now >= job.deadline) {
      finalStatus = "deadline_exceeded";
      cancel(signal, "deadline");
      emit(evt.executionCancelled(job.id, providerId, ctx.now, "deadline exceeded"));
      break;
    }

    const adapter = providerId === null ? undefined : adapters.get(providerId);
    if (adapter === undefined) {
      // provider not wired → treat as a fatal miss for this provider, try fallback
      attempts.push(attemptRecord(providerId!, attempt, "failed", "fatal", 0, ctx.now));
      emit(evt.executionFailed(job.id, providerId!, ctx.now, "provider adapter not registered"));
      const nxt = advance("fatal", attempt, selection, tried, providerId!, retryPolicy);
      if (nxt === null) { finalStatus = "failed"; break; }
      providerId = nxt.providerId;
      if (nxt.fellBack) emit(evt.fallbackStarted(job.id, providerId, ctx.now));
      continue;
    }

    const request = buildExecutionRequest({ job, policy: ctx.policy, providerId, traceId: ctx.traceId });

    if (!adapterMeetsCapabilities(adapter, job.providerRequirements.capabilities)) {
      attempts.push(attemptRecord(providerId, attempt, "failed", "fatal", 0, ctx.now));
      emit(evt.executionFailed(job.id, providerId, ctx.now, "provider lacks required capability"));
      const nxt = advance("fatal", attempt, selection, tried, providerId, retryPolicy);
      if (nxt === null) { finalStatus = "failed"; break; }
      providerId = nxt.providerId;
      if (nxt.fellBack) emit(evt.fallbackStarted(job.id, providerId, ctx.now));
      continue;
    }

    const estimate = adapter.estimateTokens(request);
    const pricing: ProviderPricing = ctx.pricingFor(providerId);
    const estimatedCost = (estimate.inputTokens / 1_000_000) * pricing.inputPerMTokens + (estimate.outputTokens / 1_000_000) * pricing.outputPerMTokens;
    if (projectedExceedsCeiling(priorJobSpend, estimatedCost, job.budget.costCeiling)) {
      finalStatus = "budget_exhausted";
      emit(evt.budgetExhausted(job.id, providerId, ctx.now, "projected spend exceeds hard ceiling"));
      break;
    }

    // ---- execute
    tried.push(providerId);
    emit(evt.executionStarted(job.id, providerId, ctx.now));
    const control: ExecutionControl = { signal, timeoutMs, deadline: job.deadline, now: ctx.now, onProgress: ctx.onProgress };

    let kind: ReasoningFailureKind | null = null;
    let raw: Awaited<ReturnType<ReasoningProviderAdapter["execute"]>> | null = null;
    try {
      raw = await adapter.execute(request, control);
    } catch (err) {
      kind = err instanceof ProviderExecutionError ? err.kind : "fatal";
    }

    if (raw !== null && kind === null) {
      // provider returned — enforce timeout, account, then validate
      if (raw.latencyMs > timeoutMs) {
        kind = "timeout";
        attempts.push(attemptRecord(providerId, attempt, "timed_out", kind, raw.latencyMs, ctx.now));
        emit(evt.executionTimedOut(job.id, providerId, ctx.now, `latency ${raw.latencyMs}ms > ceiling ${timeoutMs}ms`));
      } else {
        const usage = buildUsage(estimate, raw.usage);
        const accounting = buildCostAccounting({ usage, pricing, priorJobSpend, costCeiling: job.budget.costCeiling, softWarningAt });
        if (accounting.softWarning) emit(evt.budgetWarning(job.id, providerId, ctx.now, `job spend ${accounting.jobSpend.toFixed(6)}`));

        if (exceedsHardCeiling(accounting)) {
          finalStatus = "budget_exhausted";
          terminalModel = raw.model;
          emit(evt.budgetExhausted(job.id, providerId, ctx.now, "actual spend exceeded hard ceiling"));
          break;
        }

        const validated = validateExecutionOutput(raw.output, { groundingContext: ctx.groundingContext, parse: ctx.parse });
        priorJobSpend = accounting.jobSpend;
        terminalModel = raw.model;
        terminalResponse = normalizeExecutionResponse({
          jobId: job.id,
          traceId: ctx.traceId,
          providerId,
          status: validated.status,
          output: raw.output,
          validation: validated.validation,
          citations: validated.citations,
          model: raw.model,
          usage,
          cost: accounting,
          latencyMs: raw.latencyMs,
          finishReason: raw.finishReason,
          warnings: raw.warnings ?? [],
          retryable: validated.status === "rejected",
          rawResponseRef: raw.rawResponseRef ?? null,
        });
        attempts.push(attemptRecord(providerId, attempt, validated.status, validated.status === "rejected" ? "validation" : null, raw.latencyMs, ctx.now));

        if (validated.status === "succeeded") {
          finalStatus = "succeeded";
          emit(evt.executionSucceeded(job.id, providerId, ctx.now));
          break;
        }
        // rejected → treat as a validation failure and retry per policy
        kind = "validation";
        emit(evt.outputRejected(job.id, providerId, ctx.now, `${validated.groundingRejections.length} grounding rejection(s)`));
      }
    } else if (kind !== null) {
      // adapter threw — classify + record + emit
      const status = STATUS_FOR_KIND[kind];
      attempts.push(attemptRecord(providerId, attempt, status, kind, 0, ctx.now));
      emitFailure(emit, job.id, providerId, ctx.now, kind);
      if (kind === "cancelled") { finalStatus = "cancelled"; break; }
      if (kind === "budget_exhausted") { finalStatus = "budget_exhausted"; break; }
    }

    // ---- decide the next move (retry same / fallback / stop). kind is set here.
    const decision = decideRetry(kind!, attempt, selection, retryPolicy);
    if (decision === "stop") {
      finalStatus = STATUS_FOR_KIND[kind!];
      break;
    }
    if (decision === "retry_fallback") {
      const nextId = nextFallbackProvider(selection, tried);
      if (nextId === null) { finalStatus = STATUS_FOR_KIND[kind!]; break; } // fallback exhausted
      providerId = nextId;
      emit(evt.fallbackStarted(job.id, providerId, ctx.now));
    }
    // retry_same keeps providerId unchanged
    if (attempt + 1 >= retryPolicy.maxAttempts) finalStatus = STATUS_FOR_KIND[kind!]; // last iteration
  }

  return finalize(job, selection, finalStatus, terminalResponse, attempts, events, ctx.now, terminalModel);
}

/* ---- helpers -------------------------------------------------------------- */

function attemptRecord(providerId: string, attempt: number, status: ExecutionStatus, failureKind: ReasoningFailureKind | null, latencyMs: number, at: string): ExecutionAttempt {
  return { providerId, attempt, status, failureKind, latencyMs, at };
}

function emitFailure(emit: (e: ExecutionEvent) => void, jobId: string, providerId: string, now: string, kind: ReasoningFailureKind): void {
  if (kind === "timeout") emit(evt.executionTimedOut(jobId, providerId, now));
  else if (kind === "cancelled") emit(evt.executionCancelled(jobId, providerId, now));
  else if (kind === "budget_exhausted") emit(evt.budgetExhausted(jobId, providerId, now));
  else emit(evt.executionFailed(jobId, providerId, now, kind));
}

/** Advance to the next provider on a hard per-provider miss (adapter absent / no capability). */
function advance(kind: ReasoningFailureKind, attempt: number, selection: SelectionResult, tried: string[], current: string, policy: RetryPolicy): { providerId: string; fellBack: boolean } | null {
  const decision = decideRetry(isRetryableFailure(kind) ? kind : "retryable", attempt, selection, policy);
  if (decision === "stop") return null;
  const nextId = nextFallbackProvider(selection, [...tried, current]);
  return nextId === null ? null : { providerId: nextId, fellBack: true };
}

function finalize(
  job: ReasoningJob,
  selection: SelectionResult,
  finalStatus: ExecutionStatus,
  response: ExecutionResponse | null,
  attempts: ExecutionAttempt[],
  events: ExecutionEvent[],
  now: string,
  model: ExecutionResponse["model"],
): ExecutionOutcome {
  const validationStatus = finalStatus === "succeeded" ? "passed" : finalStatus === "rejected" || finalStatus === "failed" || finalStatus === "timed_out" ? "failed" : "skipped";
  const provenance = buildResultProvenance({ job, selection, model, startedAt: now, completedAt: now, validationStatus });
  return { jobId: job.id, finalStatus, response, attempts, events, provenance };
}
