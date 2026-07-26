/* =============================================================================
 * In-memory AI Foundation repositories + a deterministic MOCK provider
 * (Phase E · Sprint E1) — TEST SUPPORT.
 *
 * The mock provider makes NO network calls — it computes deterministic content
 * and usage from the request, and can be scripted to fail (for retry/failover)
 * or return malformed JSON (for structured-output retry). This is exactly the
 * shape a real Anthropic/OpenAI/Google adapter implements.
 * ========================================================================== */

import {
  estimateTokens, isRetryable, modelsForProvider, ok,
  type AiCompletionRequest, type AiExecuteOutcome, type AiFailureReason, type AiFoundationRepositories,
  type AiProviderPort, type AiStreamChunk, type AiUsage, type RuntimeResult,
} from "@brightloop/domain";
import type {
  AiHealthStatus, AiProvider, AiProviderKind, AuditEvent, Conversation, ConversationMessage, CostRecord, EvaluationResult,
  Prompt, PromptExecution, PromptResult, PromptVersion, UsageRecord,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryAiRepos(): AiFoundationRepositories {
  const providers = new Map<string, AiProvider>();
  const prompts = new Map<string, Prompt>();
  const versions: PromptVersion[] = [];
  const executions = new Map<string, PromptExecution>();
  const results: PromptResult[] = [];
  const usage: UsageRecord[] = [];
  const costs: CostRecord[] = [];
  const audit: AuditEvent[] = [];
  const conversations = new Map<string, Conversation>();
  const messages: ConversationMessage[] = [];
  const evaluations: EvaluationResult[] = [];

  return {
    providers: {
      upsert: async (p) => { providers.set(p.id, p); return ok("updated", p); },
      getById: async (id) => ok("found", providers.get(id) ?? null),
      list: async () => ok("found", [...providers.values()]),
    },
    prompts: {
      create: async (p) => { prompts.set(p.id, p); return ok("created", p); },
      getById: async (id) => ok("found", prompts.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...prompts.values()].filter((p) => p.workspaceId === wid)),
      save: async (next, expected) => { const cur = prompts.get(next.id); if (!cur || cur.version !== expected) return conflict(); prompts.set(next.id, next); return ok("updated", next); },
    },
    promptVersions: {
      append: async (v) => { if (versions.some((x) => x.promptId === v.promptId && x.version === v.version)) return conflict(); versions.push(v); return ok("created", v); },
      getByPromptAndVersion: async (pid, ver) => ok("found", versions.find((v) => v.promptId === pid && v.version === ver) ?? null),
      listByPrompt: async (pid) => ok("found", versions.filter((v) => v.promptId === pid)),
    },
    executions: {
      create: async (e) => { executions.set(e.id, e); return ok("created", e); },
      getById: async (id) => ok("found", executions.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...executions.values()].filter((e) => e.workspaceId === wid)),
    },
    results: {
      append: async (r) => { results.push(r); return ok("created", r); },
      getByExecution: async (eid) => ok("found", results.find((r) => r.executionId === eid) ?? null),
    },
    usage: {
      append: async (r) => { usage.push(r); return ok("created", r); },
      listByWorkspace: async (wid) => ok("found", usage.filter((r) => r.workspaceId === wid)),
    },
    costs: {
      append: async (r) => { costs.push(r); return ok("created", r); },
      listByWorkspace: async (wid) => ok("found", costs.filter((r) => r.workspaceId === wid)),
    },
    audit: {
      append: async (e) => { audit.push(e); return ok("created", e); },
      listByWorkspace: async (wid) => ok("found", audit.filter((e) => e.workspaceId === wid)),
    },
    conversations: {
      create: async (c) => { conversations.set(c.id, c); return ok("created", c); },
      getById: async (id) => ok("found", conversations.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...conversations.values()].filter((c) => c.workspaceId === wid)),
      save: async (next, expected) => { const cur = conversations.get(next.id); if (!cur || cur.version !== expected) return conflict(); conversations.set(next.id, next); return ok("updated", next); },
    },
    messages: {
      append: async (m) => { messages.push(m); return ok("created", m); },
      listByConversation: async (cid) => ok("found", messages.filter((m) => m.conversationId === cid)),
    },
    evaluations: {
      append: async (e) => { evaluations.push(e); return ok("created", e); },
      listByExecution: async (eid) => ok("found", evaluations.filter((e) => e.executionId === eid)),
    },
  };
}

export interface MockProviderOptions {
  /** Fail every call with this reason. */
  alwaysFail?: AiFailureReason;
  /** Fail the first N calls (then succeed) with `reason`. */
  failFirst?: number;
  reason?: AiFailureReason;
  /** Return malformed (non-JSON) content on the first N calls. */
  malformedFirst?: number;
  /** Fixed content to return; defaults to a deterministic JSON echo. */
  content?: string;
  health?: AiHealthStatus;
}

/** A deterministic, network-free provider adapter for tests + local dev. */
export function createMockProvider(kind: AiProviderKind, options: MockProviderOptions = {}): AiProviderPort {
  let calls = 0;
  const usageFor = (req: AiCompletionRequest, content: string): AiUsage => ({
    promptTokens: estimateTokens(req.system + req.messages.map((m) => m.content).join("\n")),
    completionTokens: estimateTokens(content),
    cachedTokens: 0,
  });
  return {
    kind,
    async execute(req: AiCompletionRequest): Promise<AiExecuteOutcome> {
      calls += 1;
      if (options.alwaysFail) return { ok: false, reason: options.alwaysFail, message: `mock ${kind} always fails`, retryable: isRetryable(options.alwaysFail) };
      if (options.failFirst && calls <= options.failFirst) { const reason = options.reason ?? "provider_unavailable"; return { ok: false, reason, message: `mock ${kind} transient failure ${calls}`, retryable: isRetryable(reason) }; }
      const malformed = options.malformedFirst !== undefined && calls <= (options.failFirst ?? 0) + options.malformedFirst;
      const content = malformed ? "<<not json>>" : options.content ?? JSON.stringify({ provider: kind, model: req.model, echo: req.messages[req.messages.length - 1]?.content ?? "" });
      return { ok: true, value: { content, usage: usageFor(req, content), finishReason: "stop" } };
    },
    async *stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
      const content = options.content ?? `stream:${req.model}`;
      for (const ch of content.match(/.{1,8}/g) ?? []) yield { type: "text", delta: ch };
      yield { type: "done", usage: usageFor(req, content), finishReason: "stop" };
    },
    countTokens: (text) => estimateTokens(text),
    estimateCost: (usage) => (usage.promptTokens + usage.completionTokens) / 1_000_000,
    health: async () => options.health ?? "healthy",
    supportedModels: () => modelsForProvider(kind),
  };
}
