/* =============================================================================
 * Retrieval engine (Phase E · Sprint E2) — PURE.
 *
 * Turns ranked vector matches into a trustworthy, bounded context set: duplicate
 * suppression (by chunk checksum), document diversity caps, collection
 * prioritization, similarity threshold, and a max-token budget. Every kept chunk
 * carries the provenance needed for a citation. Deterministic; no io.
 * ========================================================================== */

import type { DocumentChunk } from "@brightloop/schema";
import type { VectorMatch } from "./vector.js";

export interface RetrievalCandidate {
  chunk: DocumentChunk;
  score: number;
}

export interface RetrievalOptions {
  maxTokens: number;
  /** Max chunks kept from any single document (diversity). 0 = unlimited. */
  maxPerDocument: number;
  /** Collections listed here are preferred on score ties (earlier = higher). */
  collectionPriority?: readonly string[];
  /** Minimum similarity to keep. */
  threshold: number;
}

export const DEFAULT_RETRIEVAL: RetrievalOptions = { maxTokens: 4000, maxPerDocument: 3, threshold: 0, collectionPriority: [] };

/** Join vector matches to their chunks (dropping matches whose chunk is missing). Pure. */
export function toCandidates(matches: readonly VectorMatch[], chunksById: ReadonlyMap<string, DocumentChunk>): RetrievalCandidate[] {
  const out: RetrievalCandidate[] = [];
  for (const m of matches) {
    const chunk = chunksById.get(m.vector.chunkId);
    if (chunk !== undefined) out.push({ chunk, score: m.score });
  }
  return out;
}

/**
 * Assemble the final context set: threshold filter → dedupe by chunk checksum →
 * order by (collection priority, score) → per-document diversity cap → pack under
 * the token budget. Returns the kept candidates in rank order. Pure.
 */
export function assembleContext(candidates: readonly RetrievalCandidate[], opts: RetrievalOptions = DEFAULT_RETRIEVAL): RetrievalCandidate[] {
  const priority = opts.collectionPriority ?? [];
  const priorityOf = (collectionId: string): number => { const i = priority.indexOf(collectionId); return i === -1 ? priority.length : i; };

  const seen = new Set<string>();
  const deduped = candidates
    .filter((c) => c.score >= opts.threshold)
    .filter((c) => { if (seen.has(c.chunk.checksum)) return false; seen.add(c.chunk.checksum); return true; })
    .sort((a, b) => {
      const pa = priorityOf(a.chunk.collectionId);
      const pb = priorityOf(b.chunk.collectionId);
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    });

  const perDoc = new Map<string, number>();
  const kept: RetrievalCandidate[] = [];
  let tokens = 0;
  for (const c of deduped) {
    if (opts.maxPerDocument > 0) {
      const n = perDoc.get(c.chunk.documentId) ?? 0;
      if (n >= opts.maxPerDocument) continue;
    }
    if (tokens + c.chunk.tokenCount > opts.maxTokens && kept.length > 0) break;
    kept.push(c);
    tokens += c.chunk.tokenCount;
    perDoc.set(c.chunk.documentId, (perDoc.get(c.chunk.documentId) ?? 0) + 1);
  }
  return kept;
}

/** Total tokens across a candidate set. Pure. */
export function contextTokens(candidates: readonly RetrievalCandidate[]): number {
  return candidates.reduce((sum, c) => sum + c.chunk.tokenCount, 0);
}
