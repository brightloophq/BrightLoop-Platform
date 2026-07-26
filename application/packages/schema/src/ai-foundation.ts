/* =============================================================================
 * AI Foundation (Phase E · Sprint E1) — schema contracts.
 *
 * The provider-agnostic substrate every future AI capability speaks through. No
 * business/feature AI logic lives here — only the aggregates, the model registry,
 * and the value objects for prompts, executions, usage, cost, audit, conversations
 * and evaluations. Additive; introduces the `ai-foundation` bounded context.
 * ========================================================================== */

import { z } from "zod";

/* ---- provider + model registry -------------------------------------------- */

/** The provider families the abstraction targets. Business code never sees these. */
export const aiProviderKindSchema = z.enum(["anthropic", "openai", "google"]);
export type AiProviderKind = z.infer<typeof aiProviderKindSchema>;

export const aiModelCapabilitySchema = z.enum(["streaming", "json", "tools", "vision", "audio"]);
export type AiModelCapability = z.infer<typeof aiModelCapabilitySchema>;

/** A registry descriptor for one model. Pricing is per 1M tokens. */
export const aiModelDescriptorSchema = z.object({
  id: z.string(),
  provider: aiProviderKindSchema,
  family: z.string(),
  contextWindow: z.number().int().positive(),
  supportsStreaming: z.boolean(),
  supportsJson: z.boolean(),
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
  supportsAudio: z.boolean(),
  inputPricePerMTok: z.number().min(0),
  outputPricePerMTok: z.number().min(0),
  cachedInputPricePerMTok: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  available: z.boolean().default(true),
});
export type AiModelDescriptor = z.infer<typeof aiModelDescriptorSchema>;

/** Provider health, mirrored from the scan-engine health vocabulary. */
export const aiHealthStatusSchema = z.enum(["healthy", "degraded", "unavailable", "rate_limited"]);
export type AiHealthStatus = z.infer<typeof aiHealthStatusSchema>;

/** A configured provider. `clientId = null` means an internal/global provider. */
export const aiProviderSchema = z.object({
  id: z.string(),
  kind: aiProviderKindSchema,
  label: z.string(),
  enabled: z.boolean().default(true),
  /** Lower = preferred in the default failover order. */
  priority: z.number().int().min(0).default(0),
  clientId: z.string().nullable().default(null),
  /** Non-secret config only — API keys NEVER live here; they are env-only. */
  defaultModel: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiProvider = z.infer<typeof aiProviderSchema>;

/* ---- prompts + versions ---------------------------------------------------- */

export const promptStatusSchema = z.enum(["draft", "active", "deprecated", "archived"]);
export type PromptStatus = z.infer<typeof promptStatusSchema>;

export const promptSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(160),
  description: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  ownerUserId: z.string(),
  status: promptStatusSchema,
  /** The version number currently marked active, or null when none is active. */
  activeVersion: z.number().int().positive().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Prompt = z.infer<typeof promptSchema>;

/**
 * An immutable snapshot of a prompt's content at one version. Every edit appends a
 * NEW version — history is never overwritten. `version` increments per prompt.
 */
export const promptVersionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  version: z.number().int().positive(),
  systemPrompt: z.string().default(""),
  userTemplate: z.string().default(""),
  /** Declared `{{variable}}` names the template expects. */
  variables: z.array(z.string()).default([]),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(1024),
  providerPreference: aiProviderKindSchema.nullable().default(null),
  model: z.string().nullable().default(null),
  status: promptStatusSchema.default("draft"),
  notes: z.string().nullable().default(null),
  createdByUserId: z.string(),
  createdAt: z.string(),
});
export type PromptVersion = z.infer<typeof promptVersionSchema>;

/* ---- execution + result ---------------------------------------------------- */

/** Execution shapes. `tool_call`/`vision`/`audio` are declared for forward-compat. */
export const executionModeSchema = z.enum(["completion", "chat", "json", "stream", "tool_call", "vision", "audio"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const aiExecutionStatusSchema = z.enum(["pending", "succeeded", "failed", "fallback_succeeded"]);
export type AiExecutionStatus = z.infer<typeof aiExecutionStatusSchema>;

export const promptExecutionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  promptId: z.string().nullable().default(null),
  promptVersion: z.number().int().positive().nullable().default(null),
  mode: executionModeSchema,
  provider: aiProviderKindSchema,
  model: z.string(),
  status: aiExecutionStatusSchema,
  durationMs: z.number().int().min(0).default(0),
  retryCount: z.number().int().min(0).default(0),
  fallbackProvider: aiProviderKindSchema.nullable().default(null),
  requestedByUserId: z.string(),
  createdAt: z.string(),
});
export type PromptExecution = z.infer<typeof promptExecutionSchema>;

/** The immutable output of one execution. */
export const promptResultSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  content: z.string().default(""),
  /** null when no schema was requested; else whether the output validated. */
  structuredValid: z.boolean().nullable().default(null),
  finishReason: z.string().default("stop"),
  createdAt: z.string(),
});
export type PromptResult = z.infer<typeof promptResultSchema>;

/* ---- usage + cost + audit -------------------------------------------------- */

export const usageRecordSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  provider: aiProviderKindSchema,
  model: z.string(),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  cachedTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0),
  userId: z.string(),
  at: z.string(),
});
export type UsageRecord = z.infer<typeof usageRecordSchema>;

export const costRecordSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  inputCost: z.number().min(0),
  outputCost: z.number().min(0),
  totalCost: z.number().min(0),
  currency: z.string().default("USD"),
  pricingVersion: z.string(),
  at: z.string(),
});
export type CostRecord = z.infer<typeof costRecordSchema>;

/** The single source of truth that every execution happened. Append-only. */
export const auditEventSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  provider: aiProviderKindSchema,
  model: z.string(),
  promptVersion: z.number().int().positive().nullable().default(null),
  userId: z.string(),
  durationMs: z.number().int().min(0),
  status: aiExecutionStatusSchema,
  retryCount: z.number().int().min(0),
  fallbackProvider: aiProviderKindSchema.nullable().default(null),
  totalTokens: z.number().int().min(0),
  totalCost: z.number().min(0),
  currency: z.string().default("USD"),
  at: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/* ---- conversations --------------------------------------------------------- */

export const conversationStatusSchema = z.enum(["active", "archived"]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const conversationRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type ConversationRole = z.infer<typeof conversationRoleSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().default("Untitled conversation"),
  provider: aiProviderKindSchema,
  model: z.string(),
  participants: z.array(z.string()).default([]),
  messageCount: z.number().int().min(0).default(0),
  promptTokensTotal: z.number().int().min(0).default(0),
  completionTokensTotal: z.number().int().min(0).default(0),
  totalCost: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  status: conversationStatusSchema.default("active"),
  createdByUserId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/** An immutable message within a conversation, ordered by `sequence`. */
export const conversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  role: conversationRoleSchema,
  content: z.string(),
  promptTokens: z.number().int().min(0).default(0),
  completionTokens: z.number().int().min(0).default(0),
  sequence: z.number().int().min(0),
  at: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/* ---- evaluation ------------------------------------------------------------ */

export const evaluationOutcomeSchema = z.enum(["pass", "fail", "flagged"]);
export type EvaluationOutcome = z.infer<typeof evaluationOutcomeSchema>;

export const evaluationResultSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  evaluator: z.string(),
  outcome: evaluationOutcomeSchema,
  score: z.number().int().min(0).max(100).nullable().default(null),
  notes: z.string().nullable().default(null),
  at: z.string(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
