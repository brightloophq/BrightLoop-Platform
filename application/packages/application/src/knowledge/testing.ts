/* =============================================================================
 * In-memory Knowledge repositories + a deterministic mock embedding provider and
 * in-memory vector store (Phase E · Sprint E2) — TEST SUPPORT.
 *
 * The mock embedding provider makes NO network calls: it maps text → a small
 * deterministic vector (token-hash buckets), so cosine similarity is stable and
 * "similar text ranks higher" holds. The in-memory vector store ranks via the
 * pure `rankVectors`. Both implement the exact ports a real adapter does.
 * ========================================================================== */

import {
  hashContent, ok, rankVectors,
  type EmbeddingOutcome, type EmbeddingProviderPort, type KnowledgeRepositories, type RuntimeResult,
  type VectorMatch, type VectorQuery, type VectorStorePort,
} from "@brightloop/domain";
import type {
  DocumentChunk, DocumentVersion, EmbeddingJob, EmbeddingProviderKind, EmbeddingVector, KnowledgeCitation,
  KnowledgeCollection, KnowledgeDocument, KnowledgePermission, KnowledgeSource, RetrievalSession, RetrievedContext,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryKnowledgeRepos(): KnowledgeRepositories {
  const collections = new Map<string, KnowledgeCollection>();
  const documents = new Map<string, KnowledgeDocument>();
  const versions: DocumentVersion[] = [];
  const chunks: DocumentChunk[] = [];
  const vectors: EmbeddingVector[] = [];
  const jobs = new Map<string, EmbeddingJob>();
  const sessions = new Map<string, RetrievalSession>();
  const contexts: RetrievedContext[] = [];
  const citations: KnowledgeCitation[] = [];
  const permissions: KnowledgePermission[] = [];
  const sources: KnowledgeSource[] = [];

  return {
    collections: {
      create: async (c) => { collections.set(c.id, c); return ok("created", c); },
      getById: async (id) => ok("found", collections.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...collections.values()].filter((c) => c.workspaceId === wid)),
      save: async (next, expected) => { const cur = collections.get(next.id); if (!cur || cur.version !== expected) return conflict(); collections.set(next.id, next); return ok("updated", next); },
    },
    documents: {
      create: async (d) => { documents.set(d.id, d); return ok("created", d); },
      getById: async (id) => ok("found", documents.get(id) ?? null),
      listByCollection: async (cid) => ok("found", [...documents.values()].filter((d) => d.collectionId === cid)),
      listByWorkspace: async (wid) => ok("found", [...documents.values()].filter((d) => d.workspaceId === wid)),
      save: async (next, expected) => { const cur = documents.get(next.id); if (!cur || cur.version !== expected) return conflict(); documents.set(next.id, next); return ok("updated", next); },
    },
    versions: {
      append: async (v) => { versions.push(v); return ok("created", v); },
      listByDocument: async (did) => ok("found", versions.filter((v) => v.documentId === did)),
      getByDocumentAndVersion: async (did, ver) => ok("found", versions.find((v) => v.documentId === did && v.version === ver) ?? null),
    },
    chunks: {
      appendMany: async (rows) => { chunks.push(...rows); return ok("created", [...rows]); },
      listByDocument: async (did) => ok("found", chunks.filter((c) => c.documentId === did)),
      listByIds: async (ids) => { const s = new Set(ids); return ok("found", chunks.filter((c) => s.has(c.id))); },
      deleteByDocument: async (did) => { for (let i = chunks.length - 1; i >= 0; i -= 1) if (chunks[i]!.documentId === did) chunks.splice(i, 1); return ok("updated", null); },
    },
    vectors: {
      appendMany: async (rows) => { vectors.push(...rows); return ok("created", [...rows]); },
      listByWorkspace: async (wid) => ok("found", vectors.filter((v) => v.workspaceId === wid)),
      deleteByDocument: async (did) => { for (let i = vectors.length - 1; i >= 0; i -= 1) if (vectors[i]!.documentId === did) vectors.splice(i, 1); return ok("updated", null); },
    },
    jobs: {
      create: async (j) => { jobs.set(j.id, j); return ok("created", j); },
      getById: async (id) => ok("found", jobs.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...jobs.values()].filter((j) => j.workspaceId === wid)),
      save: async (next, expected) => { const cur = jobs.get(next.id); if (!cur || cur.version !== expected) return conflict(); jobs.set(next.id, next); return ok("updated", next); },
    },
    sessions: {
      append: async (s) => { sessions.set(s.id, s); return ok("created", s); },
      getById: async (id) => ok("found", sessions.get(id) ?? null),
      listByWorkspace: async (wid) => ok("found", [...sessions.values()].filter((s) => s.workspaceId === wid)),
    },
    contexts: {
      appendMany: async (rows) => { contexts.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", contexts.filter((c) => c.sessionId === sid)),
    },
    citations: {
      appendMany: async (rows) => { citations.push(...rows); return ok("created", [...rows]); },
      listBySession: async (sid) => ok("found", citations.filter((c) => c.sessionId === sid)),
      listByWorkspace: async (wid) => ok("found", citations.filter((c) => c.workspaceId === wid)),
    },
    permissions: {
      create: async (p) => { permissions.push(p); return ok("created", p); },
      remove: async (id) => { for (let i = permissions.length - 1; i >= 0; i -= 1) if (permissions[i]!.id === id) permissions.splice(i, 1); return ok("updated", null); },
      listByCollection: async (cid) => ok("found", permissions.filter((p) => p.collectionId === cid)),
    },
    sources: {
      create: async (s) => { sources.push(s); return ok("created", s); },
      listByCollection: async (cid) => ok("found", sources.filter((s) => s.collectionId === cid)),
    },
  };
}

/** A deterministic embedding: 16-bucket token-hash vector (network-free). */
function embedText(text: string, dims = 16): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    const idx = Math.abs(hashPart(token)) % dims;
    v[idx] = (v[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
function hashPart(s: string): number {
  const hex = hashContent(s).slice(0, 8);
  return parseInt(hex, 16) || 0;
}

export interface MockEmbeddingOptions { alwaysFail?: boolean; dims?: number; model?: string; }

export function createMockEmbeddingProvider(kind: EmbeddingProviderKind, options: MockEmbeddingOptions = {}): EmbeddingProviderPort {
  const dims = options.dims ?? 16;
  const model = options.model ?? "text-embedding-3-small";
  return {
    kind,
    async embed(texts: readonly string[]): Promise<EmbeddingOutcome> {
      if (options.alwaysFail) return { ok: false, reason: "provider_unavailable", message: `mock ${kind} embedding failed`, retryable: true };
      const tokens = texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
      return { ok: true, value: { vectors: texts.map((t) => embedText(t, dims)), model, dimensions: dims, tokens } };
    },
    dimensions: () => dims,
    health: async () => "healthy",
    estimateCost: (tokenCount) => Math.round((tokenCount / 1_000_000) * 20) / 1e6,
  };
}

/** In-memory vector store backed by the pure `rankVectors`. */
export function createInMemoryVectorStore(): VectorStorePort {
  let store: EmbeddingVector[] = [];
  return {
    upsert: async (rows) => { const ids = new Set(rows.map((r) => r.chunkId)); store = store.filter((v) => !ids.has(v.chunkId)); store.push(...rows); },
    search: async (query: VectorQuery): Promise<VectorMatch[]> => rankVectors(store, query),
    deleteByDocument: async (documentId) => { store = store.filter((v) => v.documentId !== documentId); },
  };
}
