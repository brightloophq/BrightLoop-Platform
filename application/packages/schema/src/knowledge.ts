/* =============================================================================
 * Knowledge Base / RAG (Phase E · Sprint E2) — schema contracts.
 *
 * The workspace-scoped retrieval substrate every future AI capability draws
 * trustworthy knowledge from. Collections → documents → versions → chunks →
 * embedding vectors; retrieval sessions → retrieved context → citations; plus
 * ingestion sources, embedding jobs, and permissions. Embedding + vector-store
 * providers are ports (no SDK here). Additive; a new `knowledge` bounded context.
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

export const collectionKindSchema = z.enum(["client", "workspace", "project", "department", "brand"]);
export type CollectionKind = z.infer<typeof collectionKindSchema>;

/** Collection/document visibility. `external` is reserved for a future sprint. */
export const knowledgeVisibilitySchema = z.enum(["private", "shared", "internal", "external"]);
export type KnowledgeVisibility = z.infer<typeof knowledgeVisibilitySchema>;

export const documentSourceTypeSchema = z.enum(["pdf", "docx", "txt", "markdown", "html", "csv", "google_docs", "notion", "confluence", "email", "slack"]);
export type DocumentSourceType = z.infer<typeof documentSourceTypeSchema>;

export const documentLifecycleStatusSchema = z.enum(["active", "archived", "deleted"]);
export type DocumentLifecycleStatus = z.infer<typeof documentLifecycleStatusSchema>;

export const chunkingStrategySchema = z.enum(["fixed", "semantic", "heading_aware", "paragraph_aware"]);
export type ChunkingStrategy = z.infer<typeof chunkingStrategySchema>;

/** Embedding providers are SEPARATE from LLM providers. */
export const embeddingProviderKindSchema = z.enum(["openai", "gemini", "local"]);
export type EmbeddingProviderKind = z.infer<typeof embeddingProviderKindSchema>;

export const embeddingJobStatusSchema = z.enum(["pending", "processing", "completed", "failed", "reindex"]);
export type EmbeddingJobStatus = z.infer<typeof embeddingJobStatusSchema>;

export const knowledgePermissionLevelSchema = z.enum(["read", "write", "admin"]);
export type KnowledgePermissionLevel = z.infer<typeof knowledgePermissionLevelSchema>;

/* ---- collection + permission + source -------------------------------------- */

export const knowledgeCollectionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(200),
  description: z.string().nullable().default(null),
  kind: collectionKindSchema,
  visibility: knowledgeVisibilitySchema.default("internal"),
  ownerUserId: z.string(),
  documentCount: z.number().int().min(0).default(0),
  status: z.enum(["active", "archived"]).default("active"),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeCollection = z.infer<typeof knowledgeCollectionSchema>;

export const knowledgePermissionSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** A user id or a role name. */
  subjectType: z.enum(["user", "role"]),
  subjectId: z.string(),
  level: knowledgePermissionLevelSchema,
  createdAt: z.string(),
});
export type KnowledgePermission = z.infer<typeof knowledgePermissionSchema>;

/** An ingestion source bound to a collection (extensible; connectors are future). */
export const knowledgeSourceSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  sourceType: documentSourceTypeSchema,
  label: z.string(),
  /** Non-secret config only — connector credentials are env-only, never here. */
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

/* ---- document + version ---------------------------------------------------- */

export const knowledgeDocumentSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(400),
  sourceType: documentSourceTypeSchema,
  mimeType: z.string(),
  language: z.string().nullable().default(null),
  sizeBytes: z.number().int().min(0).default(0),
  checksum: z.string(),
  status: documentLifecycleStatusSchema.default("active"),
  currentVersion: z.number().int().positive().default(1),
  ownerUserId: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

/** An immutable document snapshot. Uploads/replacements append a new version. */
export const documentVersionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  version: z.number().int().positive(),
  checksum: z.string(),
  sizeBytes: z.number().int().min(0).default(0),
  mimeType: z.string(),
  /** Opaque reference to raw bytes in the (abstracted) blob store. */
  storageRef: z.string().nullable().default(null),
  /** Parsing metadata, stored separately from the normalized text. */
  parseStatus: z.enum(["pending", "parsed", "failed"]).default("pending"),
  parseMetadata: z.record(z.string(), z.unknown()).default({}),
  createdByUserId: z.string(),
  createdAt: z.string(),
});
export type DocumentVersion = z.infer<typeof documentVersionSchema>;

/* ---- chunk + embedding ----------------------------------------------------- */

export const documentChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  documentVersion: z.number().int().positive(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** Zero-based order within the document version. */
  index: z.number().int().min(0),
  content: z.string(),
  page: z.number().int().min(0).nullable().default(null),
  heading: z.string().nullable().default(null),
  tokenCount: z.number().int().min(0).default(0),
  checksum: z.string(),
  strategy: chunkingStrategySchema,
  createdAt: z.string(),
});
export type DocumentChunk = z.infer<typeof documentChunkSchema>;

export const embeddingVectorSchema = z.object({
  id: z.string(),
  chunkId: z.string(),
  documentId: z.string(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  provider: embeddingProviderKindSchema,
  model: z.string(),
  dimensions: z.number().int().positive(),
  /** The vector as a float array (portable; pgvector-native storage is future). */
  embedding: z.array(z.number()),
  createdAt: z.string(),
});
export type EmbeddingVector = z.infer<typeof embeddingVectorSchema>;

/* ---- embedding job --------------------------------------------------------- */

export const embeddingJobSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  documentVersion: z.number().int().positive(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  status: embeddingJobStatusSchema.default("pending"),
  provider: embeddingProviderKindSchema,
  model: z.string(),
  strategy: chunkingStrategySchema.default("paragraph_aware"),
  chunkCount: z.number().int().min(0).default(0),
  retryCount: z.number().int().min(0).default(0),
  durationMs: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  error: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmbeddingJob = z.infer<typeof embeddingJobSchema>;

/* ---- retrieval + citation -------------------------------------------------- */

export const retrievalSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  query: z.string(),
  collectionIds: z.array(z.string()).default([]),
  topK: z.number().int().positive().default(8),
  threshold: z.number().min(0).max(1).default(0),
  maxTokens: z.number().int().positive().default(4000),
  provider: embeddingProviderKindSchema,
  model: z.string(),
  resultCount: z.number().int().min(0).default(0),
  latencyMs: z.number().int().min(0).default(0),
  cacheHit: z.boolean().default(false),
  requestedByUserId: z.string(),
  createdAt: z.string(),
});
export type RetrievalSession = z.infer<typeof retrievalSessionSchema>;

export const retrievedContextSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  chunkId: z.string(),
  documentId: z.string(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  score: z.number(),
  rank: z.number().int().min(0),
  tokenCount: z.number().int().min(0).default(0),
  content: z.string(),
  createdAt: z.string(),
});
export type RetrievedContext = z.infer<typeof retrievedContextSchema>;

/** Named `Knowledge*` to avoid colliding with any other `Citation` in the schema. */
export const knowledgeCitationSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  chunkId: z.string(),
  documentId: z.string(),
  collectionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  page: z.number().int().min(0).nullable().default(null),
  heading: z.string().nullable().default(null),
  sourceType: documentSourceTypeSchema,
  score: z.number(),
  createdAt: z.string(),
});
export type KnowledgeCitation = z.infer<typeof knowledgeCitationSchema>;
