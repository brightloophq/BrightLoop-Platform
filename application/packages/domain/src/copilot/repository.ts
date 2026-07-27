/* =============================================================================
 * Copilot — REPOSITORY PORTS (Phase F · Sprint F2).
 *
 * The conversation is versioned (optimistic concurrency); messages, citations and
 * actions are append-only. The Copilot consumes upstream contexts ONLY via their
 * application services, so no upstream ports appear here. RLS is the tenant
 * boundary; a client only ever sees its own org's conversations.
 * ========================================================================== */

import type { CopilotAction, CopilotCitation, CopilotConversation, CopilotMessage } from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface CopilotConversationRepository {
  create(row: CopilotConversation): Promise<RuntimeResult<CopilotConversation>>;
  getById(id: string): Promise<RuntimeResult<CopilotConversation | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<CopilotConversation[]>>;
  save(next: CopilotConversation, expectedVersion: number): Promise<RuntimeResult<CopilotConversation>>;
}
export interface CopilotMessageRepository {
  appendMany(rows: readonly CopilotMessage[]): Promise<RuntimeResult<CopilotMessage[]>>;
  listByConversation(conversationId: string): Promise<RuntimeResult<CopilotMessage[]>>;
}
export interface CopilotCitationRepository {
  appendMany(rows: readonly CopilotCitation[]): Promise<RuntimeResult<CopilotCitation[]>>;
  listByConversation(conversationId: string): Promise<RuntimeResult<CopilotCitation[]>>;
}
export interface CopilotActionRepository {
  appendMany(rows: readonly CopilotAction[]): Promise<RuntimeResult<CopilotAction[]>>;
  listByConversation(conversationId: string): Promise<RuntimeResult<CopilotAction[]>>;
}

export interface CopilotRepositories {
  conversations: CopilotConversationRepository;
  messages: CopilotMessageRepository;
  citations: CopilotCitationRepository;
  actions: CopilotActionRepository;
}
