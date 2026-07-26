/* =============================================================================
 * Context Assembler (Phase E · Sprint E3).
 *
 * The Strategist NEVER calls retrieval or the vector store directly. It asks the
 * Context Assembler to "build planning context"; the Assembler composes it by
 * calling the E2 Knowledge retrieval service + the E1 conversation read model —
 * both PUBLIC application services. It retrieves + ranks (via E2), removes
 * duplicates + respects the token budget + prioritizes collections + includes
 * citations (all done inside E2's retrieveContext), and adds workspace metadata +
 * recent conversations, preserving ordering.
 *
 *   Strategist → Context Assembler → Knowledge Base (E2) → Prompt/Execution (E1)
 * ========================================================================== */

import { retrieveContext } from "../knowledge/retrieval-usecases.js";
import { listConversations } from "../ai-foundation/ai-read.js";
import type { AppContext } from "../context.js";
import type { StrategyContextDTO } from "./dto.js";

export interface AssembleContextInput {
  workspaceId: string;
  goal: string;
  collectionIds?: string[];
  topK?: number;
  maxTokens?: number;
  threshold?: number;
}

/**
 * Build planning context for a strategy run. Goes exclusively through E1/E2 public
 * application services — no direct vector or prompt access. Recent conversations
 * are best-effort (skipped if the AI store is not wired).
 */
export async function assembleStrategyContext(ctx: AppContext, input: AssembleContextInput): Promise<StrategyContextDTO> {
  const retrieval = await retrieveContext(ctx, {
    query: input.goal, workspaceId: input.workspaceId, collectionIds: input.collectionIds,
    topK: input.topK ?? 12, maxTokens: input.maxTokens ?? 6000, threshold: input.threshold ?? 0, maxPerDocument: 3,
  });

  let recentConversations: { id: string; title: string }[] = [];
  if (ctx.ai !== undefined) {
    try {
      const conversations = await listConversations(ctx, input.workspaceId);
      recentConversations = conversations.slice(0, 5).map((c) => ({ id: c.id, title: c.title }));
    } catch {
      recentConversations = []; // conversations are optional context
    }
  }

  return {
    chunks: retrieval.chunks.map((c) => ({ chunkId: c.chunkId, documentId: c.documentId, collectionId: c.collectionId, page: c.page, heading: c.heading, score: c.score, content: c.content })),
    retrievalSessionId: retrieval.sessionId,
    retrievalLatencyMs: retrieval.latencyMs,
    provider: retrieval.provider,
    model: retrieval.model,
    totalTokens: retrieval.totalTokens,
    workspaceMetadata: { workspaceId: input.workspaceId, collectionIds: input.collectionIds ?? [] },
    recentConversations,
  };
}
