/* =============================================================================
 * AI Foundation use-case tests (Phase E · Sprint E1).
 *
 * Prompt lifecycle + versioning + rollback, the execution engine (success, retry,
 * failover, structured-output retry, total failure), token/cost accounting + audit
 * trail, conversations, authorization, and the read-model dashboards — through the
 * application layer with in-memory repos + deterministic mock providers.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { RuntimeServices } from "@brightloop/domain";
import type { Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { AiExecutionError, ForbiddenError, ConflictError, ValidationError } from "../errors.js";
import { createInMemoryAiRepos, createMockProvider } from "./testing.js";
import { addPromptVersion, archivePrompt, createPrompt, deprecatePrompt, publishPromptVersion, rollbackPrompt } from "./prompt-usecases.js";
import { executePrompt } from "./execution-engine.js";
import { appendConversationMessage, createConversation, recordEvaluation, upsertAiProvider } from "./conversation-usecases.js";
import { getConversationHistory, getCostDashboard, getProviderHealth, getUsageDashboard, listExecutionHistory, listPromptVersions } from "./ai-read.js";

const T0 = "2026-07-27T00:00:00.000Z";
const WS = "txw_ai1";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const noSleep = { sleep: async () => {} };

let ctx: AppContext;

function makeCtx(actor: Actor, aiProviders: AppContext["aiProviders"]): AppContext {
  let k = 0;
  return { services: {} as unknown as RuntimeServices, actor, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: () => T0, ai: createInMemoryAiRepos(), aiProviders };
}

beforeEach(() => {
  ctx = makeCtx(OWNER, { anthropic: createMockProvider("anthropic"), openai: createMockProvider("openai") });
});

describe("prompt lifecycle + versioning", () => {
  it("creates, versions (immutable), publishes, rolls back, deprecates, archives", async () => {
    const p = await createPrompt(ctx, WS, { name: "Summarizer", tags: ["ops"] });
    expect(p.status).toBe("draft");
    const v1 = await addPromptVersion(ctx, p.id, { systemPrompt: "You are {{persona}}", userTemplate: "Summarize {{doc}}", model: "claude-sonnet-5" });
    expect(v1.version).toBe(1);
    expect(v1.variables.sort()).toEqual(["doc", "persona"]);
    const active = await publishPromptVersion(ctx, p.id, 1);
    expect(active.status).toBe("active");
    expect(active.activeVersion).toBe(1);
    const v2 = await addPromptVersion(ctx, p.id, { userTemplate: "TL;DR {{doc}}", model: "claude-sonnet-5" });
    expect(v2.version).toBe(2);
    await publishPromptVersion(ctx, p.id, 2);
    const rolledBack = await rollbackPrompt(ctx, p.id, 1);
    expect(rolledBack.activeVersion).toBe(1);
    expect((await listPromptVersions(ctx, p.id)).length).toBe(2); // history preserved
    await deprecatePrompt(ctx, p.id);
    const archived = await archivePrompt(ctx, p.id);
    expect(archived.status).toBe("archived");
    await expect(addPromptVersion(ctx, p.id, { userTemplate: "x" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("denies a client actor", async () => {
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(createPrompt(clientCtx, WS, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("execution engine", () => {
  it("executes an ad-hoc prompt and records execution + usage + cost + audit", async () => {
    const res = await executePrompt(ctx, { workspaceId: WS, system: "You are helpful", userText: "Say hi", provider: "anthropic", model: "claude-sonnet-5" }, noSleep);
    expect(res.status).toBe("succeeded");
    expect(res.provider).toBe("anthropic");
    expect(res.usage.totalTokens).toBeGreaterThan(0);
    expect(res.cost.totalCost).toBeGreaterThanOrEqual(0);
    expect(res.cost.pricingVersion).toMatch(/^e1-/);
    const ai = ctx.ai!;
    expect((await ai.audit.listByWorkspace(WS)).ok).toBe(true);
    const audit = (await ai.audit.listByWorkspace(WS)) as { ok: true; value: unknown[] };
    expect(audit.value.length).toBe(1); // no result without an audit
  });

  it("validates missing variables and empty prompts (422)", async () => {
    await expect(executePrompt(ctx, { workspaceId: WS, userText: "Hi {{name}}", values: {}, provider: "anthropic" }, noSleep)).rejects.toBeInstanceOf(ValidationError);
    await expect(executePrompt(ctx, { workspaceId: WS, system: "", userText: "", provider: "anthropic" }, noSleep)).rejects.toBeInstanceOf(ValidationError);
  });

  it("retries a transient failure on the same provider", async () => {
    const c = makeCtx(OWNER, { anthropic: createMockProvider("anthropic", { failFirst: 2, reason: "rate_limit" }) });
    const res = await executePrompt(c, { workspaceId: WS, userText: "Hi", provider: "anthropic", failover: false }, noSleep);
    expect(res.status).toBe("succeeded");
    expect(res.retryCount).toBe(2);
  });

  it("fails over to the next provider and marks fallback_succeeded", async () => {
    const c = makeCtx(OWNER, { anthropic: createMockProvider("anthropic", { alwaysFail: "provider_unavailable" }), openai: createMockProvider("openai") });
    const res = await executePrompt(c, { workspaceId: WS, userText: "Hi", provider: "anthropic" }, noSleep);
    expect(res.status).toBe("fallback_succeeded");
    expect(res.provider).toBe("openai");
    expect(res.fallbackProvider).toBe("anthropic");
  });

  it("retries malformed structured output then returns valid JSON", async () => {
    const c = makeCtx(OWNER, { anthropic: createMockProvider("anthropic", { malformedFirst: 1 }) });
    const res = await executePrompt(c, { workspaceId: WS, userText: "Give JSON", provider: "anthropic", jsonSchema: { type: "object" }, failover: false }, noSleep);
    expect(res.structuredValid).toBe(true);
    expect(res.retryCount).toBe(1);
    expect(res.mode).toBe("json");
  });

  it("throws AiExecutionError after all providers fail, still recording a failed audit", async () => {
    const c = makeCtx(OWNER, { anthropic: createMockProvider("anthropic", { alwaysFail: "provider_unavailable" }), openai: createMockProvider("openai", { alwaysFail: "network" }) });
    await expect(executePrompt(c, { workspaceId: WS, userText: "Hi", provider: "anthropic" }, noSleep)).rejects.toBeInstanceOf(AiExecutionError);
    const audit = (await c.ai!.audit.listByWorkspace(WS)) as { ok: true; value: { status: string }[] };
    expect(audit.value.some((a) => a.status === "failed")).toBe(true);
  });

  it("denies a client actor executing", async () => {
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(executePrompt(clientCtx, { workspaceId: WS, userText: "Hi", provider: "anthropic" }, noSleep)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("provider management", () => {
  it("lets an admin/owner upsert a provider but denies a team member", async () => {
    const prov = await upsertAiProvider(ctx, { kind: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-5" });
    expect(prov.kind).toBe("anthropic");
    const teamCtx = { ...ctx, actor: TEAM };
    await expect(upsertAiProvider(teamCtx, { kind: "openai", label: "OpenAI" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("conversations", () => {
  it("creates a conversation, appends messages, and rolls up totals", async () => {
    const conv = await createConversation(ctx, WS, { provider: "anthropic", model: "claude-sonnet-5", title: "Chat" });
    await appendConversationMessage(ctx, conv.id, { role: "user", content: "Hi", promptTokens: 3 });
    await appendConversationMessage(ctx, conv.id, { role: "assistant", content: "Hello", completionTokens: 2, cost: 0.01 });
    const history = await getConversationHistory(ctx, conv.id);
    expect(history.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history.conversation.messageCount).toBe(2);
    expect(history.conversation.completionTokensTotal).toBe(2);
    expect(history.conversation.totalCost).toBeCloseTo(0.01);
  });
});

describe("read models", () => {
  it("aggregates usage + cost dashboards and paginates execution history", async () => {
    for (let i = 0; i < 3; i += 1) await executePrompt(ctx, { workspaceId: WS, userText: `Hi ${i}`, provider: "anthropic", model: "claude-sonnet-5" }, noSleep);
    const usage = await getUsageDashboard(ctx, WS);
    expect(usage.totalExecutions).toBe(3);
    expect(usage.totalTokens).toBeGreaterThan(0);
    expect(usage.daily.length).toBeGreaterThan(0);
    const cost = await getCostDashboard(ctx, WS);
    expect(cost.totalCost).toBeGreaterThanOrEqual(0);
    const page1 = await listExecutionHistory(ctx, WS, { limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listExecutionHistory(ctx, WS, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items.length).toBe(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("reports provider health + supported models", async () => {
    const health = await getProviderHealth(ctx);
    expect(health.map((h) => h.kind).sort()).toEqual(["anthropic", "openai"]);
    expect(health[0]!.status).toBe("healthy");
    expect(health[0]!.models.length).toBeGreaterThan(0);
  });

  it("records an evaluation against an execution", async () => {
    const res = await executePrompt(ctx, { workspaceId: WS, userText: "Hi", provider: "anthropic", model: "claude-sonnet-5" }, noSleep);
    const evaluation = await recordEvaluation(ctx, res.executionId, { evaluator: "rubric", outcome: "pass", score: 95 });
    expect(evaluation.outcome).toBe("pass");
    expect(evaluation.score).toBe(95);
  });
});
