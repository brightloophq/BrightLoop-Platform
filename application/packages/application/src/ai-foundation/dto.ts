/* =============================================================================
 * AI Foundation DTOs (Phase E · Sprint E1) — the outward boundary.
 * ========================================================================== */

import type {
  AiModelDescriptor, AiProvider, AuditEvent, Conversation, ConversationMessage, CostRecord,
  EvaluationResult, Prompt, PromptExecution, PromptResult, PromptVersion, UsageRecord,
} from "@brightloop/schema";

export interface PromptDTO {
  id: string; name: string; description: string | null; tags: string[];
  status: Prompt["status"]; activeVersion: number | null; ownerUserId: string; version: number;
  createdAt: string; updatedAt: string;
}
export const toPromptDTO = (p: Prompt): PromptDTO => ({ id: p.id, name: p.name, description: p.description, tags: p.tags, status: p.status, activeVersion: p.activeVersion, ownerUserId: p.ownerUserId, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt });

export interface PromptVersionDTO {
  id: string; promptId: string; version: number; systemPrompt: string; userTemplate: string;
  variables: string[]; temperature: number; maxTokens: number; providerPreference: PromptVersion["providerPreference"];
  model: string | null; status: PromptVersion["status"]; notes: string | null; createdByUserId: string; createdAt: string;
}
export const toPromptVersionDTO = (v: PromptVersion): PromptVersionDTO => ({ id: v.id, promptId: v.promptId, version: v.version, systemPrompt: v.systemPrompt, userTemplate: v.userTemplate, variables: v.variables, temperature: v.temperature, maxTokens: v.maxTokens, providerPreference: v.providerPreference, model: v.model, status: v.status, notes: v.notes, createdByUserId: v.createdByUserId, createdAt: v.createdAt });

export interface UsageDTO { promptTokens: number; completionTokens: number; cachedTokens: number; totalTokens: number; }
export interface CostDTO { inputCost: number; outputCost: number; totalCost: number; currency: string; pricingVersion: string; }

/** The full outcome of one execution: audit-backed execution + result + usage + cost. */
export interface ExecutionResultDTO {
  executionId: string;
  status: PromptExecution["status"];
  provider: PromptExecution["provider"];
  model: string;
  mode: PromptExecution["mode"];
  retryCount: number;
  fallbackProvider: PromptExecution["fallbackProvider"];
  durationMs: number;
  content: string;
  structuredValid: boolean | null;
  finishReason: string;
  usage: UsageDTO;
  cost: CostDTO;
}

export interface ExecutionSummaryDTO {
  id: string; promptId: string | null; promptVersion: number | null; mode: PromptExecution["mode"];
  provider: PromptExecution["provider"]; model: string; status: PromptExecution["status"];
  retryCount: number; fallbackProvider: PromptExecution["fallbackProvider"]; durationMs: number;
  requestedByUserId: string; createdAt: string;
}
export const toExecutionSummaryDTO = (e: PromptExecution): ExecutionSummaryDTO => ({ id: e.id, promptId: e.promptId, promptVersion: e.promptVersion, mode: e.mode, provider: e.provider, model: e.model, status: e.status, retryCount: e.retryCount, fallbackProvider: e.fallbackProvider, durationMs: e.durationMs, requestedByUserId: e.requestedByUserId, createdAt: e.createdAt });

export interface ExecutionHistoryPageDTO { items: ExecutionSummaryDTO[]; nextCursor: string | null; }

export interface ConversationDTO {
  id: string; title: string; provider: Conversation["provider"]; model: string; status: Conversation["status"];
  participants: string[]; messageCount: number; promptTokensTotal: number; completionTokensTotal: number;
  totalCost: number; currency: string; version: number; createdAt: string; updatedAt: string;
}
export const toConversationDTO = (c: Conversation): ConversationDTO => ({ id: c.id, title: c.title, provider: c.provider, model: c.model, status: c.status, participants: c.participants, messageCount: c.messageCount, promptTokensTotal: c.promptTokensTotal, completionTokensTotal: c.completionTokensTotal, totalCost: c.totalCost, currency: c.currency, version: c.version, createdAt: c.createdAt, updatedAt: c.updatedAt });

export interface ConversationMessageDTO { id: string; role: ConversationMessage["role"]; content: string; promptTokens: number; completionTokens: number; sequence: number; at: string; }
export const toConversationMessageDTO = (m: ConversationMessage): ConversationMessageDTO => ({ id: m.id, role: m.role, content: m.content, promptTokens: m.promptTokens, completionTokens: m.completionTokens, sequence: m.sequence, at: m.at });

export interface ConversationHistoryDTO { conversation: ConversationDTO; messages: ConversationMessageDTO[]; }

/** A day/month usage rollup bucket. */
export interface UsageBucketDTO { period: string; promptTokens: number; completionTokens: number; totalTokens: number; executions: number; }
export interface UsageDashboardDTO { totalTokens: number; totalExecutions: number; daily: UsageBucketDTO[]; monthly: UsageBucketDTO[]; }

export interface CostBucketDTO { period: string; totalCost: number; currency: string; }
export interface CostDashboardDTO { totalCost: number; currency: string; daily: CostBucketDTO[]; monthly: CostBucketDTO[]; }

export interface ProviderHealthDTO { kind: AiProvider["kind"]; status: string; models: string[]; }

export interface AuditEventDTO {
  id: string; executionId: string; provider: AuditEvent["provider"]; model: string; promptVersion: number | null;
  userId: string; durationMs: number; status: AuditEvent["status"]; retryCount: number;
  fallbackProvider: AuditEvent["fallbackProvider"]; totalTokens: number; totalCost: number; currency: string; at: string;
}
export const toAuditEventDTO = (a: AuditEvent): AuditEventDTO => ({ id: a.id, executionId: a.executionId, provider: a.provider, model: a.model, promptVersion: a.promptVersion, userId: a.userId, durationMs: a.durationMs, status: a.status, retryCount: a.retryCount, fallbackProvider: a.fallbackProvider, totalTokens: a.totalTokens, totalCost: a.totalCost, currency: a.currency, at: a.at });

export interface EvaluationDTO { id: string; executionId: string; evaluator: string; outcome: EvaluationResult["outcome"]; score: number | null; notes: string | null; at: string; }
export const toEvaluationDTO = (e: EvaluationResult): EvaluationDTO => ({ id: e.id, executionId: e.executionId, evaluator: e.evaluator, outcome: e.outcome, score: e.score, notes: e.notes, at: e.at });

export type ModelDescriptorDTO = AiModelDescriptor;
export const toResultDTO = (r: PromptResult): { content: string; structuredValid: boolean | null; finishReason: string } => ({ content: r.content, structuredValid: r.structuredValid, finishReason: r.finishReason });
export type ProviderDTO = Pick<AiProvider, "id" | "kind" | "label" | "enabled" | "priority" | "defaultModel">;
export const toProviderDTO = (p: AiProvider): ProviderDTO => ({ id: p.id, kind: p.kind, label: p.label, enabled: p.enabled, priority: p.priority, defaultModel: p.defaultModel });
export type { UsageRecord, CostRecord };
