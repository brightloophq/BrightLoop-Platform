/* =============================================================================
 * Collections, permissions, sources + document lifecycle (Phase E · E2) — PURE.
 * ========================================================================== */

import { hashContent } from "../scan-engine/evidence/hash.js";
import type {
  ChunkingStrategy, CollectionKind, DocumentLifecycleStatus, DocumentSourceType, DocumentVersion,
  KnowledgeCollection, KnowledgeDocument, KnowledgePermission, KnowledgePermissionLevel, KnowledgeVisibility,
} from "@brightloop/schema";

/* ---- collection ------------------------------------------------------------ */

export interface BuildCollectionInput {
  id: string; workspaceId: string; clientId: string | null; name: string; description?: string | null;
  kind: CollectionKind; visibility?: KnowledgeVisibility; ownerUserId: string; now: string;
}
export function buildCollection(input: BuildCollectionInput): KnowledgeCollection {
  return {
    id: input.id, workspaceId: input.workspaceId, clientId: input.clientId, name: input.name.slice(0, 200),
    description: input.description ?? null, kind: input.kind, visibility: input.visibility ?? "internal",
    ownerUserId: input.ownerUserId, documentCount: 0, status: "active", version: 1, createdAt: input.now, updatedAt: input.now,
  };
}

export interface BuildPermissionInput {
  id: string; collectionId: string; workspaceId: string; clientId: string | null;
  subjectType: "user" | "role"; subjectId: string; level: KnowledgePermissionLevel; now: string;
}
export function buildPermission(input: BuildPermissionInput): KnowledgePermission {
  return { id: input.id, collectionId: input.collectionId, workspaceId: input.workspaceId, clientId: input.clientId, subjectType: input.subjectType, subjectId: input.subjectId, level: input.level, createdAt: input.now };
}

const LEVEL_RANK: Record<KnowledgePermissionLevel, number> = { read: 1, write: 2, admin: 3 };

/**
 * Does `userId` (with `roles`) hold at least `required` on this collection? The
 * collection owner always holds admin; a `shared`/`internal` collection grants
 * read to any internal user. Explicit permissions raise the level. Pure.
 */
export function hasCollectionAccess(
  collection: Pick<KnowledgeCollection, "ownerUserId" | "visibility">,
  permissions: readonly KnowledgePermission[],
  userId: string,
  roles: readonly string[],
  required: KnowledgePermissionLevel,
): boolean {
  if (collection.ownerUserId === userId) return true;
  let level = 0;
  if (required === "read" && (collection.visibility === "shared" || collection.visibility === "internal")) level = LEVEL_RANK.read;
  for (const p of permissions) {
    const matches = (p.subjectType === "user" && p.subjectId === userId) || (p.subjectType === "role" && roles.includes(p.subjectId));
    if (matches) level = Math.max(level, LEVEL_RANK[p.level]);
  }
  return level >= LEVEL_RANK[required];
}

/* ---- document lifecycle ---------------------------------------------------- */

export const DOCUMENT_TRANSITIONS: Record<DocumentLifecycleStatus, readonly DocumentLifecycleStatus[]> = {
  active: ["archived", "deleted"],
  archived: ["active", "deleted"],
  deleted: ["active"], // soft-delete is reversible (restore)
};
export function canTransitionDocument(from: DocumentLifecycleStatus, to: DocumentLifecycleStatus): boolean {
  return DOCUMENT_TRANSITIONS[from].includes(to);
}

export interface BuildDocumentInput {
  id: string; collectionId: string; workspaceId: string; clientId: string | null; title: string;
  sourceType: DocumentSourceType; mimeType: string; language?: string | null; sizeBytes: number;
  content: string; ownerUserId: string; metadata?: Record<string, unknown>; now: string;
}
export function buildDocument(input: BuildDocumentInput): KnowledgeDocument {
  return {
    id: input.id, collectionId: input.collectionId, workspaceId: input.workspaceId, clientId: input.clientId,
    title: input.title.slice(0, 400), sourceType: input.sourceType, mimeType: input.mimeType, language: input.language ?? null,
    sizeBytes: input.sizeBytes, checksum: hashContent(input.content), status: "active", currentVersion: 1,
    ownerUserId: input.ownerUserId, metadata: input.metadata ?? {}, version: 1, createdAt: input.now, updatedAt: input.now,
  };
}

export interface BuildDocumentVersionInput {
  id: string; documentId: string; workspaceId: string; clientId: string | null; version: number;
  content: string; sizeBytes: number; mimeType: string; storageRef?: string | null; createdByUserId: string; now: string;
}
export function buildDocumentVersion(input: BuildDocumentVersionInput): DocumentVersion {
  return {
    id: input.id, documentId: input.documentId, workspaceId: input.workspaceId, clientId: input.clientId,
    version: input.version, checksum: hashContent(input.content), sizeBytes: input.sizeBytes, mimeType: input.mimeType,
    storageRef: input.storageRef ?? null, parseStatus: "pending", parseMetadata: {}, createdByUserId: input.createdByUserId, createdAt: input.now,
  };
}

/** Default chunking strategy per source type (heading-aware for structured text). */
export function defaultStrategyFor(sourceType: DocumentSourceType): ChunkingStrategy {
  if (sourceType === "markdown" || sourceType === "html") return "heading_aware";
  if (sourceType === "csv") return "fixed";
  return "paragraph_aware";
}
