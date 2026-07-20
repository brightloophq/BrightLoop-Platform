/* =============================================================================
 * In-memory deterministic provider adapter (Sprint 7 §10) — TEST ONLY.
 *
 * A scripted, side-effect-free `ReasoningProviderAdapter` for exercising the
 * execution orchestrator without any vendor SDK or network. It simulates success,
 * malformed output, transient/fatal failure, timeout, rate limit, cancellation,
 * budget overrun, invalid citations, and unsupported capability. Consumes its
 * script in order (the last step repeats), so multi-attempt flows are reproducible.
 * NOT a production adapter — no real model is ever called.
 * ========================================================================== */

import { ProviderExecutionError, type ExecutionControl, type ProviderHealthReport, type RawProviderOutput, type ReasoningProviderAdapter } from "./contract.js";
import type { ExecutionRequest, ProviderCapability, HealthStatus, TokenEstimate, FinishReason, ModelMetadata, ReasoningFailureKind } from "@brightloop/schema";

/** A scripted step: either throw a classified failure, or return a raw output. */
export interface ScriptedThrow {
  throw: ReasoningFailureKind;
  message?: string;
  finishReason?: FinishReason;
}
export interface ScriptedReturn {
  output: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs?: number;
  finishReason?: FinishReason;
  model?: ModelMetadata;
  warnings?: string[];
  rawResponseRef?: string;
}
export type ScriptedResponse = ScriptedThrow | ScriptedReturn;

export interface InMemoryAdapterConfig {
  providerId: string;
  capabilities?: ProviderCapability[];
  structuredOutput?: boolean;
  health?: HealthStatus;
  tokenEstimate?: TokenEstimate;
  script: ScriptedResponse[];
}

function finishFor(kind: ReasoningFailureKind): FinishReason {
  if (kind === "cancelled") return "cancelled";
  if (kind === "timeout") return "timeout";
  return "error";
}

export class InMemoryReasoningAdapter implements ReasoningProviderAdapter {
  readonly providerId: string;
  private readonly config: InMemoryAdapterConfig;
  private index = 0;

  constructor(config: InMemoryAdapterConfig) {
    this.providerId = config.providerId;
    this.config = config;
  }

  capabilities(): ProviderCapability[] {
    return this.config.capabilities ?? [];
  }

  supportsStructuredOutput(): boolean {
    return this.config.structuredOutput ?? true;
  }

  async healthCheck(): Promise<ProviderHealthReport> {
    return { providerId: this.providerId, status: this.config.health ?? "healthy", detail: null };
  }

  estimateTokens(request: ExecutionRequest): TokenEstimate {
    return this.config.tokenEstimate ?? { inputTokens: request.tokenBudget.inputTokens, outputTokens: request.tokenBudget.outputTokens };
  }

  async execute(_request: ExecutionRequest, control: ExecutionControl): Promise<RawProviderOutput> {
    // cooperative cancellation — honour a token cancelled before/at dispatch
    if (control.signal.cancelled) throw new ProviderExecutionError("cancelled", "cancelled before execute", "cancelled");

    if (this.config.script.length === 0) throw new ProviderExecutionError("fatal", "test adapter has no scripted responses");
    const step = this.config.script[Math.min(this.index, this.config.script.length - 1)]!;
    this.index += 1;

    if ("throw" in step) {
      throw new ProviderExecutionError(step.throw, step.message ?? step.throw, step.finishReason ?? finishFor(step.throw));
    }
    return {
      output: step.output,
      finishReason: step.finishReason ?? "stop",
      usage: step.usage ?? {},
      latencyMs: step.latencyMs ?? 10,
      model: step.model ?? { provider: this.providerId, model: "test-model", version: "1" },
      warnings: step.warnings,
      rawResponseRef: step.rawResponseRef ?? "raw-ref",
    };
  }
}
