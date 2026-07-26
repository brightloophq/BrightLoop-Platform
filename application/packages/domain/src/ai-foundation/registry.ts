/* =============================================================================
 * Model registry (Phase E · Sprint E1) — PURE.
 *
 * The canonical, provider-agnostic catalogue of models: context window, feature
 * support, and per-1M-token pricing. Pricing here is registry metadata (a
 * `pricingVersion` stamps every cost record); business code reads capabilities,
 * never provider SDKs. Deterministic; no io.
 * ========================================================================== */

import type { AiModelCapability, AiModelDescriptor, AiProviderKind } from "@brightloop/schema";

/** Bump when any descriptor's pricing changes; stamped onto every CostRecord. */
export const PRICING_VERSION = "e1-2026-07";

const d = (
  id: string,
  provider: AiProviderKind,
  family: string,
  contextWindow: number,
  caps: Partial<Record<"streaming" | "json" | "tools" | "vision" | "audio", boolean>>,
  inputPricePerMTok: number,
  outputPricePerMTok: number,
  cachedInputPricePerMTok = 0,
): AiModelDescriptor => ({
  id, provider, family, contextWindow,
  supportsStreaming: caps.streaming ?? true,
  supportsJson: caps.json ?? true,
  supportsTools: caps.tools ?? true,
  supportsVision: caps.vision ?? false,
  supportsAudio: caps.audio ?? false,
  inputPricePerMTok, outputPricePerMTok, cachedInputPricePerMTok,
  currency: "USD", available: true,
});

/** The seed registry. Additive — new models append; existing ids are stable. */
export const MODEL_REGISTRY: readonly AiModelDescriptor[] = [
  // Anthropic
  d("claude-opus-4-8", "anthropic", "claude", 200_000, { vision: true }, 15, 75, 1.5),
  d("claude-sonnet-5", "anthropic", "claude", 200_000, { vision: true }, 3, 15, 0.3),
  d("claude-haiku-4-5-20251001", "anthropic", "claude", 200_000, { vision: true }, 0.8, 4, 0.08),
  // OpenAI
  d("gpt-5", "openai", "gpt", 256_000, { vision: true }, 5, 20, 0.5),
  d("gpt-5-mini", "openai", "gpt", 128_000, { vision: true }, 0.6, 2.4, 0.06),
  // Google
  d("gemini-2.5-pro", "google", "gemini", 1_000_000, { vision: true, audio: true }, 2.5, 10, 0.25),
  d("gemini-2.5-flash", "google", "gemini", 1_000_000, { vision: true, audio: true }, 0.3, 1.2, 0.03),
];

const BY_ID = new Map<string, AiModelDescriptor>(MODEL_REGISTRY.map((m) => [m.id, m]));

/** Look up a model descriptor by id, or null. Pure. */
export function findModel(modelId: string): AiModelDescriptor | null {
  return BY_ID.get(modelId) ?? null;
}

/** Every available model for a provider. Pure. */
export function modelsForProvider(provider: AiProviderKind): AiModelDescriptor[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider && m.available);
}

/** Does a model support a capability? Unknown model → false. Pure. */
export function modelSupports(modelId: string, capability: AiModelCapability): boolean {
  const m = BY_ID.get(modelId);
  if (m === undefined) return false;
  switch (capability) {
    case "streaming": return m.supportsStreaming;
    case "json": return m.supportsJson;
    case "tools": return m.supportsTools;
    case "vision": return m.supportsVision;
    case "audio": return m.supportsAudio;
  }
}
