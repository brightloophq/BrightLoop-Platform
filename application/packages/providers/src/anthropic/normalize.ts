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

/** Thrown when the provider body is not the required single JSON object. */
export class MalformedOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedOutputError";
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
    throw new MalformedOutputError("provider response was not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MalformedOutputError("provider response was not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export interface NormalizeInput {
  result: TransportResult;
  providerId: string;
}

/* ============================================================================
 * ██ TEMPORARY PRODUCTION DIAGNOSTIC — MUST BE REMOVED AFTER ONE RUN ██
 * [AUXION_REASONING_DIAGNOSTIC]
 *
 * Server-only, behaviour-NEUTRAL instrumentation to inspect ONE Anthropic response
 * body and identify why `parseJsonObject` rejects it. GATED by the env flag
 * `AUXION_REASONING_DIAGNOSTIC === "true"` (default false → entirely inert: no
 * excerpt is generated and no log is emitted, identical to main). When enabled, it
 * performs an INDEPENDENT trial parse purely for logging and does NOT touch the
 * real parse/validation/retry path below. Body excerpts are bounded (500 head +
 * 500 tail) and redacted for obvious PII/secrets. Raw text is written ONLY to the
 * server console — never persisted, never returned, never sent to the browser.
 * DELETE this block, its one call site, and the env flag immediately after the
 * single diagnostic run.
 * ========================================================================== */
const DIAG_TAG = "[AUXION_REASONING_DIAGNOSTIC]";

function diagRedact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    .replace(/\b(?:\+?\d[\s().-]?){7,}\d\b/g, "[redacted-phone]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/("?(?:api[_-]?key|authorization|cookie|secret|token|password|service[_-]?role)"?\s*[:=]\s*)"?[^\s",}]+/gi, "$1[redacted]");
}

/** The one gate. Default false → the diagnostic is entirely inert (no excerpt, no log). */
function reasoningDiagnosticEnabled(): boolean {
  return process.env["AUXION_REASONING_DIAGNOSTIC"] === "true";
}

function logReasoningDiagnostic(result: TransportResult): void {
  // Flag OFF (the default): generate no excerpt and emit no log — identical to main.
  if (!reasoningDiagnosticEnabled()) return;
  const trimmed = result.text.trim();
  const fenced = trimmed.startsWith("```");
  const unfenced = fenced ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim() : trimmed;
  let jsonParseSucceeded = false;
  let parsedType = "none";
  let parseErrorName: string | null = null;
  let parseErrorMessage: string | null = null;
  try {
    const p: unknown = JSON.parse(unfenced);
    jsonParseSucceeded = true;
    parsedType = p === null ? "null" : Array.isArray(p) ? "array" : typeof p;
  } catch (e) {
    parseErrorName = e instanceof Error ? e.name : "Error";
    parseErrorMessage = e instanceof Error ? e.message : String(e);
  }
  const text = result.text;
  console.warn(
    DIAG_TAG,
    JSON.stringify({
      model: result.model,
      providerResponseReceived: true,
      stopReason: result.stopReason,
      responseCharLength: text.length,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      latencyMs: result.latencyMs,
      fencedMarkdownDetected: fenced,
      jsonParseSucceeded,
      parsedType,
      parseErrorName,
      parseErrorMessage,
      bodyHead500: diagRedact(text.slice(0, 500)),
      bodyTail500: text.length > 500 ? diagRedact(text.slice(-500)) : "",
    }),
  );
}
/* ████ END TEMPORARY DIAGNOSTIC ████ */

/**
 * Normalize a successful transport result. Throws `MalformedOutputError` when the
 * body is not a JSON object. Usage is passed through verbatim — when the provider
 * omits it (never expected from Anthropic, but modelled), the empty usage triggers
 * the Sprint-7 estimated-usage fallback.
 */
export function normalizeResponse(input: NormalizeInput): RawProviderOutput {
  const { result, providerId } = input;
  logReasoningDiagnostic(result); // ██ TEMPORARY PROD DIAGNOSTIC (flag-gated) — REMOVE AFTER ONE RUN ██ [AUXION_REASONING_DIAGNOSTIC]
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
