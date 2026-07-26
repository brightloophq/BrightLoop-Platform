/* =============================================================================
 * Collection + document use-cases (Phase E · Sprint E2).
 *
 * Create collections + permissions (admin), and the document lifecycle: upload
 * (create doc + immutable version + parse + chunk + persist chunks), replace (new
 * version, re-chunk, drop old chunks + vectors), archive / restore / soft-delete.
 * Each: authorize → pure domain → persist (optimistic concurrency) → DTO.
 * ========================================================================== */

import {
  buildCollection, buildDocument, buildDocumentVersion, buildPermission, canTransitionDocument, chunkBlocks,
  defaultStrategyFor, parseDocument,
} from "@brightloop/domain";
import type { ChunkingStrategy, CollectionKind, DocumentChunk, DocumentLifecycleStatus, DocumentSourceType, KnowledgePermissionLevel, KnowledgeVisibility } from "@brightloop/schema";
import {
  authorize, requireKnowledge, KNOWLEDGE_ADMIN_CAP, KNOWLEDGE_DELETE_CAP, KNOWLEDGE_WRITE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toCollectionDTO, toDocumentDTO, type CollectionDTO, type DocumentDTO, type UploadResultDTO } from "./dto.js";

/* ---- collections (admin) --------------------------------------------------- */

export interface CreateCollectionInput { name: string; description?: string | null; kind: CollectionKind; visibility?: KnowledgeVisibility; }

export async function createCollection(ctx: AppContext, rawWorkspaceId: unknown, input: CreateCollectionInput): Promise<CollectionDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const name = requireString(input.name, "name").trim();
  if (name === "") throw new ValidationError("A collection name is required");
  const kb = requireKnowledge(ctx);
  authorize(ctx.actor, KNOWLEDGE_ADMIN_CAP, ctx.actor.clientId);
  const collection = buildCollection({ id: ctx.ids("kcol"), workspaceId, clientId: ctx.actor.clientId, name, description: input.description ?? null, kind: input.kind, visibility: input.visibility ?? "internal", ownerUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await kb.collections.create(collection));
  return toCollectionDTO(collection);
}

export interface SetPermissionInput { subjectType: "user" | "role"; subjectId: string; level: KnowledgePermissionLevel; }

export async function setCollectionPermission(ctx: AppContext, rawCollectionId: unknown, input: SetPermissionInput): Promise<void> {
  const collectionId = requireId(rawCollectionId, "collectionId");
  const kb = requireKnowledge(ctx);
  const collection = unwrap(await kb.collections.getById(collectionId));
  if (collection === null) throw new NotFoundError("collection");
  authorize(ctx.actor, KNOWLEDGE_ADMIN_CAP, collection.clientId);
  const permission = buildPermission({ id: ctx.ids("kperm"), collectionId, workspaceId: collection.workspaceId, clientId: collection.clientId, subjectType: input.subjectType, subjectId: requireString(input.subjectId, "subjectId"), level: input.level, now: ctx.clock() });
  unwrap(await kb.permissions.create(permission));
}

/* ---- documents ------------------------------------------------------------- */

export interface UploadDocumentInput {
  title: string; sourceType: DocumentSourceType; mimeType: string; content: string;
  language?: string | null; metadata?: Record<string, unknown>; strategy?: ChunkingStrategy;
  maxTokens?: number; overlapTokens?: number;
}

/** Chunk descriptors → persisted DocumentChunk rows for a document version. */
function persistedChunks(ctx: AppContext, doc: { id: string; collectionId: string; workspaceId: string; clientId: string | null }, version: number, content: string, strategy: ChunkingStrategy, maxTokens: number, overlapTokens: number): DocumentChunk[] {
  const { blocks } = parseDocument(content);
  return chunkBlocks(blocks, strategy, { maxTokens, overlapTokens }).map((c) => ({
    id: ctx.ids("kchunk"), documentId: doc.id, documentVersion: version, collectionId: doc.collectionId,
    workspaceId: doc.workspaceId, clientId: doc.clientId, index: c.index, content: c.content, page: c.page,
    heading: c.heading, tokenCount: c.tokenCount, checksum: c.checksum, strategy, createdAt: ctx.clock(),
  }));
}

