/* =============================================================================
 * Deterministic AI provider adapter (Phase E · Sprint E1).
 *
 * A production-safe DEFAULT provider that makes NO network calls — it returns
 * deterministic content + usage derived from the request. It is selected until
 * real SDK adapters (Anthropic/OpenAI/Google) are wired with credentials, exactly
 * mirroring the platform's mock-until-configured pattern for payments and email.
 * Implements the same `AiProviderPort` contract, so swapping in a real adapter is
 * a one-line change with zero business-code impact.
 * ========================================================================== */

import {
  estimateTokens, modelsForProvider,
  type AiCompletionRequest, type AiExecuteOutcome, type AiProviderPort, type AiStreamChunk, type AiUsage,
} from "@brightloop/domain";
import type { AiProviderKind } from "@brightloop/schema";

function usageFor(req: AiCompletionRequest, content: string): AiUsage {
  return { promptTokens: estimateTokens(req.system + req.messages.map((x) => x.content).join("\n")), completionTokens: estimateTokens(content), cachedTokens: 0 };
}

/** Build a deterministic, network-free provider for `kind`. */
export function createDeterministicAiProvider(kind: AiProviderKind): AiProviderPort {
  return {
    kind,
    async execute(req: AiCompletionRequest): Promise<AiExecuteOutcome> {
      const last = req.messages[req.messages.length - 1]?.content ?? "";
      const content = req.jsonSchema ? JSON.stringify({ provider: kind, model: req.model, echo: last }) : `[${kind}:${req.model}] ${last}`;
      return { ok: true, value: { content, usage: usageFor(req, content), finishReason: "stop" } };
    },
    async *stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
      const content = `[${kind}:${req.model}] ${req.messages[req.messages.length - 1]?.content ?? ""}`;
      for (const ch of content.match(/.{1,16}/g) ?? []) yield { type: "text", delta: ch };
      yield { type: "done", usage: usageFor(req, content), finishReason: "stop" };
    },
    countTokens: (text) => estimateTokens(text),
    estimateCost: (usage) => (usage.promptTokens + usage.completionTokens) / 1_000_000,
    health: async () => "healthy",
    supportedModels: () => modelsForProvider(kind),
  };
}
