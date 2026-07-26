/* =============================================================================
 * Knowledge Base — REPOSITORY PORTS (Phase E · Sprint E2).
 *
 * Persistence contracts; Supabase adapters live in `@brightloop/data`. Every
 * method returns `RuntimeResult`. Collections / documents / embedding jobs are
 * versioned (optimistic concurrency); versions, chunks, vectors, retrieval
 * sessions, retrieved context, citations, permissions + sources are append-only
 * (or insert/delete). RLS is the tenant boundary; adapters add no filters. The
 * vector STORE is a separate port (`VectorStorePort`) — business logic never
 * knows the backend.
 * ========================================================================== */

import type {
  DocumentChunk, DocumentVersion, EmbeddingJob, EmbeddingVector, KnowledgeCitation, KnowledgeCollection,
  KnowledgeDocument, KnowledgePermission, KnowledgeSource, RetrievalSession, RetrievedContext,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface KnowledgeCollectionRepository {
  create(collection: KnowledgeCollection): Promise<RuntimeResult<KnowledgeCollection>>;
  getById(id: string): Promise<RuntimeResult<KnowledgeCollection | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<KnowledgeCollection[]>>;
  save(next: KnowledgeCollection, expectedVersion: number): Promise<RuntimeResult<KnowledgeCollection>>;
}

export interface KnowledgeDocumentRepository {
  create(document: KnowledgeDocument): Promise<RuntimeResult<KnowledgeDocument>>;
  getById(id: string): Promise<RuntimeResult<KnowledgeDocument | null>>;
  listByCollection(collectionId: string): Promise<RuntimeResult<KnowledgeDocument[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<KnowledgeDocument[]>>;
  save(next: KnowledgeDocument, expectedVersion: number): Promise<RuntimeResult<KnowledgeDocument>>;
}

export interface DocumentVersionRepository {
  append(version: DocumentVersion): Promise<RuntimeResult<DocumentVersion>>;
  listByDocument(documentId: string): Promise<RuntimeResult<DocumentVersion[]>>;
  getByDocumentAndVersion(documentId: string, version: number): Promise<RuntimeResult<DocumentVersion | null>>;
}

export interface DocumentChunkRepository {
  appendMany(chunks: readonly DocumentChunk[]): Promise<RuntimeResult<DocumentChunk[]>>;
  listByDocument(documentId: string): Promise<RuntimeResult<DocumentChunk[]>>;
  listByIds(ids: readonly string[]): Promise<RuntimeResult<DocumentChunk[]>>;
  deleteByDocument(documentId: string): Promise<RuntimeResult<null>>;
}

export interface EmbeddingVectorRepository {
  appendMany(vectors: readonly EmbeddingVector[]): Promise<RuntimeResult<EmbeddingVector[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<EmbeddingVector[]>>;
  deleteByDocument(documentId: string): Promise<RuntimeResult<null>>;
}

export interface EmbeddingJobRepository {
  create(job: EmbeddingJob): Promise<RuntimeResult<EmbeddingJob>>;
  getById(id: string): Promise<RuntimeResult<EmbeddingJob | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<EmbeddingJob[]>>;
  save(next: EmbeddingJob, expectedVersion: number): Promise<RuntimeResult<EmbeddingJob>>;
}

export interface RetrievalSessionRepository {
  append(session: RetrievalSession): Promise<RuntimeResult<RetrievalSession>>;
  getById(id: string): Promise<RuntimeResult<RetrievalSession | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RetrievalSession[]>>;
}

export interface RetrievedContextRepository {
  appendMany(rows: readonly RetrievedContext[]): Promise<RuntimeResult<RetrievedContext[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<RetrievedContext[]>>;
}

export interface KnowledgeCitationRepository {
  appendMany(citations: readonly KnowledgeCitation[]): Promise<RuntimeResult<KnowledgeCitation[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<KnowledgeCitation[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<KnowledgeCitation[]>>;
}

export interface KnowledgePermissionRepository {
  create(permission: KnowledgePermission): Promise<RuntimeResult<KnowledgePermission>>;
  remove(id: string): Promise<RuntimeResult<null>>;
  listByCollection(collectionId: string): Promise<RuntimeResult<KnowledgePermission[]>>;
}

export interface KnowledgeSourceRepository {
  create(source: KnowledgeSource): Promise<RuntimeResult<KnowledgeSource>>;
  listByCollection(collectionId: string): Promise<RuntimeResult<KnowledgeSource[]>>;
}

/** The ports the Knowledge application use-cases are wired with. */
export interface KnowledgeRepositories {
  collections: KnowledgeCollectionRepository;
  documents: KnowledgeDocumentRepository;
  versions: DocumentVersionRepository;
  chunks: DocumentChunkRepository;
  vectors: EmbeddingVectorRepository;
  jobs: EmbeddingJobRepository;
  sessions: RetrievalSessionRepository;
  contexts: RetrievedContextRepository;
  citations: KnowledgeCitationRepository;
  permissions: KnowledgePermissionRepository;
  sources: KnowledgeSourceRepository;
}
