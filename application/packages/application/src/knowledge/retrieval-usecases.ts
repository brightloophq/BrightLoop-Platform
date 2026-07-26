/* =============================================================================
 * Retrieval use-cases (Phase E · Sprint E2).
 *
 * `searchKnowledge` embeds the query, searches the vector store (workspace-scoped),
 * and returns ranked, citation-ready chunks. `retrieveContext` additionally
 * assembles a token-bounded, deduped, diversity-capped context set and persists a
 * RetrievalSession + RetrievedContext for observability. `generateCitationBundle`
 * turns a session's context into persisted citations. Business logic never calls
 * an embedding SDK or names the vector backend.
 * ========================================================================== */

import { assembleContext, contextTokens, toCandidates, type RetrievalCandidate } from "@brightloop/domain";
import type { DocumentChunk, EmbeddingProviderKind, KnowledgeCitation, RetrievedContext } from "@brightloop/schema";
import {
  authorize, requireKnowledge, requireEmbeddingProviders, requireVectorStore, KNOWLEDGE_RETRIEVE_CAP, type AppContext,
} from "../context.js";
import { NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toCitationDTO, type CitationBundleDTO, type ContextChunkDTO, type RetrievalResultDTO, type SearchResultDTO } from "./dto.js";

export interface RetrieveInput {
  query: string; workspaceId: string; collectionIds?: string[]; topK?: number; threshold?: number;
  maxTokens?: number; maxPerDocument?: number; provider?: EmbeddingProviderKind; model?: string;
}

async function embedQuery(ctx: AppContext, provider: EmbeddingProviderKind | undefined, model: string, query: string): Promise<{ kind: EmbeddingProviderKind; embedding: number[]; model: string }> {
  const providers = requireEmbeddingProviders(ctx);
  const kind = provider ?? (Object.keys(providers)[0] as EmbeddingProviderKind | undefined);
  if (kind === undefined || providers[kind] === undefined) throw new RuntimeUnavailableError("No embedding provider is configured");
  const outcome = await providers[kind]!.embed([query], model);
  if (!outcome.ok) throw new RuntimeUnavailableError(`Query embedding failed: ${outcome.message}`);
  return { kind, embedding: outcome.value.vectors[0] ?? [], model: outcome.value.model };
}

function toContextChunk(c: RetrievalCandidate, rank: number): ContextChunkDTO {
  return { chunkId: c.chunk.id, documentId: c.chunk.documentId, collectionId: c.chunk.collectionId, content: c.chunk.content, page: c.chunk.page, heading: c.chunk.heading, score: Math.round(c.score * 1e6) / 1e6, rank, tokenCount: c.chunk.tokenCount };
}

/** Rank chunks for a query without persisting a session (lighter path). */
export async function searchKnowledge(ctx: AppContext, input: RetrieveInput): Promise<SearchResultDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const query = requireString(input.query, "query").trim();
  if (query === "") throw new ValidationError("A query is required");
  requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_RETRIEVE_CAP, ctx.actor.clientId);
  const vectorStore = requireVectorStore(ctx);
  const { embedding } = await embedQuery(ctx, input.provider, input.model ?? "text-embedding-3-small", query);
  const matches = await vectorStore.search({ embedding, workspaceId, collectionIds: input.collectionIds, topK: input.topK ?? 8, threshold: input.threshold ?? 0 });
  const chunks = unwrap(await requireKnowledge(ctx).chunks.listByIds(matches.map((m) => m.vector.chunkId)));
  const byId = new Map<string, DocumentChunk>(chunks.map((c) => [c.id, c]));
  const candidates = toCandidates(matches, byId);
  return { query, resultCount: candidates.length, chunks: candidates.map((c, i) => toContextChunk(c, i)) };
}

