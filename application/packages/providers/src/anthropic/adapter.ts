/* =============================================================================
 * AnthropicReasoningProviderAdapter (Phase C · Sprint C2 §3/§8/§9/§10/§12).
 *
 * The first production `ReasoningProviderAdapter`. It satisfies the Sprint-7 seam
 * exactly and is transport + normalization ONLY — no grounding, no scoring, no
 * business logic. Its provider id is opaque, so domain code never learns the
 * vendor.
 *
 * CANCELLATION / TIMEOUT (§8): one `AbortController` drives the in-flight request.
 * The FIRST terminal source wins and is recorded, so timeout, user cancellation,
 * and deadline are distinguishable. A user cancellation is classified `cancelled`
 * (never retried); a timeout is classified `timeout` (retryable per policy). The
 * request promise is always awaited in a try/finally that clears every timer —
 * no orphaned promise, no leaked interval.
 *
 * KILL SWITCH (§12): a disabled adapter is normally never constructed, but if
 * asked to execute it fails fast with a stable reason and makes NO outbound call.
 * ========================================================================== */

import {
  ProviderExecutionError,
  type ExecutionControl,
  type ProviderHealthReport,
  type RawProviderOutput,
  type ReasoningProviderAdapter,
} from "@brightloop/domain";
import type { ExecutionRequest, HealthStatus, ProviderCapability, TokenEstimate } from "@brightloop/schema";
import type { AnthropicConfig } from "./config.js";
import { classifyCategory } from "./errors.js";
import { MalformedOutputError, normalizeResponse } from "./normalize.js";
import { translateRequest } from "./prompt.js";
import { TransportError, type AnthropicTransport } from "./transport.js";

/** Why the adapter aborted the in-flight request — the first source wins. */
type AbortReason = "timeout" | "user" | "system" | "deadline";

export interface AnthropicAdapterDeps {
  config: AnthropicConfig;
  transport: AnthropicTransport;
  /** Injected clock (ms) — defaults to Date.now; overridden in tests for determinism. */
  nowMs?: () => number;
  /** Poll interval for cooperative cancellation of an in-flight request. */
  pollMs?: number;
}

export class AnthropicReasoningProviderAdapter implements ReasoningProviderAdapter {
  readonly providerId: string;
  private readonly config: AnthropicConfig;
  private readonly transport: AnthropicTransport;
  private readonly nowMs: () => number;
  private readonly pollMs: number;

  constructor(deps: AnthropicAdapterDeps) {
    this.config = deps.config;
    this.transport = deps.transport;
    this.providerId = deps.config.providerId;
    this.nowMs = deps.nowMs ?? (() => Date.now());
    this.pollMs = deps.pollMs ?? 50;
  }

  capabilities(): ProviderCapability[] {
    // Claude supports structured (prompt-enforced JSON) output and long context.
    return ["structured_output", "long_context"];
  }

  supportsStructuredOutput(): boolean {
    return this.config.structuredOutputSupport;
  }

  async healthCheck(): Promise<ProviderHealthReport> {
    if (!this.config.enabled) {
      return { providerId: this.providerId, status: "unavailable", detail: "provider disabled" };
    }
    const probe = await this.transport.health(this.config.healthCheckTimeoutMs);
    if (probe.ok) return { providerId: this.providerId, status: "healthy", detail: null };
    const status: HealthStatus = probe.category === "rate_limit"
      ? "rate_limited"
      : probe.category === "authentication" || probe.category === "permission"
        ? "unavailable"
        : "degraded";
    return { providerId: this.providerId, status, detail: probe.category };
  }

  /**
   * Deterministic token estimate — cheap heuristic (~4 chars/token) over the
   * translated prompt for input, and the job's requested output budget capped by
   * the configured ceiling for output. Feeds the runtime's cost inputs; the
   * provider's ACTUAL usage overrides it after a call.
   */
  estimateTokens(request: ExecutionRequest): TokenEstimate {
    const { system, userContent } = translateRequest(request);
    const inputTokens = Math.min(this.config.maxInputTokens, Math.ceil((system.length + userContent.length) / 4) + 16);
    const outputTokens = Math.min(this.config.maxOutputTokens, Math.max(1, request.tokenBudget.outputTokens));
    return { inputTokens, outputTokens };
  }

