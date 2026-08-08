/* =============================================================================
 * Response normalization (Phase C · Sprint C2 §6).
 *
 * Turn a `TransportResult` into the canonical, UNTRUSTED `RawProviderOutput` the
 * Sprint-7 orchestrator validates. This layer parses the JSON body and maps the
 * provider's metadata; it does NOT validate grounding, citations, or the schema
 * — that is the domain's job.
 *
 * RAW MODEL OUTPUT IS NEVER PERSISTED. `rawResponseRef` carries only the provider
 * request id (a safe pointer); the parsed `output` flows onward to validation but
 * the transport's raw response object never leaves the adapter.
 * ========================================================================== */

import type { FinishReason, ModelMetadata } from "@brightloop/schema";
import type { RawProviderOutput } from "@brightloop/domain";
import type { TransportResult } from "./transport.js";

/** How the parser resolved a malformed body — safe classification, never content. */
export type ParserOutcome = "invalid_json" | "non_object_json";

/** Thrown when the provider body is not the required single JSON object. */
export class MalformedOutputError extends Error {
  readonly parserOutcome: ParserOutcome;
  constructor(message: string, parserOutcome: ParserOutcome) {
    super(message);
    this.name = "MalformedOutputError";
    this.parserOutcome = parserOutcome;
  }
}

/** Map Anthropic's `stop_reason` to the normalized `FinishReason`. */
export function toFinishReason(stopReason: string | null): FinishReason {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
    case "pause_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "refusal":
      return "content_filter";
    default:
      return "stop";
  }
}

/**
 * Parse the provider body into a JSON object. Tolerates a single ```json fence
 * (defensive — the prompt forbids it) but nothing else; a non-object or
 * unparseable body throws `MalformedOutputError`, which the adapter classifies as
 * a provider-output failure so it is rejected, never promoted.
 */
export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"").trim()
    : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new MalformedOutputError("provider response was not valid JSON", "invalid_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MalformedOutputError("provider response was not a JSON object", "non_object_json");
  }
  return parsed as Record<string, unknown>;
}

export interface NormalizeInput {
  result: TransportResult;
  providerId: string;
}

/**
 * Normalize a successful transport result. Throws `MalformedOutputError` when the
 * body is not a JSON object. Usage is passed through verbatim — when the provider
 * omits it (never expected from Anthropic, but modelled), the empty usage triggers
 * the Sprint-7 estimated-usage fallback.
 */
export function normalizeResponse(input: NormalizeInput): RawProviderOutput {
  const { result, providerId } = input;
  const output = parseJsonObject(result.text);

  const warnings: string[] = [];
  if (result.stopReason === "max_tokens") warnings.push("provider stopped at max_tokens; output may be truncated");
  if (result.stopReason === "refusal") warnings.push("provider refused to answer");

  const model: ModelMetadata = { provider: "anthropic", model: result.model, version: null };

  return {
    output,
    finishReason: toFinishReason(result.stopReason),
    usage: {
      ...(result.usage.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}),
      ...(result.usage.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
    },
    latencyMs: result.latencyMs,
    model,
    ...(warnings.length > 0 ? { warnings } : {}),
    // Safe pointer only — never the raw content. Null when the provider gave no id.
    ...(result.requestId !== null ? { rawResponseRef: `anthropic:${providerId}:${result.requestId}` } : {}),
  };
}