export async function uploadDocument(ctx: AppContext, rawCollectionId: unknown, input: UploadDocumentInput): Promise<UploadResultDTO> {
  const collectionId = requireId(rawCollectionId, "collectionId");
  const title = requireString(input.title, "title").trim();
  const content = requireString(input.content, "content");
  if (title === "" || content.trim() === "") throw new ValidationError("A document title and content are required");
  const kb = requireKnowledge(ctx);
  const collection = unwrap(await kb.collections.getById(collectionId));
  if (collection === null) throw new NotFoundError("collection");
  authorize(ctx.actor, KNOWLEDGE_WRITE_CAP, collection.clientId);

  const strategy = input.strategy ?? defaultStrategyFor(input.sourceType);
  const document = buildDocument({ id: ctx.ids("kdoc"), collectionId, workspaceId: collection.workspaceId, clientId: collection.clientId, title, sourceType: input.sourceType, mimeType: input.mimeType, language: input.language ?? null, sizeBytes: content.length, content, ownerUserId: ctx.actor.userId, metadata: input.metadata, now: ctx.clock() });
  unwrap(await kb.documents.create(document));
  unwrap(await kb.versions.append(buildDocumentVersion({ id: ctx.ids("kver"), documentId: document.id, workspaceId: collection.workspaceId, clientId: collection.clientId, version: 1, content, sizeBytes: content.length, mimeType: input.mimeType, createdByUserId: ctx.actor.userId, now: ctx.clock() })));
  const chunks = persistedChunks(ctx, document, 1, content, strategy, input.maxTokens ?? 512, input.overlapTokens ?? 64);
  unwrap(await kb.chunks.appendMany(chunks));
  // bump the collection's document counter (optimistic concurrency).
  await kb.collections.save({ ...collection, documentCount: collection.documentCount + 1, updatedAt: ctx.clock(), version: collection.version + 1 }, collection.version);
  return { document: toDocumentDTO(document), version: 1, chunkCount: chunks.length };
}

export interface ReplaceDocumentInput { content: string; mimeType?: string; strategy?: ChunkingStrategy; maxTokens?: number; overlapTokens?: number; }

export async function replaceDocument(ctx: AppContext, rawDocumentId: unknown, input: ReplaceDocumentInput): Promise<UploadResultDTO> {
  const documentId = requireId(rawDocumentId, "documentId");
  const content = requireString(input.content, "content");
  if (content.trim() === "") throw new ValidationError("Replacement content is required");
  const kb = requireKnowledge(ctx);
  const document = unwrap(await kb.documents.getById(documentId));
  if (document === null) throw new NotFoundError("document");
  authorize(ctx.actor, KNOWLEDGE_WRITE_CAP, document.clientId);
  if (document.status === "deleted") throw new ConflictError("Cannot replace a deleted document");

  const nextVersion = document.currentVersion + 1;
  const mimeType = input.mimeType ?? document.mimeType;
  const strategy = input.strategy ?? defaultStrategyFor(document.sourceType);
  unwrap(await kb.versions.append(buildDocumentVersion({ id: ctx.ids("kver"), documentId, workspaceId: document.workspaceId, clientId: document.clientId, version: nextVersion, content, sizeBytes: content.length, mimeType, createdByUserId: ctx.actor.userId, now: ctx.clock() })));
  // Re-chunk: drop the prior version's chunks + vectors, persist the new chunks.
  unwrap(await kb.chunks.deleteByDocument(documentId));
  unwrap(await kb.vectors.deleteByDocument(documentId));
  const chunks = persistedChunks(ctx, document, nextVersion, content, strategy, input.maxTokens ?? 512, input.overlapTokens ?? 64);
  unwrap(await kb.chunks.appendMany(chunks));

  const saved = await kb.documents.save({ ...document, currentVersion: nextVersion, mimeType, sizeBytes: content.length, checksum: chunks[0]?.checksum ?? document.checksum, updatedAt: ctx.clock(), version: document.version + 1 }, document.version);
  if (!saved.ok && (saved.code === "conflict" || saved.code === "serialization_conflict")) throw new ConflictError("The document changed concurrently; reload and retry");
  return { document: toDocumentDTO(unwrap(saved)), version: nextVersion, chunkCount: chunks.length };
}

async function transitionDocument(ctx: AppContext, rawDocumentId: unknown, to: DocumentLifecycleStatus, cap: string): Promise<DocumentDTO> {
  const documentId = requireId(rawDocumentId, "documentId");
  const kb = requireKnowledge(ctx);
  const document = unwrap(await kb.documents.getById(documentId));
  if (document === null) throw new NotFoundError("document");
  authorize(ctx.actor, cap, document.clientId);
  if (document.status === to) return toDocumentDTO(document);
  if (!canTransitionDocument(document.status, to)) throw new ConflictError(`Cannot move a ${document.status} document to ${to}`);
  const saved = await kb.documents.save({ ...document, status: to, updatedAt: ctx.clock(), version: document.version + 1 }, document.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The document changed concurrently; reload and retry");
    unwrap(saved);
  }
  return toDocumentDTO(unwrap(saved));
}

export const archiveDocument = (ctx: AppContext, documentId: unknown): Promise<DocumentDTO> => transitionDocument(ctx, documentId, "archived", KNOWLEDGE_WRITE_CAP);
export const restoreDocument = (ctx: AppContext, documentId: unknown): Promise<DocumentDTO> => transitionDocument(ctx, documentId, "active", KNOWLEDGE_WRITE_CAP);
export const softDeleteDocument = (ctx: AppContext, documentId: unknown): Promise<DocumentDTO> => transitionDocument(ctx, documentId, "deleted", KNOWLEDGE_DELETE_CAP);
