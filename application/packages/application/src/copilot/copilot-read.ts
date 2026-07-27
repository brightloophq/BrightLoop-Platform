/* =============================================================================
 * AI Copilot read models (Phase F · Sprint F2).
 *
 * Conversation list/detail, recent context, referenced artifacts, capability
 * usage, conversation metrics, and conversation search. Load-then-authorize;
 * DTOs only. Workspace-isolated by RLS.
 * ========================================================================== */

import { authorize, requireCopilot, COPILOT_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { assembleConversationContext } from "./context-assembler.js";
import {
  toCopilotActionDTO, toCopilotCitationDTO, toCopilotConversationDTO, toCopilotMessageDTO,
  type ConversationContextDTO, type ConversationDetailDTO, type CopilotCitationDTO, type CopilotConversationDTO,
  type CopilotMessageDTO,
} from "./dto.js";

/** Conversation List — a workspace's conversations, pinned then newest first. */
export async function listCopilotConversations(ctx: AppContext, rawWorkspaceId: unknown): Promise<CopilotConversationDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const cp = requireCopilot(ctx);
  authorize(ctx.actor, COPILOT_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await cp.conversations.listByWorkspace(workspaceId))]
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (a.updatedAt < b.updatedAt ? 1 : -1))
    .map(toCopilotConversationDTO);
}

async function loadConversation(ctx: AppContext, conversationId: string) {
  const cp = requireCopilot(ctx);
  const conv = unwrap(await cp.conversations.getById(conversationId));
  if (conv === null) throw new NotFoundError("conversation");
  authorize(ctx.actor, COPILOT_READ_CAP, conv.clientId);
  return { cp, conv };
}

/** Conversation Detail — the full transcript with citations + suggested actions. */
export async function getConversationDetail(ctx: AppContext, rawConversationId: unknown): Promise<ConversationDetailDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { cp, conv } = await loadConversation(ctx, conversationId);
  const [messages, citations, actions] = await Promise.all([
    cp.messages.listByConversation(conversationId).then(unwrap), cp.citations.listByConversation(conversationId).then(unwrap), cp.actions.listByConversation(conversationId).then(unwrap),
  ]);
  return {
    conversation: toCopilotConversationDTO(conv),
    messages: [...messages].sort((a, b) => a.order - b.order).map(toCopilotMessageDTO),
    citations: citations.map(toCopilotCitationDTO),
    actions: actions.map(toCopilotActionDTO),
  };
}

/** Recent Context — the assembled workspace context for a conversation. */
export async function getRecentContext(ctx: AppContext, rawConversationId: unknown): Promise<ConversationContextDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { conv } = await loadConversation(ctx, conversationId);
  return assembleConversationContext(ctx, conv);
}

/** Referenced Artifacts — the citations across a conversation. */
export async function listReferencedArtifacts(ctx: AppContext, rawConversationId: unknown): Promise<CopilotCitationDTO[]> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { cp } = await loadConversation(ctx, conversationId);
  return unwrap(await cp.citations.listByConversation(conversationId)).map(toCopilotCitationDTO);
}

/** Capability Usage — how often each capability was invoked in a conversation. */
export async function getConversationCapabilityUsage(ctx: AppContext, rawConversationId: unknown): Promise<{ capabilityKey: string; calls: number; failures: number }[]> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { cp } = await loadConversation(ctx, conversationId);
  const byKey = new Map<string, { calls: number; failures: number }>();
  for (const m of unwrap(await cp.messages.listByConversation(conversationId))) {
    if (m.capabilityKey === null) continue;
    const e = byKey.get(m.capabilityKey) ?? { calls: 0, failures: 0 };
    e.calls += 1; if (!m.ok) e.failures += 1; byKey.set(m.capabilityKey, e);
  }
  return [...byKey.entries()].map(([capabilityKey, v]) => ({ capabilityKey, ...v }));
}

/** Conversation Metrics — turns, tokens, cost, capability calls. */
export async function getConversationMetrics(ctx: AppContext, rawConversationId: unknown): Promise<{ turns: number; messages: number; capabilityCalls: number; tokenTotal: number; cost: number }> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { cp, conv } = await loadConversation(ctx, conversationId);
  const messages = unwrap(await cp.messages.listByConversation(conversationId));
  return { turns: messages.filter((m) => m.role === "user").length, messages: messages.length, capabilityCalls: messages.filter((m) => m.capabilityKey !== null).length, tokenTotal: conv.tokenTotal, cost: conv.cost };
}

/** searchConversation — filter a conversation's messages by text. */
export async function searchConversation(ctx: AppContext, rawConversationId: unknown, rawQuery: unknown): Promise<CopilotMessageDTO[]> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const q = (typeof rawQuery === "string" ? rawQuery : "").trim().toLowerCase();
  const { cp } = await loadConversation(ctx, conversationId);
  if (q === "") return [];
  const messages = unwrap(await cp.messages.listByConversation(conversationId));
  return [...messages].filter((m) => m.content.toLowerCase().includes(q)).sort((a, b) => a.order - b.order).map(toCopilotMessageDTO);
}
