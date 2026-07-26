/* =============================================================================
 * AI execution engine (Phase E · Sprint E1).
 *
 * The provider-agnostic execution path every future AI capability calls. It:
 *   authorize → resolve prompt/version or ad-hoc content → validate (safety) →
 *   resolve the provider FAILOVER chain → per provider RETRY with exponential
 *   backoff → validate structured output → persist execution + result + usage +
 *   cost + AUDIT → DTO.
 * No prompt result exists without an audit trail. Business code never names a
 * provider; the chosen provider/model is an outcome, not an input requirement.
 * ========================================================================== */

import {
  aiBackoffDelayMs, aiShouldRetry, calculateCost, DEFAULT_RETRY, estimateTokens, findModel,
  isValidJson, MAX_PROMPT_CHARS, missingVariables, modelsForProvider, PRICING_VERSION, renderPromptTemplate,
  resolveProviderChain, type AiCompletionRequest, type AiProviderPort, type AiRetryPolicy, type AiUsage,
} from "@brightloop/domain";
import type { AiExecutionStatus, AiModelDescriptor, AiProviderKind, ExecutionMode } from "@brightloop/schema";
import { authorize, requireAiFoundation, requireAiProviders, PROMPT_EXECUTE_CAP, type AppContext } from "../context.js";
import { AiExecutionError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import type { ExecutionResultDTO } from "./dto.js";

export interface ExecutePromptInput {
  /** Required for an ad-hoc execution; derived from the prompt otherwise. */
  workspaceId?: string;
  promptId?: string;
  version?: number;
  /** Ad-hoc content (used when no promptId). */
  system?: string;
  userText?: string;
  /** Template variable values. */
  values?: Record<string, string>;
  mode?: ExecutionMode;
  jsonSchema?: Record<string, unknown> | null;
  provider?: AiProviderKind | null;
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
  failover?: boolean;
  retry?: AiRetryPolicy;
}

export interface ExecuteOptions {
  /** Injected so tests skip real delays; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const ZERO_MODEL = { inputPricePerMTok: 0, outputPricePerMTok: 0, cachedInputPricePerMTok: 0, currency: "USD" } as Pick<AiModelDescriptor, "inputPricePerMTok" | "outputPricePerMTok" | "cachedInputPricePerMTok" | "currency">;
const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const g = globalThis as { setTimeout?: (cb: () => void, ms: number) => unknown };
    if (typeof g.setTimeout === "function") g.setTimeout(resolve, ms);
    else resolve();
  });

/** Pick a registry model that belongs to `kind`, preferring caller/version choices. */
function pickModel(kind: AiProviderKind, preferred: (string | null | undefined)[]): string {
  for (const m of preferred) if (m && findModel(m)?.provider === kind) return m;
  return modelsForProvider(kind)[0]?.id ?? preferred.find((m): m is string => !!m) ?? "unknown";
}

/**
 * Execute a prompt (stored version or ad-hoc) through the provider chain, record
 * the full audit trail, and return the result. Throws typed errors for unsafe
 * input (422) or exhausted providers (502).
 */
export async function executePrompt(ctx: AppContext, input: ExecutePromptInput, opts: ExecuteOptions = {}): Promise<ExecutionResultDTO> {
  const ai = requireAiFoundation(ctx);
  const providers = requireAiProviders(ctx);
  const sleep = opts.sleep ?? realSleep;
  const policy = input.retry ?? DEFAULT_RETRY;

  // ---- resolve the prompt context (stored version or ad-hoc) ----------------
  let workspaceId: string;
  let clientId: string | null;
  let promptId: string | null = null;
  let promptVersionNo: number | null = null;
  let systemPrompt: string;
  let userTemplate: string;
  let temperature: number;
  let maxTokens: number;
  let preferredProvider: AiProviderKind | null = input.provider ?? null;
  let preferredModel: string | null = input.model ?? null;

  if (input.promptId !== undefined) {
    promptId = requireId(input.promptId, "promptId");
    const prompt = unwrap(await ai.prompts.getById(promptId));
    if (prompt === null) throw new NotFoundError("prompt");
    authorize(ctx.actor, PROMPT_EXECUTE_CAP, prompt.clientId);
    const versionNo = input.version ?? prompt.activeVersion;
    if (versionNo === null) throw new ValidationError("This prompt has no active version to execute");
    const version = unwrap(await ai.promptVersions.getByPromptAndVersion(promptId, versionNo));
    if (version === null) throw new NotFoundError("prompt version");
    workspaceId = prompt.workspaceId;
    clientId = prompt.clientId;
    promptVersionNo = version.version;
    systemPrompt = version.systemPrompt;
    userTemplate = version.userTemplate;
    temperature = input.temperature ?? version.temperature;
    maxTokens = input.maxTokens ?? version.maxTokens;
    preferredProvider = input.provider ?? version.providerPreference ?? null;
    preferredModel = input.model ?? version.model ?? null;
  } else {
    workspaceId = requireId(input.workspaceId, "workspaceId");
    clientId = ctx.actor.clientId;
    authorize(ctx.actor, PROMPT_EXECUTE_CAP, clientId);
    systemPrompt = input.system ?? "";
    userTemplate = input.userText ?? "";
    temperature = input.temperature ?? 0.7;
    maxTokens = input.maxTokens ?? 1024;
  }

  const values = input.values ?? {};
  const renderedSystem = renderPromptTemplate(systemPrompt, values);
  const renderedUser = renderPromptTemplate(userTemplate, values);

  // ---- safety (provider-independent) ----------------------------------------
  if (renderedSystem.trim() === "" && renderedUser.trim() === "") throw new ValidationError("Prompt is empty");
  const missing = missingVariables(`${systemPrompt}\n${userTemplate}`, values);
  if (missing.length > 0) throw new ValidationError(`Missing variables: ${missing.join(", ")}`, { variables: missing.join(",") });
  if (renderedSystem.length + renderedUser.length > MAX_PROMPT_CHARS) throw new ValidationError("Prompt exceeds the maximum size");

  const mode: ExecutionMode = input.mode ?? (input.jsonSchema ? "json" : "completion");
  const availableKinds = Object.keys(providers) as AiProviderKind[];
  const failover = input.failover ?? true;
  const fullChain = resolveProviderChain(preferredProvider, availableKinds);
  const chain = failover ? fullChain : fullChain.slice(0, 1);
  if (chain.length === 0) throw new AiExecutionError("No provider available for this request");

  // ---- failover + retry loop ------------------------------------------------
  const startedAt = ctx.clock();
  let retryCount = 0;
  let lastMessage = "provider chain exhausted";

  for (let ci = 0; ci < chain.length; ci += 1) {
    const kind = chain[ci]!;
    const provider = providers[kind] as AiProviderPort;
    const modelId = pickModel(kind, [preferredModel, ci === 0 ? preferredModel : null]);
    const descriptor = findModel(modelId);
    const contextWindow = descriptor?.contextWindow ?? 128_000;
    const promptTokensEstimate = estimateTokens(`${renderedSystem}\n${renderedUser}`);
    if (promptTokensEstimate + maxTokens > contextWindow) {
      lastMessage = `token overflow for ${modelId}`;
      if (ci === 0 && chain.length === 1) throw new ValidationError(`Prompt exceeds the context window of ${modelId}`);
      continue; // this model can't fit; try the next provider
    }

    const request: AiCompletionRequest = { mode, model: modelId, system: renderedSystem, messages: [{ role: "user", content: renderedUser }], temperature, maxTokens, jsonSchema: input.jsonSchema ?? null };

    let attempt = 0;
    for (;;) {
      const outcome = await provider.execute(request);
      if (outcome.ok) {
        let structuredValid: boolean | null = null;
        if (input.jsonSchema) {
          structuredValid = isValidJson(outcome.value.content);
          if (!structuredValid && attempt + 1 < policy.maxAttempts) { attempt += 1; retryCount += 1; await sleep(aiBackoffDelayMs(attempt, policy)); continue; }
        }
        const fellBack = ci > 0;
        const status: AiExecutionStatus = fellBack ? "fallback_succeeded" : "succeeded";
        return await persist(ctx, ai, {
          workspaceId, clientId, promptId, promptVersionNo, mode, kind, modelId, descriptor: descriptor ?? { ...ZERO_MODEL } as AiModelDescriptor,
          usage: outcome.value.usage, content: outcome.value.content, finishReason: outcome.value.finishReason, structuredValid,
          status, retryCount, fallbackProvider: fellBack ? chain[0]! : null, startedAt,
        });
      }
      lastMessage = outcome.message;
      if (outcome.retryable && aiShouldRetry(outcome.reason, attempt, policy)) { attempt += 1; retryCount += 1; await sleep(aiBackoffDelayMs(attempt, policy)); continue; }
      break; // non-retryable or attempts exhausted → next provider in the chain
    }
  }

  // ---- all providers failed → record a failed execution + audit -------------
  await recordFailure(ctx, ai, { workspaceId, clientId, promptId, promptVersionNo, mode, kind: chain[0]!, modelId: pickModel(chain[0]!, [preferredModel]), retryCount, fallbackProvider: chain.length > 1 ? chain[chain.length - 1]! : null, startedAt });
  throw new AiExecutionError(`AI execution failed after ${retryCount} retries across ${chain.length} provider(s): ${lastMessage}`);
}

interface PersistInput {
  workspaceId: string; clientId: string | null; promptId: string | null; promptVersionNo: number | null;
  mode: ExecutionMode; kind: AiProviderKind; modelId: string; descriptor: AiModelDescriptor;
  usage: AiUsage; content: string; finishReason: string; structuredValid: boolean | null;
  status: AiExecutionStatus; retryCount: number; fallbackProvider: AiProviderKind | null; startedAt: string;
}

async function persist(ctx: AppContext, ai: ReturnType<typeof requireAiFoundation>, p: PersistInput): Promise<ExecutionResultDTO> {
  const endedAt = ctx.clock();
  const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(p.startedAt));
  const totalTokens = p.usage.promptTokens + p.usage.completionTokens;
  const cost = calculateCost(p.usage, p.descriptor);
  const executionId = ctx.ids("aiexec");

  unwrap(await ai.executions.create({ id: executionId, workspaceId: p.workspaceId, clientId: p.clientId, promptId: p.promptId, promptVersion: p.promptVersionNo, mode: p.mode, provider: p.kind, model: p.modelId, status: p.status, durationMs, retryCount: p.retryCount, fallbackProvider: p.fallbackProvider, requestedByUserId: ctx.actor.userId, createdAt: endedAt }));
  unwrap(await ai.results.append({ id: ctx.ids("airesult"), executionId, workspaceId: p.workspaceId, clientId: p.clientId, content: p.content, structuredValid: p.structuredValid, finishReason: p.finishReason, createdAt: endedAt }));
  unwrap(await ai.usage.append({ id: ctx.ids("aiusage"), executionId, workspaceId: p.workspaceId, clientId: p.clientId, provider: p.kind, model: p.modelId, promptTokens: p.usage.promptTokens, completionTokens: p.usage.completionTokens, cachedTokens: p.usage.cachedTokens, totalTokens, userId: ctx.actor.userId, at: endedAt }));
  unwrap(await ai.costs.append({ id: ctx.ids("aicost"), executionId, workspaceId: p.workspaceId, clientId: p.clientId, inputCost: cost.inputCost, outputCost: cost.outputCost, totalCost: cost.totalCost, currency: cost.currency, pricingVersion: PRICING_VERSION, at: endedAt }));
  unwrap(await ai.audit.append({ id: ctx.ids("aiaudit"), executionId, workspaceId: p.workspaceId, clientId: p.clientId, provider: p.kind, model: p.modelId, promptVersion: p.promptVersionNo, userId: ctx.actor.userId, durationMs, status: p.status, retryCount: p.retryCount, fallbackProvider: p.fallbackProvider, totalTokens, totalCost: cost.totalCost, currency: cost.currency, at: endedAt }));

  return { executionId, status: p.status, provider: p.kind, model: p.modelId, mode: p.mode, retryCount: p.retryCount, fallbackProvider: p.fallbackProvider, durationMs, content: p.content, structuredValid: p.structuredValid, finishReason: p.finishReason, usage: { promptTokens: p.usage.promptTokens, completionTokens: p.usage.completionTokens, cachedTokens: p.usage.cachedTokens, totalTokens }, cost: { inputCost: cost.inputCost, outputCost: cost.outputCost, totalCost: cost.totalCost, currency: cost.currency, pricingVersion: PRICING_VERSION } };
}

interface FailureInput {
  workspaceId: string; clientId: string | null; promptId: string | null; promptVersionNo: number | null;
  mode: ExecutionMode; kind: AiProviderKind; modelId: string; retryCount: number; fallbackProvider: AiProviderKind | null; startedAt: string;
}

/** Record a failed execution + its audit event — no result exists without an audit. */
async function recordFailure(ctx: AppContext, ai: ReturnType<typeof requireAiFoundation>, f: FailureInput): Promise<void> {
  const endedAt = ctx.clock();
  const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(f.startedAt));
  const executionId = ctx.ids("aiexec");
  unwrap(await ai.executions.create({ id: executionId, workspaceId: f.workspaceId, clientId: f.clientId, promptId: f.promptId, promptVersion: f.promptVersionNo, mode: f.mode, provider: f.kind, model: f.modelId, status: "failed", durationMs, retryCount: f.retryCount, fallbackProvider: f.fallbackProvider, requestedByUserId: ctx.actor.userId, createdAt: endedAt }));
  unwrap(await ai.audit.append({ id: ctx.ids("aiaudit"), executionId, workspaceId: f.workspaceId, clientId: f.clientId, provider: f.kind, model: f.modelId, promptVersion: f.promptVersionNo, userId: ctx.actor.userId, durationMs, status: "failed", retryCount: f.retryCount, fallbackProvider: f.fallbackProvider, totalTokens: 0, totalCost: 0, currency: "USD", at: endedAt }));
}
