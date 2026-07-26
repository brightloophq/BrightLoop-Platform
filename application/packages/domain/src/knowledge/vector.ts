/* =============================================================================
 * Vector storage PORT + similarity (Phase E · Sprint E2) — PURE math + a port.
 *
 * Business logic must not know which backend stores vectors (Supabase pgvector
 * today; Pinecone/Weaviate/Qdrant later). The port hides it; cosine similarity +
 * ranking are pure so retrieval is deterministic and testable without a backend.
 * ========================================================================== */

import type { EmbeddingVector } from "@brightloop/schema";

/** Cosine similarity in [-1, 1]; 0 for a zero/dim-mismatched vector. Pure. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface VectorMatch {
  vector: EmbeddingVector;
  score: number;
}

export interface VectorQuery {
  embedding: number[];
  workspaceId: string;
  collectionIds?: readonly string[];
  topK: number;
  /** Minimum cosine similarity to keep. */
  threshold: number;
}

/**
 * The vector-store contract. `search` returns the top matches for a query
 * embedding, already filtered to the workspace (tenant isolation is enforced here
 * AND by RLS). `upsert`/`deleteByDocument` maintain the index.
 */
export interface VectorStorePort {
  upsert(vectors: readonly EmbeddingVector[]): Promise<void>;
  search(query: VectorQuery): Promise<VectorMatch[]>;
  deleteByDocument(documentId: string): Promise<void>;
}

/**
 * Pure ranking used by the in-memory + naive adapters: filter to workspace +
 * collections, score by cosine, drop below threshold, sort desc, take topK. Pure.
 */
export function rankVectors(candidates: readonly EmbeddingVector[], query: VectorQuery): VectorMatch[] {
  return candidates
    .filter((v) => v.workspaceId === query.workspaceId)
    .filter((v) => query.collectionIds === undefined || query.collectionIds.length === 0 || query.collectionIds.includes(v.collectionId))
    .map((vector) => ({ vector, score: cosineSimilarity(query.embedding, vector.embedding) }))
    .filter((m) => m.score >= query.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, query.topK));
}
