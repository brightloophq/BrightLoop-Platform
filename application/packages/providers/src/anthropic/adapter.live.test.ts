/* =============================================================================
 * LIVE Anthropic adapter test (Phase C · Sprint C2 §14) — GATED, spends credit.
 *
 * Runs ONLY when AUXION_RUN_LIVE_PROVIDER_TESTS=true AND a real key + enabled
 * config are present. When the gate is absent it SKIPS explicitly (never passes
 * silently). It is excluded from the default `test` script (only `test:live`
 * includes *.live.test.ts), so CI never spends API credits.
 *
 * The request is deliberately tiny: a low output-token cap and a strict timeout,
 * proving the round trip and the guarantees (structured JSON, usage/estimated,
 * provider metadata, no raw content persisted) at minimal cost. It logs an
 * approximate cost WITHOUT any secret.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { newCancellationToken, type ExecutionControl } from "@brightloop/domain";
import type { ExecutionRequest } from "@brightloop/schema";
import { AnthropicReasoningProviderAdapter } from "./adapter.js";
import { loadAnthropicConfig, resolveApiKey } from "./config.js";
import { SdkAnthropicTransport } from "./transport.js";

const GATE = process.env["AUXION_RUN_LIVE_PROVIDER_TESTS"] === "true";
const config = loadAnthropicConfig(process.env);
const LIVE = GATE && config.enabled && Boolean(process.env["ANTHROPIC_API_KEY"]);

describe.skipIf(!LIVE)("Anthropic adapter (LIVE)", () => {
  it("executes a tiny structured request end to end", async () => {
    const apiKey = resolveApiKey(config)!;
    const transport = new SdkAnthropicTransport({ apiKey, baseUrl: config.baseUrl, apiVersion: config.apiVersion, model: config.model });
    // A strict, cheap request: tiny output cap + short timeout.
    const adapter = new AnthropicReasoningProviderAdapter({ config: { ...config, maxOutputTokens: 128, defaultTimeoutMs: 20_000 }, transport });

    const request: ExecutionRequest = {
      jobId: "live-1", traceId: "live-trace", providerId: config.providerId,
      systemPolicy: "You are a JSON API. Reply with exactly the requested object.",
      taskObjective: 'Return {"status":"ok"} and nothing else.',
      businessContext: {}, evidenceRefs: [], graphSnapshotRef: null, allowedClaims: [], prohibitedClaims: [],
      outputSchemaId: "schema.smoke.v1",
      tokenBudget: { inputTokens: 200, outputTokens: 64 }, costCeiling: 1, latencyCeilingMs: 20_000, deadline: null, retryDirective: null,
    };
    const control: ExecutionControl = { signal: newCancellationToken(), timeoutMs: 20_000, deadline: null, now: new Date().toISOString() };

    const raw = await adapter.execute(request, control);

    // structured JSON
    expect(typeof raw.output).toBe("object");
    expect(raw.output).not.toBeNull();
    // usage OR estimated fallback
    expect(raw.usage.inputTokens === undefined || raw.usage.inputTokens > 0).toBe(true);
    // provider metadata
    expect(raw.model.provider).toBe("anthropic");
    expect(raw.model.model).toContain("claude");
    // no raw content persisted — only a safe pointer reference
    if (raw.rawResponseRef !== undefined) {
      expect(raw.rawResponseRef.startsWith("anthropic:")).toBe(true);
      expect(raw.rawResponseRef).not.toContain("status");
    }

    // approximate cost, no secret
    const inTok = raw.usage.inputTokens ?? request.tokenBudget.inputTokens;
    const outTok = raw.usage.outputTokens ?? request.tokenBudget.outputTokens;
    const approxCost = (inTok / 1e6) * config.cost.inputPerMTokens + (outTok / 1e6) * config.cost.outputPerMTokens;
    console.log(`[live] approx cost ~$${approxCost.toFixed(6)} (in=${inTok}, out=${outTok}, model=${raw.model.model})`);
  });
});
