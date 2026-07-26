/* =============================================================================
 * AI Foundation domain tests (Phase E · Sprint E1).
 *
 * Model registry, token/cost accounting, retry + failover policy, prompt
 * lifecycle + templating + safety, conversation rollups, and evaluation — pure.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { findModel, modelSupports, modelsForProvider, PRICING_VERSION } from "./registry.js";
import { calculateCost, estimateTokens, sumBy, bucketByPeriod, totalTokens } from "./accounting.js";
import { aiBackoffDelayMs, aiShouldRetry, DEFAULT_RETRY, isRetryable, resolveProviderChain } from "./resilience.js";
import { buildPrompt, buildVersion, canTransitionPrompt, extractVariables, missingVariables, renderPromptTemplate, validatePrompt } from "./prompt.js";
import { buildMessage, contextWindow, withMessageRollup } from "./conversation.js";
import { buildEvaluation, isValidJson, parseStructured } from "./evaluation.js";
import type { Conversation } from "@brightloop/schema";

const T0 = "2026-07-27T00:00:00.000Z";

describe("model registry", () => {
  it("resolves models, provider sets, and capabilities", () => {
    expect(findModel("claude-opus-4-8")?.provider).toBe("anthropic");
    expect(findModel("nope")).toBeNull();
    expect(modelsForProvider("google").every((m) => m.provider === "google")).toBe(true);
    expect(modelSupports("gemini-2.5-pro", "audio")).toBe(true);
    expect(modelSupports("claude-opus-4-8", "audio")).toBe(false);
    expect(modelSupports("nope", "json")).toBe(false);
    expect(PRICING_VERSION).toMatch(/^e1-/);
  });
});

describe("accounting", () => {
  it("estimates tokens deterministically and totals them", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(totalTokens({ promptTokens: 10, completionTokens: 5, cachedTokens: 0 })).toBe(15);
  });
  it("calculates cost from per-1M pricing, billing cached tokens separately", () => {
    const model = findModel("claude-sonnet-5")!; // input 3, output 15, cached 0.3 per 1M
    const c = calculateCost({ promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 0 }, model);
    expect(c.inputCost).toBe(3);
    expect(c.outputCost).toBe(15);
    expect(c.totalCost).toBe(18);
    const cached = calculateCost({ promptTokens: 1_000_000, completionTokens: 0, cachedTokens: 1_000_000 }, model);
    expect(cached.inputCost).toBe(0.3); // all prompt tokens cached
  });
  it("aggregates and buckets by day/month", () => {
    const rows = [{ v: 1, at: "2026-07-01T00:00:00Z" }, { v: 2, at: "2026-07-01T05:00:00Z" }, { v: 4, at: "2026-08-01T00:00:00Z" }];
    expect(sumBy(rows, (r) => r.v)).toBe(7);
    expect(bucketByPeriod(rows, (r) => r.at, "day").get("2026-07-01")?.length).toBe(2);
    expect(bucketByPeriod(rows, (r) => r.at, "month").get("2026-07")?.length).toBe(2);
  });
});

describe("resilience", () => {
  it("classifies retryable reasons and backs off exponentially (capped)", () => {
    expect(isRetryable("rate_limit")).toBe(true);
    expect(isRetryable("malformed_output")).toBe(false);
    expect(aiBackoffDelayMs(0)).toBe(200);
    expect(aiBackoffDelayMs(1)).toBe(400);
    expect(aiBackoffDelayMs(10)).toBe(DEFAULT_RETRY.maxDelayMs);
    expect(aiShouldRetry("timeout", 0)).toBe(true);
    expect(aiShouldRetry("timeout", 2)).toBe(false); // maxAttempts=3 → attempts 0,1,2; no retry after 2
    expect(aiShouldRetry("invalid_request", 0)).toBe(false);
  });
  it("resolves the provider failover chain, preferred first, deduped, available only", () => {
    expect(resolveProviderChain("openai", ["anthropic", "openai", "google"])).toEqual(["openai", "anthropic", "google"]);
    expect(resolveProviderChain(null, ["anthropic", "google"])).toEqual(["anthropic", "google"]);
    expect(resolveProviderChain("openai", ["anthropic"])).toEqual(["anthropic"]); // preferred unavailable
  });
});

describe("prompt lifecycle + templating + safety", () => {
  it("enforces the status state machine", () => {
    expect(canTransitionPrompt("draft", "active")).toBe(true);
    expect(canTransitionPrompt("active", "deprecated")).toBe(true);
    expect(canTransitionPrompt("deprecated", "active")).toBe(true);
    expect(canTransitionPrompt("archived", "active")).toBe(false);
  });
  it("extracts, detects missing, and renders template variables", () => {
    expect(extractVariables("Hi {{name}}, {{name}} + {{topic}}")).toEqual(["name", "topic"]);
    expect(missingVariables("{{a}} {{b}}", { a: "x" })).toEqual(["b"]);
    expect(renderPromptTemplate("Hi {{name}}", { name: "Ada" })).toBe("Hi Ada");
  });
  it("builds a version deriving declared variables", () => {
    const v = buildVersion({ id: "pv_1", promptId: "p_1", workspaceId: "w", clientId: "c", version: 1, systemPrompt: "You are {{persona}}", userTemplate: "Summarize {{doc}}", createdByUserId: "u", now: T0 });
    expect(v.variables.sort()).toEqual(["doc", "persona"]);
    expect(v.status).toBe("draft");
  });
  it("validates safety: empty, missing vars, token overflow", () => {
    const est = estimateTokens;
    expect(validatePrompt({ systemPrompt: "", userTemplate: "", values: {}, contextWindow: 1000, maxTokens: 10, estimateTokens: est }).ok).toBe(false);
    const missing = validatePrompt({ systemPrompt: "s", userTemplate: "{{x}}", values: {}, contextWindow: 1000, maxTokens: 10, estimateTokens: est });
    expect(missing.ok).toBe(false);
    const overflow = validatePrompt({ systemPrompt: "s".repeat(100), userTemplate: "hi", values: {}, contextWindow: 5, maxTokens: 10, estimateTokens: est });
    expect(overflow.ok).toBe(false);
    const good = validatePrompt({ systemPrompt: "s", userTemplate: "Hi {{n}}", values: { n: "Ada" }, contextWindow: 10_000, maxTokens: 10, estimateTokens: est });
    expect(good.ok && good.rendered).toBe("Hi Ada");
  });
  it("prompt starts as draft with no active version", () => {
    const p = buildPrompt({ id: "p_1", workspaceId: "w", clientId: "c", name: "Summarizer", ownerUserId: "u", now: T0 });
    expect(p.status).toBe("draft");
    expect(p.activeVersion).toBeNull();
  });
});

describe("conversation", () => {
  const base: Conversation = { id: "cv_1", workspaceId: "w", clientId: "c", title: "T", provider: "anthropic", model: "claude-sonnet-5", participants: ["u"], messageCount: 0, promptTokensTotal: 0, completionTokensTotal: 0, totalCost: 0, currency: "USD", status: "active", createdByUserId: "u", version: 1, createdAt: T0, updatedAt: T0 };
  it("rolls up message tokens/cost and bumps version", () => {
    const msg = buildMessage({ id: "m_1", conversationId: "cv_1", workspaceId: "w", clientId: "c", role: "assistant", content: "hi", sequence: 0, promptTokens: 10, completionTokens: 5, now: T0 });
    const next = withMessageRollup(base, msg, 0.02, "2026-07-27T01:00:00.000Z");
    expect(next.messageCount).toBe(1);
    expect(next.promptTokensTotal).toBe(10);
    expect(next.completionTokensTotal).toBe(5);
    expect(next.totalCost).toBe(0.02);
    expect(next.version).toBe(2);
  });
  it("windows context to system + trailing messages", () => {
    const msgs = [
      buildMessage({ id: "m0", conversationId: "cv_1", workspaceId: "w", clientId: "c", role: "system", content: "sys", sequence: 0, now: T0 }),
      buildMessage({ id: "m1", conversationId: "cv_1", workspaceId: "w", clientId: "c", role: "user", content: "1", sequence: 1, now: T0 }),
      buildMessage({ id: "m2", conversationId: "cv_1", workspaceId: "w", clientId: "c", role: "assistant", content: "2", sequence: 2, now: T0 }),
      buildMessage({ id: "m3", conversationId: "cv_1", workspaceId: "w", clientId: "c", role: "user", content: "3", sequence: 3, now: T0 }),
    ];
    const win = contextWindow(msgs, 2);
    expect(win.map((m) => m.content)).toEqual(["sys", "2", "3"]);
  });
});

describe("evaluation", () => {
  it("builds records and validates structured JSON", () => {
    const e = buildEvaluation({ id: "ev_1", executionId: "ex_1", workspaceId: "w", clientId: "c", evaluator: "rubric", outcome: "pass", score: 90, now: T0 });
    expect(e.outcome).toBe("pass");
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson("not json")).toBe(false);
    expect(parseStructured<{ a: number }>('{"a":1}')?.a).toBe(1);
    expect(parseStructured("bad")).toBeNull();
  });
});
