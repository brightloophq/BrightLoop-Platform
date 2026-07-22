/* =============================================================================
 * Provider error classification (Phase C · Sprint C2 §7).
 *
 * Maps a sanitized `TransportError` category to the domain's stable
 * `ReasoningFailureKind` + a `FinishReason`, and exposes the finer retry
 * disposition (retryable / non-retryable / fallback-eligible / budget /
 * cancellation / fatal) the sprint enumerates.
 *
 * The coarse `kind` is what the Sprint-7 orchestrator consumes to decide
 * retry-same vs. fallback vs. stop; the richer `ProviderErrorClass` is for
 * telemetry and tests. No raw SDK/API error is ever rethrown across the adapter
 * boundary — only a classified `ProviderExecutionError` (built in the adapter).
 * ========================================================================== */

import type { FinishReason, ReasoningFailureKind } from "@brightloop/schema";
import type { TransportErrorCategory } from "./transport.js";

/** The full disposition of a provider failure. */
export interface ProviderErrorClass {
  category: TransportErrorCategory | "structured_output";
  kind: ReasoningFailureKind;
  finishReason: FinishReason;
  retryable: boolean;
  fallbackEligible: boolean;
  budgetRelated: boolean;
  cancellation: boolean;
  fatal: boolean;
}

const cls = (
  category: ProviderErrorClass["category"],
  kind: ReasoningFailureKind,
  finishReason: FinishReason,
  flags: Partial<Omit<ProviderErrorClass, "category" | "kind" | "finishReason">> = {},
): ProviderErrorClass => ({
  category,
  kind,
  finishReason,
  retryable: flags.retryable ?? false,
  fallbackEligible: flags.fallbackEligible ?? false,
  budgetRelated: flags.budgetRelated ?? false,
  cancellation: flags.cancellation ?? false,
  fatal: flags.fatal ?? false,
});

/**
 * The classification table. Every transport category (plus the adapter-local
 * `structured_output` rejection and `aborted`) maps to exactly one disposition.
 *
 *   · rate_limit / overloaded / server_error / network → retryable + fallback;
 *   · timeout → retryable (the runtime's policy decides whether to re-run);
 *   · aborted → cancellation (NEVER retried — the domain stops on `cancelled`);
 *   · auth / permission / invalid_request / context_too_large / unknown → fatal;
 *   · malformed_response / structured_output → validation (rejected, not promoted).
 */
export function classifyCategory(category: TransportErrorCategory | "structured_output"): ProviderErrorClass {
  switch (category) {
    case "rate_limit":
      return cls("rate_limit", "retryable", "error", { retryable: true, fallbackEligible: true });
    case "overloaded":
      return cls("overloaded", "retryable", "error", { retryable: true, fallbackEligible: true });
    case "server_error":
      return cls("server_error", "retryable", "error", { retryable: true, fallbackEligible: true });
    case "network":
      return cls("network", "retryable", "error", { retryable: true, fallbackEligible: true });
    case "timeout":
      return cls("timeout", "timeout", "timeout", { retryable: true, fallbackEligible: true });
    case "aborted":
      return cls("aborted", "cancelled", "cancelled", { cancellation: true });
    case "authentication":
      return cls("authentication", "fatal", "error", { fatal: true });
    case "permission":
      return cls("permission", "fatal", "error", { fatal: true });
    case "invalid_request":
      return cls("invalid_request", "fatal", "error", { fatal: true });
    case "context_too_large":
      return cls("context_too_large", "fatal", "length", { fatal: true });
    case "malformed_response":
      return cls("malformed_response", "validation", "error");
    case "structured_output":
      return cls("structured_output", "validation", "error");
    case "unknown":
      return cls("unknown", "fatal", "error", { fatal: true });
  }
}
