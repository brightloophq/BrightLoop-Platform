/* =============================================================================
 * Conversation + evaluation + provider use-cases (Phase E · Sprint E1).
 * ========================================================================== */

import { buildConversation, buildEvaluation, buildMessage, withMessageRollup } from "@brightloop/domain";
import type { AiProviderKind, ConversationRole, EvaluationOutcome } from "@brightloop/schema";
import {
  authorize, requireAiFoundation,
  AI_PROVIDER_WRITE_CAP, CONVERSATION_WRITE_CAP, PROMPT_EXECUTE_CAP,
  type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toConversationDTO, toConversationMessageDTO, toEvaluationDTO, toProviderDTO, type ConversationDTO, type ConversationMessageDTO, type EvaluationDTO, type ProviderDTO } from "./dto.js";

export interface CreateConversationInput { title?: string; provider: AiProviderKind; model: string; participants?: string[]; }

export async function createConversation(ctx: AppContext, rawWorkspaceId: unknown, input: CreateConversationInput): Promise<ConversationDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ai = requireAiFoundation(ctx);
  authorize(ctx.actor, CONVERSATION_WRITE_CAP, ctx.actor.clientId);
  const now = ctx.clock();
  const conversation = buildConversation({ id: ctx.ids("aiconv"), workspaceId, clientId: ctx.actor.clientId, title: input.title ?? "Untitled conversation", provider: input.provider, model: input.model, participants: input.participants ?? [ctx.actor.userId], createdByUserId: ctx.actor.userId, now });
  unwrap(await ai.conversations.create(conversation));
  return toConversationDTO(conversation);
}

export interface AppendMessageInput { role: ConversationRole; content: string; promptTokens?: number; completionTokens?: number; cost?: number; }

export async function appendConversationMessage(ctx: AppContext, rawConversationId: unknown, input: AppendMessageInput): Promise<ConversationMessageDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const content = requireString(input.content, "content");
  if (content.trim() === "") throw new ValidationError("A message cannot be empty");
  const ai = requireAiFoundation(ctx);
  const conversation = unwrap(await ai.conversations.getById(conversationId));
  if (conversation === null) throw new NotFoundError("conversation");
  authorize(ctx.actor, CONVERSATION_WRITE_CAP, conversation.clientId);
  if (conversation.status === "archived") throw new ConflictError("Cannot append to an archived conversation");

  const now = ctx.clock();
  const message = buildMessage({ id: ctx.ids("aimsg"), conversationId, workspaceId: conversation.workspaceId, clientId: conversation.clientId, role: input.role, content, sequence: conversation.messageCount, promptTokens: input.promptTokens ?? 0, completionTokens: input.completionTokens ?? 0, now });
  unwrap(await ai.messages.append(message));
  const next = withMessageRollup(conversation, message, input.cost ?? 0, now);
  const saved = await ai.conversations.save(next, conversation.version);
  if (!saved.ok && (saved.code === "conflict" || saved.code === "serialization_conflict")) throw new ConflictError("The conversation changed concurrently; reload and retry");
  return toConversationMessageDTO(message);
}

/* ---- evaluation ------------------------------------------------------------ */

export interface RecordEvaluationInput { evaluator: string; outcome: EvaluationOutcome; score?: number | null; notes?: string | null; }

export async function recordEvaluation(ctx: AppContext, rawExecutionId: unknown, input: RecordEvaluationInput): Promise<EvaluationDTO> {
  const executionId = requireId(rawExecutionId, "executionId");
  const ai = requireAiFoundation(ctx);
  const execution = unwrap(await ai.executions.getById(executionId));
  if (execution === null) throw new NotFoundError("execution");
  authorize(ctx.actor, PROMPT_EXECUTE_CAP, execution.clientId);
  const evaluation = buildEvaluation({ id: ctx.ids("aieval"), executionId, workspaceId: execution.workspaceId, clientId: execution.clientId, evaluator: requireString(input.evaluator, "evaluator"), outcome: input.outcome, score: input.score ?? null, notes: input.notes ?? null, now: ctx.clock() });
  unwrap(await ai.evaluations.append(evaluation));
  return toEvaluationDTO(evaluation);
}

/* ---- provider management (owner/admin only) -------------------------------- */

export interface UpsertProviderInput { id?: string; kind: AiProviderKind; label: string; enabled?: boolean; priority?: number; defaultModel?: string | null; }

export async function upsertAiProvider(ctx: AppContext, input: UpsertProviderInput): Promise<ProviderDTO> {
  const ai = requireAiFoundation(ctx);
  // Provider configuration is an internal/global concern — admins only.
  authorize(ctx.actor, AI_PROVIDER_WRITE_CAP, null);
  const now = ctx.clock();
  const existing = input.id ? unwrap(await ai.providers.getById(input.id)) : null;
  const provider = {
    id: existing?.id ?? ctx.ids("aiprov"),
    kind: input.kind,
    label: requireString(input.label, "label"),
    enabled: input.enabled ?? existing?.enabled ?? true,
    priority: input.priority ?? existing?.priority ?? 0,
    clientId: null,
    defaultModel: input.defaultModel ?? existing?.defaultModel ?? null,
    version: existing ? existing.version + 1 : 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  unwrap(await ai.providers.upsert(provider));
  return toProviderDTO(provider);
}
