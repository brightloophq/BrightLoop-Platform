import "server-only";

import {
  ControlledRuntimeDriver,
  createDefaultStageRegistry,
  loadAnthropicConfig,
  buildProviderRegistry,
  type ReasoningTelemetry,
} from "@brightloop/providers";
import { getRuntimeServices } from "./repositories";

/**
 * Controlled Runtime Driver composition root (Phase C · Sprint C2.1 §2).
 *
 * The ONLY place the app assembles the one-turn driver. `server-only` keeps the
 * Anthropic SDK and key resolution out of any client bundle. The driver leases at
 * most one job, executes at most one stage, and returns — it is NOT a worker,
 * daemon, cron, or loop, and nothing here starts one.
 *
 * Live reasoning is gated by `loadAnthropicConfig().enabled`
 * (AUXION_LIVE_AI_ENABLED && AUXION_ANTHROPIC_ENABLED && a key). When disabled —
 * the default — the provider registry is empty, the reasoning adapter is null,
 * and the reasoning stage blocks with a stable `provider_disabled` reason. No
 * SDK client is constructed and no credit is spent.
 */

/** Prefixed-id generator injected into the driver (mirrors the app convention). */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a request-scoped driver bound to the caller's RLS session. Each call
 * gets its own runtime services and telemetry holder — no shared mutable state
 * across requests.
 */
export async function buildRuntimeDriver(): Promise<ControlledRuntimeDriver> {
  const config = loadAnthropicConfig();
  const runtime = await getRuntimeServices();

  // Reasoning adapter only when live AI is enabled; null blocks the stage safely.
  const registry = buildProviderRegistry();
  const adapter = config.enabled ? registry.get(config.providerId) ?? null : null;

  // One telemetry holder wired into both the stage registry (writer) and the
  // driver (reader), so safe reasoning metadata reaches the result.
  const telemetry: { current: ReasoningTelemetry | null } = { current: null };

  const stageRegistry = createDefaultStageRegistry({
    config,
    adapter,
    runtime,
    now: new Date().toISOString(),
    traceId: newId("trace"),
    ids: newId,
    onReasoning: (t) => {
      telemetry.current = t;
    },
  });

  return new ControlledRuntimeDriver({
    services: runtime,
    registry: stageRegistry,
    reasoningProviderId: config.providerId,
    ids: newId,
    now: () => new Date().toISOString(),
    telemetry,
  });
}