  async execute(request: ExecutionRequest, control: ExecutionControl): Promise<RawProviderOutput> {
    // §12 — kill switch: no outbound request when disabled.
    if (!this.config.enabled) {
      throw new ProviderExecutionError("fatal", "anthropic provider disabled", "error");
    }
    // §8 — a token already cancelled at/ before dispatch stops us immediately.
    if (control.signal.cancelled) {
      throw new ProviderExecutionError("cancelled", "cancelled before dispatch", "cancelled");
    }
    // Deadline already past → treat as cancelled-by-deadline (no call made).
    if (control.deadline !== null && control.now >= control.deadline) {
      throw new ProviderExecutionError("cancelled", "deadline exceeded before dispatch", "cancelled");
    }

    const { system, userContent } = translateRequest(request);
    const controller = new AbortController();
    let abortReason: AbortReason | null = null;
    const abortOnce = (reason: AbortReason) => {
      if (abortReason !== null) return; // first source wins
      abortReason = reason;
      controller.abort();
    };

    const effectiveTimeout = Math.min(control.timeoutMs, this.config.defaultTimeoutMs);
    const timeoutTimer = setTimeout(() => abortOnce("timeout"), effectiveTimeout);
    // Cooperative poll: the domain token is poll-only, so watch it (and the
    // absolute deadline) and abort as soon as either fires.
    const pollTimer = setInterval(() => {
      if (control.signal.cancelled) abortOnce(control.signal.source === "user" ? "user" : "system");
      else if (control.deadline !== null && this.nowMs() >= new Date(control.deadline).getTime()) abortOnce("deadline");
    }, this.pollMs);

    try {
      const result = await this.transport.send({
        model: this.config.model,
        system,
        userContent,
        maxOutputTokens: Math.min(this.config.maxOutputTokens, Math.max(1, request.tokenBudget.outputTokens)),
        timeoutMs: effectiveTimeout,
        signal: controller.signal,
        metadata: { traceId: request.traceId },
      });
      // Malformed JSON → validation failure, not a promoted answer (§5).
      try {
        return normalizeResponse({ result, providerId: this.providerId });
      } catch (err) {
        if (err instanceof MalformedOutputError) {
          const c = classifyCategory("malformed_response");
          throw new ProviderExecutionError(c.kind, err.message, c.finishReason);
        }
        throw err;
      }
    } catch (err) {
      if (err instanceof ProviderExecutionError) throw err;
      throw this.classify(err, abortReason);
    } finally {
      clearTimeout(timeoutTimer);
      clearInterval(pollTimer);
    }
  }

  /** Map a transport error (or an abort) to a classified `ProviderExecutionError`. */
  private classify(err: unknown, abortReason: AbortReason | null): ProviderExecutionError {
    if (err instanceof TransportError) {
      // An abort surfaces as category "aborted"; disambiguate by the recorded
      // reason so timeout (retryable) is never confused with user cancellation.
      if (err.category === "aborted" && abortReason !== null) {
        const category = abortReason === "timeout" ? "timeout" : "aborted";
        const c = classifyCategory(category);
        const detail = abortReason === "deadline" ? "deadline exceeded" : abortReason === "timeout" ? "request timed out" : `cancelled by ${abortReason}`;
        return new ProviderExecutionError(c.kind, detail, c.finishReason);
      }
      const c = classifyCategory(err.category);
      return new ProviderExecutionError(c.kind, `provider error: ${err.category}`, c.finishReason);
    }
    // Never rethrow an unknown/raw error across the boundary — classify as fatal.
    const c = classifyCategory("unknown");
    return new ProviderExecutionError(c.kind, "unexpected provider failure", c.finishReason);
  }
}
