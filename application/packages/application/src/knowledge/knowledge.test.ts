/* =============================================================================
 * Knowledge Base use-case tests (Phase E · Sprint E2).
 *
 * Collection admin, document lifecycle + versioning, the embedding pipeline
 * (queue → index → vectors), retrieval + citations, permissions/authorization,
 * workspace isolation, and the read models — through the application layer with
 * in-memory repos + a deterministic mock embedding provider + vector store.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError, ValidationError } from "../errors.js";
import { createInMemoryKnowledgeRepos, createInMemoryVectorStore, createMockEmbeddingProvider } from "./testing.js";
import { archiveDocument, createCollection, replaceDocument, restoreDocument, softDeleteDocument, uploadDocument } from "./document-usecases.js";
import { indexDocument, queueEmbedding } from "./indexing-usecases.js";
import { generateCitationBundle, retrieveContext, searchKnowledge } from "./retrieval-usecases.js";
import { getCollectionSummary, getKnowledgeUsage, listDocumentLibrary, listEmbeddingQueue, listRetrievalHistory } from "./knowledge-read.js";

const T0 = "2026-07-27T00:00:00.000Z";
const WS = "txw_kb1";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };

function makeCtx(actor: Actor): AppContext {
  let k = 0;
  return {
    services: {} as unknown as RuntimeServices, actor, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: () => T0,
    knowledge: createInMemoryKnowledgeRepos(),
    embeddingProviders: { openai: createMockEmbeddingProvider("openai"), gemini: createMockEmbeddingProvider("gemini") },
    vectorStore: createInMemoryVectorStore(),
  };
}

let ctx: AppContext;
const MD = "# Alpha\n\nThe quick brown fox jumps.\n\n## Beta\n\nLazy dogs sleep all day.\n\n## Gamma\n\nRocket science and space travel.";

beforeEach(() => { ctx = makeCtx(OWNER); });

async function seedIndexedCollection(c = ctx): Promise<{ collectionId: string; documentId: string }> {
  const col = await createCollection(c, WS, { name: "Docs", kind: "workspace" });
  const up = await uploadDocument(c, col.id, { title: "Guide", sourceType: "markdown", mimeType: "text/markdown", content: MD });
  const job = await queueEmbedding(c, up.document.id, { provider: "openai" });
  await indexDocument(c, job.id);
  return { collectionId: col.id, documentId: up.document.id };
}

describe("collections + documents", () => {
  it("creates a collection, uploads + chunks a document, versions on replace", async () => {
    const col = await createCollection(ctx, WS, { name: "Docs", kind: "workspace", visibility: "internal" });
    const up = await uploadDocument(ctx, col.id, { title: "Guide", sourceType: "markdown", mimeType: "text/markdown", content: MD });
    expect(up.version).toBe(1);
    expect(up.chunkCount).toBeGreaterThan(0);
    const replaced = await replaceDocument(ctx, up.document.id, { content: MD + "\n\n## Delta\n\nExtra section." });
    expect(replaced.version).toBe(2);
    const lib = await listDocumentLibrary(ctx, col.id);
    expect(lib[0]!.currentVersion).toBe(2);
  });

  it("soft-delete hides from the library and is reversible", async () => {
    const col = await createCollection(ctx, WS, { name: "Docs", kind: "workspace" });
    const up = await uploadDocument(ctx, col.id, { title: "G", sourceType: "txt", mimeType: "text/plain", content: "hello world" });
    await archiveDocument(ctx, up.document.id);
    const deleted = await softDeleteDocument(ctx, up.document.id);
    expect(deleted.status).toBe("deleted");
    expect((await listDocumentLibrary(ctx, col.id)).length).toBe(0);
    const restored = await restoreDocument(ctx, up.document.id);
    expect(restored.status).toBe("active");
  });

  it("rejects empty uploads and denies a client actor", async () => {
    const col = await createCollection(ctx, WS, { name: "Docs", kind: "workspace" });
    await expect(uploadDocument(ctx, col.id, { title: "", sourceType: "txt", mimeType: "text/plain", content: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createCollection({ ...ctx, actor: CLIENT }, WS, { name: "X", kind: "client" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("team members cannot administer collections", async () => {
    await expect(createCollection({ ...ctx, actor: TEAM }, WS, { name: "X", kind: "workspace" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("embedding pipeline", () => {
  it("queues, indexes, and produces vectors; the job completes", async () => {
    const col = await createCollection(ctx, WS, { name: "Docs", kind: "workspace" });
    const up = await uploadDocument(ctx, col.id, { title: "Guide", sourceType: "markdown", mimeType: "text/markdown", content: MD });
    const job = await queueEmbedding(ctx, up.document.id, { provider: "openai" });
    expect(job.status).toBe("pending");
    const done = await indexDocument(ctx, job.id);
    expect(done.status).toBe("completed");
    expect(done.chunkCount).toBeGreaterThan(0);
    const summary = await getCollectionSummary(ctx, col.id);
    expect(summary.vectorCount).toBe(done.chunkCount);
  });

  it("records a failed job when the provider fails", async () => {
    const c = makeCtx(OWNER);
    c.embeddingProviders = { openai: createMockEmbeddingProvider("openai", { alwaysFail: true }) };
    const col = await createCollection(c, WS, { name: "Docs", kind: "workspace" });
    const up = await uploadDocument(c, col.id, { title: "G", sourceType: "txt", mimeType: "text/plain", content: "hello world foo bar" });
    const job = await queueEmbedding(c, up.document.id, { provider: "openai" });
    await expect(indexDocument(c, job.id)).rejects.toThrow();
    const queue = await listEmbeddingQueue(c, WS);
    expect(queue[0]!.status).toBe("failed");
    expect(queue[0]!.retryCount).toBe(1);
  });
});

describe("retrieval + citations", () => {
  it("retrieves relevant chunks, persists a session, and builds citations", async () => {
    await seedIndexedCollection();
    const res = await retrieveContext(ctx, { query: "rocket science space travel", workspaceId: WS, topK: 5 });
    expect(res.resultCount).toBeGreaterThan(0);
    expect(res.chunks[0]!.content.toLowerCase()).toContain("rocket");
    expect(res.chunks[0]!.heading).toBe("Gamma");
    const bundle = await generateCitationBundle(ctx, res.sessionId);
    expect(bundle.citations.length).toBe(res.resultCount);
    expect(bundle.citations[0]!.sourceType).toBe("markdown");
    const history = await listRetrievalHistory(ctx, WS);
    expect(history.length).toBe(1);
  });

  it("searchKnowledge ranks without persisting a session", async () => {
    await seedIndexedCollection();
    const search = await searchKnowledge(ctx, { query: "lazy dogs sleep", workspaceId: WS, topK: 3 });
    expect(search.resultCount).toBeGreaterThan(0);
    expect((await listRetrievalHistory(ctx, WS)).length).toBe(0);
  });

  it("denies a client actor retrieving", async () => {
    await seedIndexedCollection();
    await expect(retrieveContext({ ...ctx, actor: CLIENT }, { query: "x", workspaceId: WS })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("workspace isolation", () => {
  it("never returns vectors from another workspace", async () => {
    await seedIndexedCollection(); // indexed under WS
    // A retrieval scoped to a different workspace sees nothing.
    const other = await retrieveContext(ctx, { query: "rocket science", workspaceId: "txw_other" });
    expect(other.resultCount).toBe(0);
  });
});

describe("usage read model", () => {
  it("aggregates counts + embedding cost + latency", async () => {
    await seedIndexedCollection();
    await retrieveContext(ctx, { query: "fox", workspaceId: WS });
    const usage = await getKnowledgeUsage(ctx, WS);
    expect(usage.collections).toBe(1);
    expect(usage.documents).toBe(1);
    expect(usage.chunks).toBeGreaterThan(0);
    expect(usage.vectors).toBeGreaterThan(0);
    expect(usage.retrievals).toBe(1);
    expect(usage.embeddingJobs).toBe(1);
  });
});
