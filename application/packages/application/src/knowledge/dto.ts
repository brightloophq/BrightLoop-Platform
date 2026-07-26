/* =============================================================================
 * Knowledge Base DTOs (Phase E · Sprint E2) — the outward boundary.
 * ========================================================================== */

import type {
  DocumentVersion, EmbeddingJob, KnowledgeCitation, KnowledgeCollection, KnowledgeDocument, RetrievalSession,
} from "@brightloop/schema";

export interface CollectionDTO {
  id: string; name: string; description: string | null; kind: KnowledgeCollection["kind"];
  visibility: KnowledgeCollection["visibility"]; ownerUserId: string; documentCount: number;
  status: KnowledgeCollection["status"]; version: number; createdAt: string; updatedAt: string;
}
export const toCollectionDTO = (c: KnowledgeCollection): CollectionDTO => ({ id: c.id, name: c.name, description: c.description, kind: c.kind, visibility: c.visibility, ownerUserId: c.ownerUserId, documentCount: c.documentCount, status: c.status, version: c.version, createdAt: c.createdAt, updatedAt: c.updatedAt });

export interface DocumentDTO {
  id: string; collectionId: string; title: string; sourceType: KnowledgeDocument["sourceType"]; mimeType: string;
  language: string | null; sizeBytes: number; checksum: string; status: KnowledgeDocument["status"];
  currentVersion: number; ownerUserId: string; version: number; createdAt: string; updatedAt: string;
}
export const toDocumentDTO = (d: KnowledgeDocument): DocumentDTO => ({ id: d.id, collectionId: d.collectionId, title: d.title, sourceType: d.sourceType, mimeType: d.mimeType, language: d.language, sizeBytes: d.sizeBytes, checksum: d.checksum, status: d.status, currentVersion: d.currentVersion, ownerUserId: d.ownerUserId, version: d.version, createdAt: d.createdAt, updatedAt: d.updatedAt });

export interface DocumentVersionDTO { id: string; version: number; checksum: string; sizeBytes: number; parseStatus: DocumentVersion["parseStatus"]; createdByUserId: string; createdAt: string; }
export const toDocumentVersionDTO = (v: DocumentVersion): DocumentVersionDTO => ({ id: v.id, version: v.version, checksum: v.checksum, sizeBytes: v.sizeBytes, parseStatus: v.parseStatus, createdByUserId: v.createdByUserId, createdAt: v.createdAt });

export interface UploadResultDTO { document: DocumentDTO; version: number; chunkCount: number; }

export interface EmbeddingJobDTO {
  id: string; documentId: string; documentVersion: number; status: EmbeddingJob["status"]; provider: EmbeddingJob["provider"];
  model: string; strategy: EmbeddingJob["strategy"]; chunkCount: number; retryCount: number; durationMs: number;
  cost: number; currency: string; error: string | null; createdAt: string; updatedAt: string;
}
export const toEmbeddingJobDTO = (j: EmbeddingJob): EmbeddingJobDTO => ({ id: j.id, documentId: j.documentId, documentVersion: j.documentVersion, status: j.status, provider: j.provider, model: j.model, strategy: j.strategy, chunkCount: j.chunkCount, retryCount: j.retryCount, durationMs: j.durationMs, cost: j.cost, currency: j.currency, error: j.error, createdAt: j.createdAt, updatedAt: j.updatedAt });

/** One retrieved, citation-ready context chunk. */
export interface ContextChunkDTO {
  chunkId: string; documentId: string; collectionId: string; content: string;
  page: number | null; heading: string | null; score: number; rank: number; tokenCount: number;
}

export interface RetrievalResultDTO {
  sessionId: string; query: string; resultCount: number; latencyMs: number; totalTokens: number;
  provider: RetrievalSession["provider"]; model: string; chunks: ContextChunkDTO[];
}

/** A lighter search result (no persisted session). */
export interface SearchResultDTO { query: string; resultCount: number; chunks: ContextChunkDTO[]; }

export interface CitationDTO {
  id: string; sessionId: string; chunkId: string; documentId: string; collectionId: string;
  page: number | null; heading: string | null; sourceType: KnowledgeCitation["sourceType"]; score: number;
}
export const toCitationDTO = (c: KnowledgeCitation): CitationDTO => ({ id: c.id, sessionId: c.sessionId, chunkId: c.chunkId, documentId: c.documentId, collectionId: c.collectionId, page: c.page, heading: c.heading, sourceType: c.sourceType, score: c.score });

export interface CitationBundleDTO { sessionId: string; citations: CitationDTO[]; }

export interface RetrievalHistoryItemDTO { id: string; query: string; resultCount: number; latencyMs: number; provider: RetrievalSession["provider"]; model: string; cacheHit: boolean; requestedByUserId: string; createdAt: string; }
export const toRetrievalHistoryItemDTO = (s: RetrievalSession): RetrievalHistoryItemDTO => ({ id: s.id, query: s.query, resultCount: s.resultCount, latencyMs: s.latencyMs, provider: s.provider, model: s.model, cacheHit: s.cacheHit, requestedByUserId: s.requestedByUserId, createdAt: s.createdAt });

export interface CollectionSummaryDTO { collection: CollectionDTO; documentCount: number; activeDocuments: number; chunkCount: number; vectorCount: number; }

export interface KnowledgeUsageDTO {
  collections: number; documents: number; chunks: number; vectors: number; embeddingJobs: number;
  retrievals: number; embeddingCost: number; currency: string; avgRetrievalLatencyMs: number;
}
