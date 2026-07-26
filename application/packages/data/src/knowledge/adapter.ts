/* =============================================================================
 * Supabase Knowledge Base repositories + vector store + embedding provider
 * (Phase E · Sprint E2).
 *
 * Eleven repository adapters (untyped-cast pattern; mappers are the boundary).
 * Collections/documents/jobs use optimistic concurrency; versions/chunks/vectors/
 * sessions/contexts/citations/permissions/sources are append-only or insert/delete.
 * The vector STORE is a read-over-embedding_vector adapter (durable writes flow
 * through EmbeddingVectorRepository); its `upsert`/`delete` are no-ops so there is
 * one source of truth. A pgvector-native or Pinecone backend can replace it behind
 * the same port with zero business-code change.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok, rankVectors,
  type DocumentChunkRepository, type DocumentVersionRepository, type EmbeddingJobRepository, type EmbeddingProviderPort,
  type EmbeddingVectorRepository, type KnowledgeCitationRepository, type KnowledgeCollectionRepository,
  type KnowledgeDocumentRepository, type KnowledgePermissionRepository, type KnowledgeSourceRepository,
  type RetrievalSessionRepository, type RetrievedContextRepository, type RuntimeResult, type VectorMatch, type VectorQuery, type VectorStorePort,
} from "@brightloop/domain";
import type {
  DocumentChunk, DocumentVersion, EmbeddingJob, EmbeddingProviderKind, EmbeddingVector, KnowledgeCitation,
  KnowledgeCollection, KnowledgeDocument, KnowledgePermission, KnowledgeSource, RetrievalSession, RetrievedContext,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const COL = "knowledge_collection";
const DOC = "knowledge_document";
const VER = "document_version";
const CHUNK = "document_chunk";
const VEC = "embedding_vector";
const JOB = "embedding_job";
const SESS = "retrieval_session";
const CTX = "retrieved_context";
const CITE = "citation";
const PERM = "knowledge_permission";
const SRC = "knowledge_source";

export class SupabaseKnowledgeCollectionRepository implements KnowledgeCollectionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(c: KnowledgeCollection): Promise<RuntimeResult<KnowledgeCollection>> {
    const { data, error } = await this.db.from(COL).insert(m.collectionRow(c)).select("*").single();
    if (error) return mapDatabaseError(error, "collection.create");
    return ok("created", m.toCollection(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<KnowledgeCollection | null>> {
    const { data, error } = await this.db.from(COL).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "collection.getById");
    return ok("found", data ? m.toCollection(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<KnowledgeCollection[]>> {
    const { data, error } = await this.db.from(COL).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "collection.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toCollection(r as Record<string, unknown>)));
  }
  async save(next: KnowledgeCollection, expectedVersion: number): Promise<RuntimeResult<KnowledgeCollection>> {
    const { data, error } = await this.db.from(COL).update({ name: next.name, description: next.description, visibility: next.visibility, document_count: next.documentCount, status: next.status, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "collection.save");
    if (data === null) return err("conflict", "collection.save: version mismatch");
    return ok("updated", m.toCollection(data as Record<string, unknown>));
  }
}

export class SupabaseKnowledgeDocumentRepository implements KnowledgeDocumentRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(d: KnowledgeDocument): Promise<RuntimeResult<KnowledgeDocument>> {
    const { data, error } = await this.db.from(DOC).insert(m.documentRow(d)).select("*").single();
    if (error) return mapDatabaseError(error, "document.create");
    return ok("created", m.toDocument(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<KnowledgeDocument | null>> {
    const { data, error } = await this.db.from(DOC).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "document.getById");
    return ok("found", data ? m.toDocument(data as Record<string, unknown>) : null);
  }
  async listByCollection(collectionId: string): Promise<RuntimeResult<KnowledgeDocument[]>> {
    const { data, error } = await this.db.from(DOC).select("*").eq("collection_id", collectionId).order("updated_at", { ascending: false });
    if (error) return mapDatabaseError(error, "document.listByCollection");
    return ok("found", (data ?? []).map((r) => m.toDocument(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<KnowledgeDocument[]>> {
    const { data, error } = await this.db.from(DOC).select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) return mapDatabaseError(error, "document.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toDocument(r as Record<string, unknown>)));
  }
  async save(next: KnowledgeDocument, expectedVersion: number): Promise<RuntimeResult<KnowledgeDocument>> {
    const { data, error } = await this.db.from(DOC).update({ title: next.title, mime_type: next.mimeType, size_bytes: next.sizeBytes, checksum: next.checksum, status: next.status, current_version: next.currentVersion, metadata: next.metadata, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "document.save");
    if (data === null) return err("conflict", "document.save: version mismatch");
    return ok("updated", m.toDocument(data as Record<string, unknown>));
  }
}

export class SupabaseDocumentVersionRepository implements DocumentVersionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(v: DocumentVersion): Promise<RuntimeResult<DocumentVersion>> {
    const { data, error } = await this.db.from(VER).insert(m.versionRow(v)).select("*").single();
    if (error) { if (error.code === "23505") return err("conflict", "document version already exists"); return mapDatabaseError(error, "version.append"); }
    return ok("created", m.toVersion(data as Record<string, unknown>));
  }
  async listByDocument(documentId: string): Promise<RuntimeResult<DocumentVersion[]>> {
    const { data, error } = await this.db.from(VER).select("*").eq("document_id", documentId).order("version", { ascending: true });
    if (error) return mapDatabaseError(error, "version.listByDocument");
    return ok("found", (data ?? []).map((r) => m.toVersion(r as Record<string, unknown>)));
  }
  async getByDocumentAndVersion(documentId: string, version: number): Promise<RuntimeResult<DocumentVersion | null>> {
    const { data, error } = await this.db.from(VER).select("*").eq("document_id", documentId).eq("version", version).maybeSingle();
    if (error) return mapDatabaseError(error, "version.getByDocumentAndVersion");
    return ok("found", data ? m.toVersion(data as Record<string, unknown>) : null);
  }
}

export class SupabaseDocumentChunkRepository implements DocumentChunkRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly DocumentChunk[]): Promise<RuntimeResult<DocumentChunk[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(CHUNK).insert(rows.map(m.chunkRow)).select("*");
    if (error) return mapDatabaseError(error, "chunk.appendMany");
    return ok("created", (data ?? []).map((r) => m.toChunk(r as Record<string, unknown>)));
  }
  async listByDocument(documentId: string): Promise<RuntimeResult<DocumentChunk[]>> {
    const { data, error } = await this.db.from(CHUNK).select("*").eq("document_id", documentId).order("index", { ascending: true });
    if (error) return mapDatabaseError(error, "chunk.listByDocument");
    return ok("found", (data ?? []).map((r) => m.toChunk(r as Record<string, unknown>)));
  }
  async listByIds(ids: readonly string[]): Promise<RuntimeResult<DocumentChunk[]>> {
    if (ids.length === 0) return ok("found", []);
    const { data, error } = await this.db.from(CHUNK).select("*").in("id", [...ids]);
    if (error) return mapDatabaseError(error, "chunk.listByIds");
    return ok("found", (data ?? []).map((r) => m.toChunk(r as Record<string, unknown>)));
  }
  async deleteByDocument(documentId: string): Promise<RuntimeResult<null>> {
    const { error } = await this.db.from(CHUNK).delete().eq("document_id", documentId);
    if (error) return mapDatabaseError(error, "chunk.deleteByDocument");
    return ok("updated", null);
  }
}

export class SupabaseEmbeddingVectorRepository implements EmbeddingVectorRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly EmbeddingVector[]): Promise<RuntimeResult<EmbeddingVector[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(VEC).insert(rows.map(m.vectorRow)).select("*");
    if (error) return mapDatabaseError(error, "vector.appendMany");
    return ok("created", (data ?? []).map((r) => m.toVector(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<EmbeddingVector[]>> {
    const { data, error } = await this.db.from(VEC).select("*").eq("workspace_id", workspaceId);
    if (error) return mapDatabaseError(error, "vector.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toVector(r as Record<string, unknown>)));
  }
  async deleteByDocument(documentId: string): Promise<RuntimeResult<null>> {
    const { error } = await this.db.from(VEC).delete().eq("document_id", documentId);
    if (error) return mapDatabaseError(error, "vector.deleteByDocument");
    return ok("updated", null);
  }
}

export class SupabaseEmbeddingJobRepository implements EmbeddingJobRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(j: EmbeddingJob): Promise<RuntimeResult<EmbeddingJob>> {
    const { data, error } = await this.db.from(JOB).insert(m.jobRow(j)).select("*").single();
    if (error) return mapDatabaseError(error, "job.create");
    return ok("created", m.toJob(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<EmbeddingJob | null>> {
    const { data, error } = await this.db.from(JOB).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "job.getById");
    return ok("found", data ? m.toJob(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<EmbeddingJob[]>> {
    const { data, error } = await this.db.from(JOB).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "job.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toJob(r as Record<string, unknown>)));
  }
  async save(next: EmbeddingJob, expectedVersion: number): Promise<RuntimeResult<EmbeddingJob>> {
    const { data, error } = await this.db.from(JOB).update({ status: next.status, chunk_count: next.chunkCount, retry_count: next.retryCount, duration_ms: next.durationMs, cost: next.cost, error: next.error, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "job.save");
    if (data === null) return err("conflict", "job.save: version mismatch");
    return ok("updated", m.toJob(data as Record<string, unknown>));
  }
}

export class SupabaseRetrievalSessionRepository implements RetrievalSessionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(s: RetrievalSession): Promise<RuntimeResult<RetrievalSession>> {
    const { data, error } = await this.db.from(SESS).insert(m.sessionRow(s)).select("*").single();
    if (error) return mapDatabaseError(error, "session.append");
    return ok("created", m.toSession(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<RetrievalSession | null>> {
    const { data, error } = await this.db.from(SESS).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "session.getById");
    return ok("found", data ? m.toSession(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<RetrievalSession[]>> {
    const { data, error } = await this.db.from(SESS).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "session.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toSession(r as Record<string, unknown>)));
  }
}

export class SupabaseRetrievedContextRepository implements RetrievedContextRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly RetrievedContext[]): Promise<RuntimeResult<RetrievedContext[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(CTX).insert(rows.map(m.contextRow)).select("*");
    if (error) return mapDatabaseError(error, "context.appendMany");
    return ok("created", (data ?? []).map((r) => m.toContext(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<RetrievedContext[]>> {
    const { data, error } = await this.db.from(CTX).select("*").eq("session_id", sessionId).order("rank", { ascending: true });
    if (error) return mapDatabaseError(error, "context.listBySession");
    return ok("found", (data ?? []).map((r) => m.toContext(r as Record<string, unknown>)));
  }
}

export class SupabaseKnowledgeCitationRepository implements KnowledgeCitationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly KnowledgeCitation[]): Promise<RuntimeResult<KnowledgeCitation[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(CITE).insert(rows.map(m.citationRow)).select("*");
    if (error) return mapDatabaseError(error, "citation.appendMany");
    return ok("created", (data ?? []).map((r) => m.toCitation(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<KnowledgeCitation[]>> {
    const { data, error } = await this.db.from(CITE).select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "citation.listBySession");
    return ok("found", (data ?? []).map((r) => m.toCitation(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<KnowledgeCitation[]>> {
    const { data, error } = await this.db.from(CITE).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "citation.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toCitation(r as Record<string, unknown>)));
  }
}

export class SupabaseKnowledgePermissionRepository implements KnowledgePermissionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(p: KnowledgePermission): Promise<RuntimeResult<KnowledgePermission>> {
    const { data, error } = await this.db.from(PERM).insert(m.permissionRow(p)).select("*").single();
    if (error) return mapDatabaseError(error, "permission.create");
    return ok("created", m.toPermission(data as Record<string, unknown>));
  }
  async remove(id: string): Promise<RuntimeResult<null>> {
    const { error } = await this.db.from(PERM).delete().eq("id", id);
    if (error) return mapDatabaseError(error, "permission.remove");
    return ok("updated", null);
  }
  async listByCollection(collectionId: string): Promise<RuntimeResult<KnowledgePermission[]>> {
    const { data, error } = await this.db.from(PERM).select("*").eq("collection_id", collectionId);
    if (error) return mapDatabaseError(error, "permission.listByCollection");
    return ok("found", (data ?? []).map((r) => m.toPermission(r as Record<string, unknown>)));
  }
}

export class SupabaseKnowledgeSourceRepository implements KnowledgeSourceRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(s: KnowledgeSource): Promise<RuntimeResult<KnowledgeSource>> {
    const { data, error } = await this.db.from(SRC).insert(m.sourceRow(s)).select("*").single();
    if (error) return mapDatabaseError(error, "source.create");
    return ok("created", m.toSource(data as Record<string, unknown>));
  }
  async listByCollection(collectionId: string): Promise<RuntimeResult<KnowledgeSource[]>> {
    const { data, error } = await this.db.from(SRC).select("*").eq("collection_id", collectionId);
    if (error) return mapDatabaseError(error, "source.listByCollection");
    return ok("found", (data ?? []).map((r) => m.toSource(r as Record<string, unknown>)));
  }
}

/**
 * Vector store as a READ view over `embedding_vector` (durable writes flow through
 * the EmbeddingVectorRepository). Ranking is done in-app via the pure `rankVectors`
 * — correct without pgvector; a pgvector-native `<=>` search is a future backend.
 */
