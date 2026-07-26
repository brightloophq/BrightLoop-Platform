/* =============================================================================
 * Knowledge Base domain tests (Phase E · Sprint E2).
 *
 * Parsing + chunking, collection access, document lifecycle, embedding-job state
 * machine, cosine similarity + ranking, and the retrieval assembler — all pure.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { parseDocument, chunkBlocks } from "./chunking.js";
import { buildCollection, buildPermission, canTransitionDocument, defaultStrategyFor, hasCollectionAccess } from "./collection.js";
import { buildEmbeddingJob, canTransitionJob, transitionJob } from "./embedding.js";
import { cosineSimilarity, rankVectors } from "./vector.js";
import { assembleContext, toCandidates, type RetrievalCandidate } from "./retrieval.js";
import type { DocumentChunk, EmbeddingVector, KnowledgePermission } from "@brightloop/schema";

const T0 = "2026-07-27T00:00:00.000Z";

describe("parsing + chunking", () => {
  const doc = "# Title\n\nFirst paragraph here.\n\n## Section\n\n- item one\n- item two\n\n```\ncode();\n```\n\nClosing paragraph.";
  it("parses headings, lists, and code blocks", () => {
    const { blocks, metadata } = parseDocument(doc);
    expect(metadata.headingCount).toBe(2);
    expect(metadata.codeBlocks).toBe(1);
    expect(blocks.find((b) => b.type === "heading")?.text).toBe("Title");
    expect(blocks.some((b) => b.type === "list")).toBe(true);
  });
  it("heading-aware chunking starts a new chunk per heading and tags it", () => {
    const { blocks } = parseDocument(doc);
    const chunks = chunkBlocks(blocks, "heading_aware", { maxTokens: 1000, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[1]?.heading).toBe("Section");
    for (const c of chunks) { expect(c.tokenCount).toBeGreaterThan(0); expect(c.checksum.length).toBeGreaterThan(0); }
  });
  it("fixed chunking honors a small token window with overlap", () => {
    const big = { type: "paragraph" as const, text: "abcd ".repeat(200), level: null, page: 1 };
    const chunks = chunkBlocks([big], "fixed", { maxTokens: 20, overlapTokens: 4 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 20 * 4 + 4)).toBe(true);
  });
});

describe("collections + permissions", () => {
  const perm = (subjectType: "user" | "role", subjectId: string, level: KnowledgePermission["level"]): KnowledgePermission => buildPermission({ id: `perm_${subjectId}`, collectionId: "col_1", workspaceId: "w", clientId: "c", subjectType, subjectId, level, now: T0 });
  it("owner has admin; visibility grants read; explicit perms raise the level", () => {
    const col = buildCollection({ id: "col_1", workspaceId: "w", clientId: "c", name: "Docs", kind: "workspace", visibility: "internal", ownerUserId: "u_owner", now: T0 });
    expect(hasCollectionAccess(col, [], "u_owner", [], "admin")).toBe(true);
    expect(hasCollectionAccess(col, [], "u_other", [], "read")).toBe(true); // internal → read
    expect(hasCollectionAccess(col, [], "u_other", [], "write")).toBe(false);
    expect(hasCollectionAccess(col, [perm("user", "u_other", "write")], "u_other", [], "write")).toBe(true);
    expect(hasCollectionAccess({ ...col, visibility: "private" }, [perm("role", "editor", "admin")], "u_x", ["editor"], "admin")).toBe(true);
  });
  it("picks a default strategy per source type", () => {
    expect(defaultStrategyFor("markdown")).toBe("heading_aware");
    expect(defaultStrategyFor("csv")).toBe("fixed");
    expect(defaultStrategyFor("pdf")).toBe("paragraph_aware");
  });
  it("document lifecycle: soft-delete is reversible", () => {
    expect(canTransitionDocument("active", "deleted")).toBe(true);
    expect(canTransitionDocument("deleted", "active")).toBe(true);
    expect(canTransitionDocument("archived", "active")).toBe(true);
  });
});

describe("embedding job state machine", () => {
  it("transitions pending→processing→completed and failed→reindex", () => {
    const job = buildEmbeddingJob({ id: "job_1", documentId: "d", documentVersion: 1, collectionId: "col", workspaceId: "w", clientId: "c", provider: "openai", model: "text-embedding-3-small", now: T0 });
    expect(job.status).toBe("pending");
    const processing = transitionJob(job, { status: "processing" }, T0);
    expect(processing.ok && processing.value.status).toBe("processing");
    const done = transitionJob(processing.ok ? processing.value : job, { status: "completed", chunkCount: 5, cost: 0.001 }, T0);
    expect(done.ok && done.value.chunkCount).toBe(5);
    expect(done.ok && done.value.version).toBe(3);
    expect(canTransitionJob("failed", "reindex")).toBe(true);
    expect(transitionJob(job, { status: "completed" }, T0).ok).toBe(false); // pending→completed illegal
  });
});

describe("vector similarity + ranking", () => {
  const vec = (id: string, collectionId: string, embedding: number[]): EmbeddingVector => ({ id, chunkId: `chunk_${id}`, documentId: "d", collectionId, workspaceId: "w", clientId: "c", provider: "openai", model: "m", dimensions: embedding.length, embedding, createdAt: T0 });
  it("computes cosine similarity and handles bad input", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0); // dim mismatch
  });
  it("ranks within a workspace + collection filter, applies threshold + topK", () => {
    const candidates = [vec("a", "col_1", [1, 0]), vec("b", "col_1", [0.9, 0.1]), vec("c", "col_2", [0, 1])];
    const matches = rankVectors(candidates, { embedding: [1, 0], workspaceId: "w", collectionIds: ["col_1"], topK: 5, threshold: 0.5 });
    expect(matches.map((m) => m.vector.id)).toEqual(["a", "b"]);
  });
});

describe("retrieval assembler", () => {
  const chunk = (id: string, documentId: string, collectionId: string, checksum: string, tokens: number): DocumentChunk => ({ id, documentId, documentVersion: 1, collectionId, workspaceId: "w", clientId: "c", index: 0, content: id, page: 1, heading: null, tokenCount: tokens, checksum, strategy: "paragraph_aware", createdAt: T0 });
  it("dedupes by checksum, caps per document, prioritizes collections, and honors the token budget", () => {
    const cands: RetrievalCandidate[] = [
      { chunk: chunk("c1", "d1", "col_2", "x", 100), score: 0.9 },
      { chunk: chunk("c2", "d1", "col_1", "y", 100), score: 0.8 },
      { chunk: chunk("c3", "d1", "col_1", "y", 100), score: 0.7 }, // dup checksum y
      { chunk: chunk("c4", "d2", "col_1", "z", 100), score: 0.6 },
    ];
    const kept = assembleContext(cands, { maxTokens: 250, maxPerDocument: 1, threshold: 0.5, collectionPriority: ["col_1"] });
    // col_1 prioritized; dedupe drops c3; per-doc cap 1 keeps one from d1; budget 250 fits 2×100
    expect(kept.map((k) => k.chunk.id)).toEqual(["c2", "c4"]);
  });
  it("joins matches to chunks by chunkId", () => {
    const byId = new Map([["chunk_a", chunk("chunk_a", "d", "col", "h", 10)]]);
    const cands = toCandidates([{ vector: { chunkId: "chunk_a" } as EmbeddingVector, score: 0.9 }, { vector: { chunkId: "missing" } as EmbeddingVector, score: 0.5 }], byId);
    expect(cands.length).toBe(1);
  });
});
