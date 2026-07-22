/* =============================================================================
 * Anthropic provider configuration (Phase C · Sprint C2 §1/§12).
 *
 * Typed configuration + environment loading + the two kill switches. The rules
 * are strict and safety-first:
 *
 *   · nothing enables live AI by default — both switches default OFF;
 *   · a missing API key is fine while DISABLED (startup must not crash);
 *   · a missing API key while ENABLED fails clearly (never a silent no-op);
 *   · the API key is NEVER logged, returned in errors, or placed in a DTO —
 *     `AnthropicConfig` deliberately does not carry the key; it is resolved
 *     separately and handed straight to the SDK client.
 *
 * No `NEXT_PUBLIC_` variables are read here — this is server/app environment
 * only, so the key can never reach a client bundle.
 * ========================================================================== */

/** Opaque provider id — domain code never branches on the vendor name. */
export const DEFAULT_ANTHROPIC_PROVIDER_ID = "anthropic-primary";

/** Default model. `claude-opus-4-8` is Anthropic's current most-capable Opus. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_INPUT_TOKENS = 180_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
export const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 5_000;
export const DEFAULT_REQUEST_CONCURRENCY = 2;

/** Per-1M-token pricing metadata (drives cost inputs — NOT a pricing engine). */
export interface AnthropicCostMetadata {
  inputPerMTokens: number;
  outputPerMTokens: number;
}

/** An optional retry-policy override the composition root may pass to the runtime. */
export interface AnthropicRetryPolicyOverride {
  maxAttempts?: number;
  allowProviderFallback?: boolean;
}

/**
 * The resolved, non-secret provider configuration. It carries everything the
 * adapter needs EXCEPT the API key, which is resolved separately so it cannot
 * leak into a serialized config, a log line, or a snapshot.
 */
export interface AnthropicConfig {
  providerId: string;
  baseUrl: string;
  model: string;
  apiVersion: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  defaultTimeoutMs: number;
  region: string | null;
  /** True only when BOTH the global and the provider switch are on. */
  enabled: boolean;
  environment: string;
  cost: AnthropicCostMetadata;
  requestConcurrency: number;
  retryPolicyOverride: AnthropicRetryPolicyOverride | null;
  structuredOutputSupport: boolean;
  healthCheckTimeoutMs: number;
}

/** Thrown when the provider is enabled but its API key is absent. Carries no secret. */
export class AnthropicConfigError extends Error {
  readonly code: "missing_api_key" | "invalid_config";
  constructor(code: "missing_api_key" | "invalid_config", message: string) {
    super(message);
    this.name = "AnthropicConfigError";
    this.code = code;
  }
}

type Env = Record<string, string | undefined>;

const isTrue = (v: string | undefined): boolean => v === "true" || v === "1";

function intFrom(v: string | undefined, fallback: number, field: string): number {
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AnthropicConfigError("invalid_config", `${field} must be a positive integer`);
  }
  return n;
}

/**
 * Resolve the provider configuration from the environment.
 *
 * `enabled` requires BOTH `AUXION_LIVE_AI_ENABLED` AND `AUXION_ANTHROPIC_ENABLED`
 * to be truthy — either switch, off, disables the provider. This never reads the
 * API key and never throws for a missing key: a disabled provider is a valid,
 * startup-safe state.
 */
export function loadAnthropicConfig(env: Env = process.env): AnthropicConfig {
  const enabled = isTrue(env["AUXION_LIVE_AI_ENABLED"]) && isTrue(env["AUXION_ANTHROPIC_ENABLED"]);
  const cost: AnthropicCostMetadata = {
    inputPerMTokens: Number.parseFloat(env["AUXION_ANTHROPIC_INPUT_PER_MTOKENS"] ?? "5"),
    outputPerMTokens: Number.parseFloat(env["AUXION_ANTHROPIC_OUTPUT_PER_MTOKENS"] ?? "25"),
  };

  return {
    providerId: env["AUXION_ANTHROPIC_PROVIDER_ID"] ?? DEFAULT_ANTHROPIC_PROVIDER_ID,
    baseUrl: env["AUXION_ANTHROPIC_BASE_URL"] ?? DEFAULT_ANTHROPIC_BASE_URL,
    model: env["AUXION_ANTHROPIC_MODEL"] ?? DEFAULT_ANTHROPIC_MODEL,
    apiVersion: env["AUXION_ANTHROPIC_API_VERSION"] ?? "2023-06-01",
    maxInputTokens: intFrom(env["AUXION_ANTHROPIC_MAX_INPUT_TOKENS"], DEFAULT_MAX_INPUT_TOKENS, "AUXION_ANTHROPIC_MAX_INPUT_TOKENS"),
    maxOutputTokens: intFrom(env["AUXION_ANTHROPIC_MAX_OUTPUT_TOKENS"], DEFAULT_MAX_OUTPUT_TOKENS, "AUXION_ANTHROPIC_MAX_OUTPUT_TOKENS"),
    defaultTimeoutMs: intFrom(env["AUXION_ANTHROPIC_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS, "AUXION_ANTHROPIC_TIMEOUT_MS"),
    region: env["AUXION_ANTHROPIC_REGION"] ?? null,
    enabled,
    environment: env["AUXION_ENVIRONMENT"] ?? env["NODE_ENV"] ?? "development",
    cost,
    requestConcurrency: intFrom(env["AUXION_ANTHROPIC_CONCURRENCY"], DEFAULT_REQUEST_CONCURRENCY, "AUXION_ANTHROPIC_CONCURRENCY"),
    retryPolicyOverride: null,
    structuredOutputSupport: true,
    healthCheckTimeoutMs: intFrom(env["AUXION_ANTHROPIC_HEALTHCHECK_TIMEOUT_MS"], DEFAULT_HEALTH_CHECK_TIMEOUT_MS, "AUXION_ANTHROPIC_HEALTHCHECK_TIMEOUT_MS"),
  };
}

/**
 * Resolve the API key, enforcing the enabled-requires-key rule.
 *
 * · disabled → returns null (no key needed; the adapter is never constructed);
 * · enabled + key present → returns the key (handed straight to the SDK);
 * · enabled + key absent → throws `AnthropicConfigError` with NO secret in it.
 *
 * The returned value is the raw key — callers pass it only to the SDK client and
 * never log, serialize, or embed it anywhere.
 */
export function resolveApiKey(config: AnthropicConfig, env: Env = process.env): string | null {
  const key = env["ANTHROPIC_API_KEY"];
  if (!config.enabled) return null;
  if (key === undefined || key.trim() === "") {
    throw new AnthropicConfigError(
      "missing_api_key",
      "Anthropic provider is enabled but ANTHROPIC_API_KEY is not set. Set the key, or disable the provider with AUXION_ANTHROPIC_ENABLED=false / AUXION_LIVE_AI_ENABLED=false.",
    );
  }
  return key;
}

/** A stable reason code for a disabled-provider outcome (§12). */
export const PROVIDER_DISABLED_REASON = "provider_disabled" as const;
