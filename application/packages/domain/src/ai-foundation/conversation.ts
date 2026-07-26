/* =============================================================================
 * Conversation aggregate (Phase E · Sprint E1) — PURE.
 *
 * A conversation owns an ordered, append-only message log and running token/cost
 * totals. Future agents reuse this. Context management is a pure windowing helper
 * over the messages. Deterministic; no io.
 * ========================================================================== */

import type { AiProviderKind, Conversation, ConversationMessage, ConversationRole } from "@brightloop/schema";

export interface BuildConversationInput {
  id: string; workspaceId: string; clientId: string | null; title: string;
  provider: AiProviderKind; model: string; participants: readonly string[]; createdByUserId: string; now: string;
}
/** Build a fresh, empty conversation. Pure. */
export function buildConversation(input: BuildConversationInput): Conversation {
  return {
    id: input.id, workspaceId: input.workspaceId, clientId: input.clientId, title: input.title,
    provider: input.provider, model: input.model, participants: [...input.participants],
    messageCount: 0, promptTokensTotal: 0, completionTokensTotal: 0, totalCost: 0, currency: "USD",
    status: "active", createdByUserId: input.createdByUserId, version: 1, createdAt: input.now, updatedAt: input.now,
  };
}

export interface AppendMessageInput {
  id: string; conversationId: string; workspaceId: string; clientId: string | null;
  role: ConversationRole; content: string; sequence: number;
  promptTokens?: number; completionTokens?: number; now: string;
}
export function buildMessage(input: AppendMessageInput): ConversationMessage {
  return {
    id: input.id, conversationId: input.conversationId, workspaceId: input.workspaceId, clientId: input.clientId,
    role: input.role, content: input.content, sequence: input.sequence,
    promptTokens: input.promptTokens ?? 0, completionTokens: input.completionTokens ?? 0, at: input.now,
  };
}

/**
 * Fold a new message into the conversation's rollups (message count + token
 * totals), stamp `updatedAt`, and bump `version` for optimistic concurrency. Pure.
 */
export function withMessageRollup(conversation: Conversation, message: ConversationMessage, addedCost: number, now: string): Conversation {
  return {
    ...conversation,
    messageCount: conversation.messageCount + 1,
    promptTokensTotal: conversation.promptTokensTotal + message.promptTokens,
    completionTokensTotal: conversation.completionTokensTotal + message.completionTokens,
    totalCost: Math.round((conversation.totalCost + addedCost) * 1e6) / 1e6,
    updatedAt: now,
    version: conversation.version + 1,
  };
}

/**
 * The trailing context window: keep any leading system message plus the most
 * recent `maxMessages` non-system messages, preserving order. Pure.
 */
export function contextWindow(messages: readonly ConversationMessage[], maxMessages: number): ConversationMessage[] {
  const ordered = [...messages].sort((a, b) => a.sequence - b.sequence);
  const system = ordered.filter((m) => m.role === "system").slice(0, 1);
  const rest = ordered.filter((m) => m.role !== "system");
  const tail = rest.slice(Math.max(0, rest.length - maxMessages));
  return [...system, ...tail];
}
