/* =============================================================================
 * Knowledge Base read models (Phase E · Sprint E2).
 *
 * Read-only projections: document library, collection summary, embedding queue,
 * retrieval history, knowledge usage, and citation history. Load-then-authorize;
 * DTOs only. Deleted documents are excluded from the default library view.
 * ========================================================================== */

import {
  authorize, requireKnowledge, KNOWLEDGE_READ_CAP, type AppContext,
} from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toCitationDTO, toCollectionDTO, toDocumentDTO, toEmbeddingJobDTO, toRetrievalHistoryItemDTO,
  type CitationDTO, type CollectionDTO, type CollectionSummaryDTO, type DocumentDTO, type EmbeddingJobDTO,
  type KnowledgeUsageDTO, type RetrievalHistoryItemDTO,
} from "./dto.js";

/** Workspace collections (newest first). */
export async function listCollections(ctx: AppContext, rawWorkspaceId: unknown): Promise<CollectionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await kb.collections.listByWorkspace(workspaceId));
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toCollectionDTO);
}

/** The document library for a collection (excludes soft-deleted by default). */
export async function listDocumentLibrary(ctx: AppContext, rawCollectionId: unknown, includeDeleted = false): Promise<DocumentDTO[]> {
  const collectionId = requireId(rawCollectionId, "collectionId");
  const kb = requireKnowledge(ctx);
  const collection = unwrap(await kb.collections.getById(collectionId));
  if (collection === null) throw new NotFoundError("collection");
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, collection.clientId);
  const rows = unwrap(await kb.documents.listByCollection(collectionId));
  return rows.filter((d) => includeDeleted || d.status !== "deleted").sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(toDocumentDTO);
}

/** Collection summary with document/chunk/vector counts. */
export async function getCollectionSummary(ctx: AppContext, rawCollectionId: unknown): Promise<CollectionSummaryDTO> {
  const collectionId = requireId(rawCollectionId, "collectionId");
  const kb = requireKnowledge(ctx);
  const collection = unwrap(await kb.collections.getById(collectionId));
  if (collection === null) throw new NotFoundError("collection");
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, collection.clientId);
  const documents = unwrap(await kb.documents.listByCollection(collectionId));
  let chunkCount = 0;
  let vectorCount = 0;
  const workspaceVectors = unwrap(await kb.vectors.listByWorkspace(collection.workspaceId));
  for (const doc of documents) {
    chunkCount += unwrap(await kb.chunks.listByDocument(doc.id)).length;
    vectorCount += workspaceVectors.filter((v) => v.documentId === doc.id).length;
  }
  return { collection: toCollectionDTO(collection), documentCount: documents.length, activeDocuments: documents.filter((d) => d.status === "active").length, chunkCount, vectorCount };
}

/** The embedding queue for a workspace (newest first). */
export async function listEmbeddingQueue(ctx: AppContext, rawWorkspaceId: unknown): Promise<EmbeddingJobDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await kb.jobs.listByWorkspace(workspaceId));
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toEmbeddingJobDTO);
}

/** Retrieval history for a workspace (paginated newest-first slice). */
export async function listRetrievalHistory(ctx: AppContext, rawWorkspaceId: unknown, limit = 25): Promise<RetrievalHistoryItemDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await kb.sessions.listByWorkspace(workspaceId));
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, Math.max(1, Math.min(limit, 200))).map(toRetrievalHistoryItemDTO);
}

/** Citation history for a workspace (newest first). */
export async function listCitationHistory(ctx: AppContext, rawWorkspaceId: unknown): Promise<CitationDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await kb.citations.listByWorkspace(workspaceId));
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toCitationDTO);
}

/** Aggregate knowledge usage + embedding cost + avg retrieval latency. */
export async function getKnowledgeUsage(ctx: AppContext, rawWorkspaceId: unknown): Promise<KnowledgeUsageDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_READ_CAP, ctx.actor.clientId);
  const [collections, documents, vectors, jobs, sessions] = await Promise.all([
    kb.collections.listByWorkspace(workspaceId).then(unwrap),
    kb.documents.listByWorkspace(workspaceId).then(unwrap),
    kb.vectors.listByWorkspace(workspaceId).then(unwrap),
    kb.jobs.listByWorkspace(workspaceId).then(unwrap),
    kb.sessions.listByWorkspace(workspaceId).then(unwrap),
  ]);
  let chunks = 0;
  for (const doc of documents) chunks += unwrap(await kb.chunks.listByDocument(doc.id)).length;
  const embeddingCost = Math.round(jobs.reduce((s, j) => s + j.cost, 0) * 1e6) / 1e6;
  const avgLatency = sessions.length === 0 ? 0 : Math.round(sessions.reduce((s, r) => s + r.latencyMs, 0) / sessions.length);
  return { collections: collections.length, documents: documents.length, chunks, vectors: vectors.length, embeddingJobs: jobs.length, retrievals: sessions.length, embeddingCost, currency: "USD", avgRetrievalLatencyMs: avgLatency };
}
