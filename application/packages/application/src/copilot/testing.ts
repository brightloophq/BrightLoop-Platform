/* =============================================================================
 * In-memory Copilot repositories (Phase F · Sprint F2) — TEST SUPPORT.
 * The conversation is versioned; messages/citations/actions are append-only.
 * ========================================================================== */

import { ok, type CopilotRepositories, type RuntimeResult } from "@brightloop/domain";
import type { CopilotAction, CopilotCitation, CopilotConversation, CopilotMessage } from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryCopilotRepos(): CopilotRepositories {
  const conversations = new Map<string, CopilotConversation>();
  const messages: CopilotMessage[] = [];
  const citations: CopilotCitation[] = [];
  const actions: CopilotAction[] = [];
  return {
    conversations: {
      create: async (c) => { conversations.set(c.id, c); return ok("created", c); },
      getById: async (id) => ok("found", conversations.get(id) ?? null),
      listByWorkspace: async (w) => ok("found", [...conversations.values()].filter((c) => c.workspaceId === w)),
      save: async (next, expected) => { const cur = conversations.get(next.id); if (!cur || cur.version !== expected) return conflict(); conversations.set(next.id, next); return ok("updated", next); },
    },
    messages: { appendMany: async (r) => { messages.push(...r); return ok("created", [...r]); }, listByConversation: async (id) => ok("found", messages.filter((x) => x.conversationId === id)) },
    citations: { appendMany: async (r) => { citations.push(...r); return ok("created", [...r]); }, listByConversation: async (id) => ok("found", citations.filter((x) => x.conversationId === id)) },
    actions: { appendMany: async (r) => { actions.push(...r); return ok("created", [...r]); }, listByConversation: async (id) => ok("found", actions.filter((x) => x.conversationId === id)) },
  };
}