/** Full retrieval: embed → search → assemble bounded context → persist session. */
export async function retrieveContext(ctx: AppContext, input: RetrieveInput): Promise<RetrievalResultDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const query = requireString(input.query, "query").trim();
  if (query === "") throw new ValidationError("A query is required");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_RETRIEVE_CAP, ctx.actor.clientId);
  const vectorStore = requireVectorStore(ctx);

  const startedAt = ctx.clock();
  const topK = input.topK ?? 8;
  const threshold = input.threshold ?? 0;
  const maxTokens = input.maxTokens ?? 4000;
  const { kind, embedding, model } = await embedQuery(ctx, input.provider, input.model ?? "text-embedding-3-small", query);
  const matches = await vectorStore.search({ embedding, workspaceId, collectionIds: input.collectionIds, topK, threshold });
  const chunks = unwrap(await kb.chunks.listByIds(matches.map((m) => m.vector.chunkId)));
  const byId = new Map<string, DocumentChunk>(chunks.map((c) => [c.id, c]));
  const kept = assembleContext(toCandidates(matches, byId), { maxTokens, maxPerDocument: input.maxPerDocument ?? 3, threshold, collectionPriority: input.collectionIds ?? [] });
  const endedAt = ctx.clock();
  const latencyMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));

  const sessionId = ctx.ids("ksess");
  unwrap(await kb.sessions.append({ id: sessionId, workspaceId, clientId: ctx.actor.clientId, query, collectionIds: input.collectionIds ?? [], topK, threshold, maxTokens, provider: kind, model, resultCount: kept.length, latencyMs, cacheHit: false, requestedByUserId: ctx.actor.userId, createdAt: endedAt }));
  const contexts: RetrievedContext[] = kept.map((c, rank) => ({ id: ctx.ids("kctx"), sessionId, chunkId: c.chunk.id, documentId: c.chunk.documentId, collectionId: c.chunk.collectionId, workspaceId, clientId: ctx.actor.clientId, score: c.score, rank, tokenCount: c.chunk.tokenCount, content: c.chunk.content, createdAt: endedAt }));
  if (contexts.length > 0) unwrap(await kb.contexts.appendMany(contexts));

  return { sessionId, query, resultCount: kept.length, latencyMs, totalTokens: contextTokens(kept), provider: kind, model, chunks: kept.map((c, i) => toContextChunk(c, i)) };
}

/** Turn a retrieval session's context into persisted, citation-ready records. */
export async function generateCitationBundle(ctx: AppContext, rawSessionId: unknown): Promise<CitationBundleDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const kb = requireKnowledge(ctx);
  const session = unwrap(await kb.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("retrieval session");
  authorize(ctx.actor, KNOWLEDGE_RETRIEVE_CAP, session.clientId);
  const contexts = unwrap(await kb.contexts.listBySession(sessionId));
  const chunks = unwrap(await kb.chunks.listByIds(contexts.map((c) => c.chunkId)));
  const byId = new Map<string, DocumentChunk>(chunks.map((c) => [c.id, c]));
  const documents = new Map<string, string>(); // documentId → sourceType
  for (const ctxRow of contexts) {
    if (!documents.has(ctxRow.documentId)) {
      const doc = unwrap(await kb.documents.getById(ctxRow.documentId));
      documents.set(ctxRow.documentId, doc?.sourceType ?? "txt");
    }
  }
  const citations: KnowledgeCitation[] = contexts.map((c) => {
    const chunk = byId.get(c.chunkId);
    return { id: ctx.ids("kcite"), sessionId, chunkId: c.chunkId, documentId: c.documentId, collectionId: c.collectionId, workspaceId: session.workspaceId, clientId: session.clientId, page: chunk?.page ?? null, heading: chunk?.heading ?? null, sourceType: (documents.get(c.documentId) ?? "txt") as KnowledgeCitation["sourceType"], score: c.score, createdAt: ctx.clock() };
  });
  if (citations.length > 0) unwrap(await kb.citations.appendMany(citations));
  return { sessionId, citations: citations.map(toCitationDTO) };
}
