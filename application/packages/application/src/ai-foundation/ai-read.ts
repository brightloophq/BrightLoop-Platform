/* =============================================================================
 * AI Foundation read models (Phase E · Sprint E1).
 *
 * Read-only projections: prompt library + versions, usage/cost dashboards (daily
 * + monthly rollups), paginated execution history, conversation history, provider
 * health, and the model registry. Load-then-authorize; DTOs only.
 * ========================================================================== */

import { bucketByPeriod, MODEL_REGISTRY, modelsForProvider, sumBy, type AiProviderPort } from "@brightloop/domain";
import type { AiProviderKind } from "@brightloop/schema";
import {
  authorize, requireAiFoundation, requireAiProviders,
  CONVERSATION_READ_CAP, COST_READ_CAP, PROMPT_READ_CAP, USAGE_READ_CAP,
  type AppContext,
} from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toConversationDTO, toConversationMessageDTO, toExecutionSummaryDTO, toPromptDTO, toPromptVersionDTO,
  type ConversationDTO, type ConversationHistoryDTO, type CostDashboardDTO, type ExecutionHistoryPageDTO,
  type ModelDescriptorDTO, type PromptDTO, type PromptVersionDTO, type ProviderHealthDTO, type UsageDashboardDTO,
} from "./dto.js";

/** The prompt library for a workspace (newest first). */
export async function listPromptLibrary(ctx: AppContext, rawWorkspaceId: unknown): Promise<PromptDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, PROMPT_READ_CAP, ctx.actor.clientId);
  const prompts = unwrap(await ai.prompts.listByWorkspace(workspaceId));
  return [...prompts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toPromptDTO);
}

/** A prompt's full version history (ascending). */
export async function listPromptVersions(ctx: AppContext, rawPromptId: unknown): Promise<PromptVersionDTO[]> {
  const promptId = requireId(rawPromptId, "promptId");
  const ai = requireAiFoundation(ctx);
  const prompt = unwrap(await ai.prompts.getById(promptId));
  if (prompt === null) throw new NotFoundError("prompt");
  authorize(ctx.actor, PROMPT_READ_CAP, prompt.clientId);
  const versions = unwrap(await ai.promptVersions.listByPrompt(promptId));
  return [...versions].sort((a, b) => a.version - b.version).map(toPromptVersionDTO);
}

/** Token usage dashboard: totals + daily + monthly rollups. */
export async function getUsageDashboard(ctx: AppContext, rawWorkspaceId: unknown): Promise<UsageDashboardDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, USAGE_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await ai.usage.listByWorkspace(workspaceId));
  const roll = (g: "day" | "month") => [...bucketByPeriod(rows, (r) => r.at, g).entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([period, list]) => ({
    period, promptTokens: sumBy(list, (r) => r.promptTokens), completionTokens: sumBy(list, (r) => r.completionTokens),
    totalTokens: sumBy(list, (r) => r.totalTokens), executions: new Set(list.map((r) => r.executionId)).size,
  }));
  return { totalTokens: sumBy(rows, (r) => r.totalTokens), totalExecutions: new Set(rows.map((r) => r.executionId)).size, daily: roll("day"), monthly: roll("month") };
}

/** Cost dashboard: totals + daily + monthly rollups. */
export async function getCostDashboard(ctx: AppContext, rawWorkspaceId: unknown): Promise<CostDashboardDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, COST_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await ai.costs.listByWorkspace(workspaceId));
  const currency = rows[0]?.currency ?? "USD";
  const roll = (g: "day" | "month") => [...bucketByPeriod(rows, (r) => r.at, g).entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([period, list]) => ({ period, totalCost: sumBy(list, (r) => r.totalCost), currency }));
  return { totalCost: sumBy(rows, (r) => r.totalCost), currency, daily: roll("day"), monthly: roll("month") };
}

/** Paginated execution history (newest first) with a stable cursor. */
export async function listExecutionHistory(ctx: AppContext, rawWorkspaceId: unknown, query: { limit?: number; cursor?: string | null } = {}): Promise<ExecutionHistoryPageDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, USAGE_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await ai.executions.listByWorkspace(workspaceId));
  const sorted = [...rows].sort((a, b) => { const ca = `${a.createdAt}|${a.id}`, cb = `${b.createdAt}|${b.id}`; return ca < cb ? 1 : ca > cb ? -1 : 0; });
  const limit = Math.max(1, Math.min(query.limit ?? 25, 200));
  const cursor = query.cursor ?? null;
  const start = cursor === null ? 0 : sorted.findIndex((e) => `${e.createdAt}|${e.id}` === cursor) + 1;
  const from = cursor !== null && start === 0 ? sorted.length : start;
  const items = sorted.slice(from, from + limit);
  const nextCursor = from + limit < sorted.length && items.length > 0 ? `${items[items.length - 1]!.createdAt}|${items[items.length - 1]!.id}` : null;
  return { items: items.map(toExecutionSummaryDTO), nextCursor };
}

/** Workspace conversations (newest first). */
export async function listConversations(ctx: AppContext, rawWorkspaceId: unknown): Promise<ConversationDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, CONVERSATION_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await ai.conversations.listByWorkspace(workspaceId));
  return [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(toConversationDTO);
}

/** One conversation with its ordered message log. */
export async function getConversationHistory(ctx: AppContext, rawConversationId: unknown): Promise<ConversationHistoryDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const ai = requireAiFoundation(ctx);
  const conversation = unwrap(await ai.conversations.getById(conversationId));
  if (conversation === null) throw new NotFoundError("conversation");
  authorize(ctx.actor, CONVERSATION_READ_CAP, conversation.clientId);
  const messages = unwrap(await ai.messages.listByConversation(conversationId));
  return { conversation: toConversationDTO(conversation), messages: [...messages].sort((a, b) => a.sequence - b.sequence).map(toConversationMessageDTO) };
}

/** Live provider health + the models each serves. Requires the provider registry. */
export async function getProviderHealth(ctx: AppContext): Promise<ProviderHealthDTO[]> {
  authorize(ctx.actor, PROMPT_READ_CAP, ctx.actor.clientId);
  const providers = requireAiProviders(ctx);
  const out: ProviderHealthDTO[] = [];
  for (const kind of Object.keys(providers) as AiProviderKind[]) {
    const provider = providers[kind] as AiProviderPort;
    const status = await provider.health();
    out.push({ kind, status, models: provider.supportedModels().map((m) => m.id) });
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind));
}

/** The static model registry (capabilities + pricing metadata). */
export async function getModelRegistry(ctx: AppContext): Promise<ModelDescriptorDTO[]> {
  authorize(ctx.actor, PROMPT_READ_CAP, ctx.actor.clientId);
  return [...MODEL_REGISTRY];
}

/** Models for one provider (registry slice). */
export function modelsForKind(kind: AiProviderKind): ModelDescriptorDTO[] {
  return modelsForProvider(kind);
}
