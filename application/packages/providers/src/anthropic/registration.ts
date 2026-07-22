/* =============================================================================
 * Provider registration (Phase C · Sprint C2 §11/§12).
 *
 * Env-safe construction of the Anthropic adapter for the composition root. The
 * rules:
 *   · disabled by default — returns null unless BOTH switches are on;
 *   · never constructs the SDK client (via the transport) while disabled;
 *   · a missing key while enabled throws a clear error (from `resolveApiKey`);
 *   · importing this module never crashes when env vars are absent;
 *   · a test may inject its own transport and its own adapter set.
 *
 * The domain never imports this — it depends only on the adapter interface. The
 * concrete wiring happens at the app/server composition root.
 * ========================================================================== */

import type { ReasoningProviderAdapter } from "@brightloop/domain";
import { AnthropicReasoningProviderAdapter } from "./adapter.js";
import { loadAnthropicConfig, resolveApiKey, type AnthropicConfig } from "./config.js";
import { SdkAnthropicTransport, type AnthropicTransport } from "./transport.js";

export interface CreateAnthropicAdapterOptions {
  /** Override the env-resolved config (tests / non-process configuration). */
  config?: AnthropicConfig;
  /** Inject a transport (tests) instead of constructing the real SDK client. */
  transport?: AnthropicTransport;
  /** The environment to read from; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

/**
 * Construct the Anthropic adapter, or return null when the provider is disabled.
 *
 * Returning null is the intended disabled state — the caller simply omits it from
 * the registry, and routing never sees it. No SDK client is created while
 * disabled; a real transport (and thus the SDK client with the API key) is only
 * constructed when enabled and a test transport was not injected.
 */
export function createAnthropicAdapter(options: CreateAnthropicAdapterOptions = {}): ReasoningProviderAdapter | null {
  const config = options.config ?? loadAnthropicConfig(options.env);
  if (!config.enabled) return null;

  // The enabled-requires-key rule (throws with no secret) runs where the real
  // SDK client is built. An injected transport IS the client, so it bypasses key
  // resolution — that is how a test constructs the adapter without a live key.
  const transport = options.transport ?? buildRealTransport(config, options.env);

  return new AnthropicReasoningProviderAdapter({ config, transport });
}

/** Construct the real SDK-backed transport, enforcing the enabled-requires-key gate. */
function buildRealTransport(config: AnthropicConfig, env?: Record<string, string | undefined>): AnthropicTransport {
  const apiKey = resolveApiKey(config, env); // throws (no secret) when enabled and absent
  return new SdkAnthropicTransport({
    apiKey: apiKey!, // non-null: resolveApiKey throws when enabled and the key is missing
    baseUrl: config.baseUrl,
    apiVersion: config.apiVersion,
    model: config.model,
  });
}

/**
 * Build the provider registry (opaque id → adapter). The Anthropic adapter is
 * included only when enabled; other adapters (e.g. the in-memory test double)
 * are merged in via `extra` so they coexist. Tests can pass their own full set.
 */
export function buildProviderRegistry(
  options: CreateAnthropicAdapterOptions = {},
  extra: ReadonlyMap<string, ReasoningProviderAdapter> = new Map(),
): Map<string, ReasoningProviderAdapter> {
  const registry = new Map<string, ReasoningProviderAdapter>(extra);
  const anthropic = createAnthropicAdapter(options);
  if (anthropic !== null) registry.set(anthropic.providerId, anthropic);
  return registry;
}
