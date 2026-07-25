/* =============================================================================
 * LIVE Controlled Runtime Driver test (Phase C · Sprint C2.1 §10) — GATED.
 *
 * Runs ONLY when AUXION_RUN_LIVE_PROVIDER_TESTS=true AND a real key + enabled
 * config are present; otherwise it SKIPS explicitly (never passes silently). It
 * is excluded from the default `test` script (only `test:live` includes
 * *.live.test.ts), so CI never spends API credits.
 *
 * It drives exactly ONE real reasoning turn through the driver against the
 * in-memory runtime, proving the end-to-end path: lease → execute (live provider)
 * → persist a SAFE artifact → checkpoint → enqueue one downstream — with a tiny,
 * strictly-capped request. It asserts NO raw content leaked and logs an
 * approximate cost without any secret.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  createRuntimeServices,
  InMemoryRuntimeRepository,
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_SPECS,
  type StageWork,
} from "@brightloop/domain";
import type { PipelineRunStage, RuntimeArtifactKind } from "@brightloop/schema";
import { AnthropicReasoningProviderAdapter } from "../anthropic/adapter.js";
import { loadAnthropicConfig, resolveApiKey } from "../anthropic/config.js";
import { SdkAnthropicTransport } from "../anthropic/transport.js";
import { ControlledRuntimeDriver } from "./driver.js";
import { createDefaultStageRegistry, type ReasoningTelemetry } from "./registry.js";

const GATE = process.env["AUXION_RUN_LIVE_PROVIDER_TESTS"] === "true";
const baseConfig = loadAnthropicConfig(process.env);
const LIVE = GATE && baseConfig.enabled && Boolean(process.env["ANTHROPIC_API_KEY"]);

const START = { clientId: "c1", scanId: "scan-live-1" };
const REASONING_STAGE: PipelineRunStage = "provider_execution";

const referenceExecutor = async (stage: PipelineRunStage): Promise<StageWork> => {
  const kind = PIPELINE_STAGE_SPECS[stage].producesArtifact;
  return kind === null ? { envelope: null, kind: null } : { envelope: { stage, produced: kind }, kind: kind as RuntimeArtifactKind };
};

describe.skipIf(!LIVE)("ControlledRuntimeDriver (LIVE)", () => {
  it("drives one real reasoning turn end to end, persisting only safe metadata", async () => {
    const now = () => new Date().toISOString();
    let counter = 0;
    const ids = (p: string) => `${p}_${++counter}`;
    const repo = new InMemoryRuntimeRepository(now);
    const svc = createRuntimeServices({ repo, ids, clock: now });

    // Strict, cheap request: tiny output cap + short timeout.
    const config = { ...baseConfig, maxOutputTokens: 128, defaultTimeoutMs: 20_000 };
    const apiKey = resolveApiKey(config)!;
    const transport = new SdkAnthropicTransport({ apiKey, baseUrl: config.baseUrl, apiVersion: config.apiVersion, model: config.model });
    const adapter = new AnthropicReasoningProviderAdapter({ config, transport });

    const telemetry: { current: ReasoningTelemetry | null } = { current: null };
    const registry = createDefaultStageRegistry({
      config, adapter, runtime: svc, now: now(), traceId: "live-trace", ids,
      onReasoning: (t) => { telemetry.current = t; },
    });
    const driver = new ControlledRuntimeDriver({ services: svc, registry, reasoningProviderId: config.providerId, ids, now, telemetry });

    // Seed the queue up to the reasoning stage with the reference executor.
    const init = await svc.coordinator.initializeRun(START);
    expect(init.ok).toBe(true);
    const turns = PIPELINE_STAGE_ORDER.indexOf(REASONING_STAGE);
    for (let i = 0; i < turns; i += 1) {
      const t = await svc.coordinator.runOnce("seed", referenceExecutor);
      expect(t.ok).toBe(true);
    }

    const result = await driver.runQueueTurn();

    expect(result.stage).toBe(REASONING_STAGE);
    expect(["advanced", "completed"]).toContain(result.outcome);
    expect(result.artifactIds).toHaveLength(1);
    expect(result.checkpointId).not.toBeNull();

    // no raw content in any artifact envelope or event
    const artifact = repo.allArtifacts().find((a) => a.kind === "execution_outcomes")!;
    expect(Object.keys(artifact.envelope).sort()).toEqual(["attempts", "enrichment", "finalStatus", "kind", "model", "providerId", "validationStatus"]);

    const inTok = result.usage?.inputTokens ?? 0;
    const outTok = result.usage?.outputTokens ?? 0;
    const approxCost = (inTok / 1e6) * config.cost.inputPerMTokens + (outTok / 1e6) * config.cost.outputPerMTokens;
    console.log(`[live] driver turn approx cost ~$${approxCost.toFixed(6)} (in=${inTok}, out=${outTok}, model=${config.model})`);
  });
});
