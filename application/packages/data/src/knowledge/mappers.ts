/* =============================================================================
 * Knowledge Base — row ↔ domain mappers (Phase E · Sprint E2).
 * Embeddings are stored as a jsonb float array (portable; a pgvector-native index
 * is a future backend behind the same port). The type-safe boundary.
 * ========================================================================== */

import type {
  DocumentChunk, DocumentVersion, EmbeddingJob, EmbeddingVector, KnowledgeCitation, KnowledgeCollection,
  KnowledgeDocument, KnowledgePermission, KnowledgeSource, RetrievalSession, RetrievedContext,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const numArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const nint = (v: unknown): number | null => (v === null || v === undefined ? null : int(v));
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function collectionRow(c: KnowledgeCollection): Record<string, unknown> {
  return { id: c.id, workspace_id: c.workspaceId, client_id: c.clientId, name: c.name, description: c.description, kind: c.kind, visibility: c.visibility, owner_user_id: c.ownerUserId, document_count: c.documentCount, status: c.status, version: c.version, created_at: c.createdAt, updated_at: c.updatedAt };
}
export function toCollection(r: Record<string, unknown>): KnowledgeCollection {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), description: nstr(r["description"]), kind: r["kind"] as KnowledgeCollection["kind"], visibility: r["visibility"] as KnowledgeCollection["visibility"], ownerUserId: String(r["owner_user_id"]), documentCount: int(r["document_count"]), status: r["status"] as KnowledgeCollection["status"], version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function documentRow(d: KnowledgeDocument): Record<string, unknown> {
  return { id: d.id, collection_id: d.collectionId, workspace_id: d.workspaceId, client_id: d.clientId, title: d.title, source_type: d.sourceType, mime_type: d.mimeType, language: d.language, size_bytes: d.sizeBytes, checksum: d.checksum, status: d.status, current_version: d.currentVersion, owner_user_id: d.ownerUserId, metadata: d.metadata, version: d.version, created_at: d.createdAt, updated_at: d.updatedAt };
}
export function toDocument(r: Record<string, unknown>): KnowledgeDocument {
  return { id: String(r["id"]), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), sourceType: r["source_type"] as KnowledgeDocument["sourceType"], mimeType: String(r["mime_type"]), language: nstr(r["language"]), sizeBytes: int(r["size_bytes"]), checksum: String(r["checksum"]), status: r["status"] as KnowledgeDocument["status"], currentVersion: int(r["current_version"], 1), ownerUserId: String(r["owner_user_id"]), metadata: obj(r["metadata"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function versionRow(v: DocumentVersion): Record<string, unknown> {
  return { id: v.id, document_id: v.documentId, workspace_id: v.workspaceId, client_id: v.clientId, version: v.version, checksum: v.checksum, size_bytes: v.sizeBytes, mime_type: v.mimeType, storage_ref: v.storageRef, parse_status: v.parseStatus, parse_metadata: v.parseMetadata, created_by_user_id: v.createdByUserId, created_at: v.createdAt };
}
export function toVersion(r: Record<string, unknown>): DocumentVersion {
  return { id: String(r["id"]), documentId: String(r["document_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), version: int(r["version"]), checksum: String(r["checksum"]), sizeBytes: int(r["size_bytes"]), mimeType: String(r["mime_type"]), storageRef: nstr(r["storage_ref"]), parseStatus: r["parse_status"] as DocumentVersion["parseStatus"], parseMetadata: obj(r["parse_metadata"]), createdByUserId: String(r["created_by_user_id"]), createdAt: String(r["created_at"]) };
}

export function chunkRow(c: DocumentChunk): Record<string, unknown> {
  return { id: c.id, document_id: c.documentId, document_version: c.documentVersion, collection_id: c.collectionId, workspace_id: c.workspaceId, client_id: c.clientId, index: c.index, content: c.content, page: c.page, heading: c.heading, token_count: c.tokenCount, checksum: c.checksum, strategy: c.strategy, created_at: c.createdAt };
}
export function toChunk(r: Record<string, unknown>): DocumentChunk {
  return { id: String(r["id"]), documentId: String(r["document_id"]), documentVersion: int(r["document_version"], 1), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), index: int(r["index"]), content: String(r["content"] ?? ""), page: nint(r["page"]), heading: nstr(r["heading"]), tokenCount: int(r["token_count"]), checksum: String(r["checksum"]), strategy: r["strategy"] as DocumentChunk["strategy"], createdAt: String(r["created_at"]) };
}

export function vectorRow(v: EmbeddingVector): Record<string, unknown> {
  return { id: v.id, chunk_id: v.chunkId, document_id: v.documentId, collection_id: v.collectionId, workspace_id: v.workspaceId, client_id: v.clientId, provider: v.provider, model: v.model, dimensions: v.dimensions, embedding: v.embedding, created_at: v.createdAt };
}
export function toVector(r: Record<string, unknown>): EmbeddingVector {
  return { id: String(r["id"]), chunkId: String(r["chunk_id"]), documentId: String(r["document_id"]), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), provider: r["provider"] as EmbeddingVector["provider"], model: String(r["model"]), dimensions: int(r["dimensions"]), embedding: numArr(r["embedding"]), createdAt: String(r["created_at"]) };
}

export function jobRow(j: EmbeddingJob): Record<string, unknown> {
  return { id: j.id, document_id: j.documentId, document_version: j.documentVersion, collection_id: j.collectionId, workspace_id: j.workspaceId, client_id: j.clientId, status: j.status, provider: j.provider, model: j.model, strategy: j.strategy, chunk_count: j.chunkCount, retry_count: j.retryCount, duration_ms: j.durationMs, cost: j.cost, currency: j.currency, error: j.error, version: j.version, created_at: j.createdAt, updated_at: j.updatedAt };
}
export function toJob(r: Record<string, unknown>): EmbeddingJob {
  return { id: String(r["id"]), documentId: String(r["document_id"]), documentVersion: int(r["document_version"], 1), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), status: r["status"] as EmbeddingJob["status"], provider: r["provider"] as EmbeddingJob["provider"], model: String(r["model"]), strategy: r["strategy"] as EmbeddingJob["strategy"], chunkCount: int(r["chunk_count"]), retryCount: int(r["retry_count"]), durationMs: int(r["duration_ms"]), cost: num(r["cost"]), currency: String(r["currency"] ?? "USD"), error: nstr(r["error"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function sessionRow(s: RetrievalSession): Record<string, unknown> {
  return { id: s.id, workspace_id: s.workspaceId, client_id: s.clientId, query: s.query, collection_ids: s.collectionIds, top_k: s.topK, threshold: s.threshold, max_tokens: s.maxTokens, provider: s.provider, model: s.model, result_count: s.resultCount, latency_ms: s.latencyMs, cache_hit: s.cacheHit, requested_by_user_id: s.requestedByUserId, created_at: s.createdAt };
}
export function toSession(r: Record<string, unknown>): RetrievalSession {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), query: String(r["query"] ?? ""), collectionIds: strArr(r["collection_ids"]), topK: int(r["top_k"], 8), threshold: num(r["threshold"]), maxTokens: int(r["max_tokens"], 4000), provider: r["provider"] as RetrievalSession["provider"], model: String(r["model"]), resultCount: int(r["result_count"]), latencyMs: int(r["latency_ms"]), cacheHit: r["cache_hit"] === true, requestedByUserId: String(r["requested_by_user_id"]), createdAt: String(r["created_at"]) };
}

export function contextRow(c: RetrievedContext): Record<string, unknown> {
  return { id: c.id, session_id: c.sessionId, chunk_id: c.chunkId, document_id: c.documentId, collection_id: c.collectionId, workspace_id: c.workspaceId, client_id: c.clientId, score: c.score, rank: c.rank, token_count: c.tokenCount, content: c.content, created_at: c.createdAt };
}
export function toContext(r: Record<string, unknown>): RetrievedContext {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), chunkId: String(r["chunk_id"]), documentId: String(r["document_id"]), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), score: num(r["score"]), rank: int(r["rank"]), tokenCount: int(r["token_count"]), content: String(r["content"] ?? ""), createdAt: String(r["created_at"]) };
}

export function citationRow(c: KnowledgeCitation): Record<string, unknown> {
  return { id: c.id, session_id: c.sessionId, chunk_id: c.chunkId, document_id: c.documentId, collection_id: c.collectionId, workspace_id: c.workspaceId, client_id: c.clientId, page: c.page, heading: c.heading, source_type: c.sourceType, score: c.score, created_at: c.createdAt };
}
export function toCitation(r: Record<string, unknown>): KnowledgeCitation {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), chunkId: String(r["chunk_id"]), documentId: String(r["document_id"]), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), page: nint(r["page"]), heading: nstr(r["heading"]), sourceType: r["source_type"] as KnowledgeCitation["sourceType"], score: num(r["score"]), createdAt: String(r["created_at"]) };
}

export function permissionRow(p: KnowledgePermission): Record<string, unknown> {
  return { id: p.id, collection_id: p.collectionId, workspace_id: p.workspaceId, client_id: p.clientId, subject_type: p.subjectType, subject_id: p.subjectId, level: p.level, created_at: p.createdAt };
}
export function toPermission(r: Record<string, unknown>): KnowledgePermission {
  return { id: String(r["id"]), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), subjectType: r["subject_type"] as KnowledgePermission["subjectType"], subjectId: String(r["subject_id"]), level: r["level"] as KnowledgePermission["level"], createdAt: String(r["created_at"]) };
}

export function sourceRow(s: KnowledgeSource): Record<string, unknown> {
  return { id: s.id, collection_id: s.collectionId, workspace_id: s.workspaceId, client_id: s.clientId, source_type: s.sourceType, label: s.label, config: s.config, enabled: s.enabled, created_at: s.createdAt, updated_at: s.updatedAt };
}
export function toSource(r: Record<string, unknown>): KnowledgeSource {
  return { id: String(r["id"]), collectionId: String(r["collection_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), sourceType: r["source_type"] as KnowledgeSource["sourceType"], label: String(r["label"]), config: obj(r["config"]), enabled: r["enabled"] !== false, createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}