export class SupabaseVectorStore implements VectorStorePort {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async upsert(): Promise<void> { /* durable writes are owned by EmbeddingVectorRepository */ }
  async deleteByDocument(): Promise<void> { /* deletes are owned by EmbeddingVectorRepository */ }
  async search(query: VectorQuery): Promise<VectorMatch[]> {
    let q = this.db.from(VEC).select("*").eq("workspace_id", query.workspaceId);
    if (query.collectionIds !== undefined && query.collectionIds.length > 0) q = q.in("collection_id", [...query.collectionIds]);
    const { data, error } = await q;
    if (error) return [];
    const candidates = (data ?? []).map((r) => m.toVector(r as Record<string, unknown>));
    return rankVectors(candidates, query);
  }
}

/** A deterministic, network-free embedding provider (default until real SDKs). */
export function createDeterministicEmbeddingProvider(kind: EmbeddingProviderKind, dims = 16): EmbeddingProviderPort {
  const model = "text-embedding-3-small";
  const embed = (text: string): number[] => {
    const v = new Array<number>(dims).fill(0);
    for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) {
      let h = 2166136261;
      for (let i = 0; i < token.length; i += 1) { h ^= token.charCodeAt(i); h = Math.imul(h, 16777619); }
      const idx = Math.abs(h) % dims;
      v[idx] = (v[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  };
  return {
    kind,
    async embed(texts) { const tokens = texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0); return { ok: true, value: { vectors: texts.map(embed), model, dimensions: dims, tokens } }; },
    dimensions: () => dims,
    health: async () => "healthy",
    estimateCost: (tokenCount) => Math.round((tokenCount / 1_000_000) * 20) / 1e6,
  };
}
