/* =============================================================================
 * AI provider PORT (Phase E · Sprint E1).
 *
 * The single seam between the AI Foundation and any concrete LLM SDK. EVERY
 * provider (Anthropic / OpenAI / Google) implements this identical contract, so
 * business code never knows which one runs. No provider-specific type leaks
 * through here. Adapters live in `@brightloop/data`; a deterministic mock adapter
 * backs tests and local dev with no network.
 * ========================================================================== */

import type { AiHealthStatus, AiModelDescriptor, AiProviderKind, ConversationRole, ExecutionMode } from "@brightloop/schema";

/** One chat message in a provider-agnostic request. */
export interface AiMessage {
  role: ConversationRole;
  content: string;
}

/** A single execution request. `jsonSchema` (when set) asks for structured output. */
export interface AiCompletionRequest {
  mode: ExecutionMode;
  model: string;
  system: string;
  messages: AiMessage[];
  temperature: number;
  maxTokens: number;
  /** JSON Schema for structured output, or null for free text. */
  jsonSchema: Record<string, unknown> | null;
}

/** Token usage a provider reports back. */
export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

/** A successful completion. */
export interface AiCompletion {
  content: string;
  usage: AiUsage;
  finishReason: string;
}

/** Why a provider call failed — drives retry + failover decisions. */
export type AiFailureReason = "network" | "timeout" | "rate_limit" | "provider_unavailable" | "malformed_output" | "invalid_request";

/** The provider's discriminated outcome — never throws for expected failures. */
export type AiExecuteOutcome =
  | { ok: true; value: AiCompletion }
  | { ok: false; reason: AiFailureReason; message: string; retryable: boolean };

/** A streamed chunk. Provider-independent; the app assembles these. */
export type AiStreamChunk =
  | { type: "text"; delta: string }
  | { type: "done"; usage: AiUsage; finishReason: string }
  | { type: "error"; reason: AiFailureReason; message: string };

/**
 * The provider contract. `execute`/`stream` are io; `countTokens`/`estimateCost`/
 * `supportedModels` are pure; `health` is a cheap probe.
 */
export interface AiProviderPort {
  readonly kind: AiProviderKind;
  execute(request: AiCompletionRequest): Promise<AiExecuteOutcome>;
  stream(request: AiCompletionRequest): AsyncIterable<AiStreamChunk>;
  /** Deterministic token estimate for a piece of text. */
  countTokens(text: string): number;
  /** Estimated cost in the model's currency for a given usage. */
  estimateCost(usage: AiUsage, model: string): number;
  health(): Promise<AiHealthStatus>;
  supportedModels(): AiModelDescriptor[];
}

/** A set of providers keyed by kind — the registry the execution engine uses. */
export type AiProviderRegistry = Partial<Record<AiProviderKind, AiProviderPort>>;
