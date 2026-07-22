import "server-only";

import type { ReasoningProviderAdapter } from "@brightloop/domain";
import {
  buildProviderRegistry,
  loadAnthropicConfig,
  runControlledReasoning,
  type ControlledReasoningInput,
} from "@brightloop/providers";
import { getRuntimeServices } from "./repositories";

/**
 * Reasoning-provider composition root (Phase C · Sprint C2 §11/§13).
 *
 * The ONLY place the app names a live AI provider. `server-only` makes a
 * client-component import a build error, so the Anthropic SDK and the API-key
 * resolution can never reach the browser bundle.
 *
 * Disabled by default: with `AUXION_LIVE_AI_ENABLED`/`AUXION_ANTHROPIC_ENABLED`
 * off (the default), the registry is empty and no SDK client is constructed. No
 * route consumes this yet — the controlled path below is an explicit, server-side
 * entry point, not a public endpoint.
 */

/** The provider registry for the reasoning orchestrator (empty when disabled). */
export function getReasoningProviderRegistry(): Map<string, ReasoningProviderAdapter> {
  return buildProviderRegistry();
}

/** A prefixed-id generator for controlled runs (mirrors the app convention). */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The one controlled reasoning path (§13): route one job to Anthropic, execute
 * through the existing orchestrator, validate, and record the provider attempt
 * through the Phase-B runtime. Throws when the provider is disabled — this is a
 * deliberate, credit-spending server action, never wired to a route.
 */
export async function runControlledScanReasoning(input: ControlledReasoningInput) {
  const config = loadAnthropicConfig();
  const registry = getReasoningProviderRegistry();
  const adapter = registry.get(config.providerId);
  if (adapter === undefined) {
    throw new Error("Anthropic provider is disabled — enable AUXION_LIVE_AI_ENABLED and AUXION_ANTHROPIC_ENABLED with a key.");
  }
  const runtime = await getRuntimeServices();
  return runControlledReasoning(input, {
    config,
    adapter,
    now: new Date().toISOString(),
    traceId: newId("trace"),
    ids: newId,
    runtime,
  });
}
