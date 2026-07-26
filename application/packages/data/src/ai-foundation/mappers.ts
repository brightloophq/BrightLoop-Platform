/* =============================================================================
 * AI Foundation — row ↔ domain mappers (Phase E · Sprint E1).
 * snake_case DB rows ↔ camelCase schemas. The type-safe boundary; adapters cast
 * through an untyped client, so these mappers (exercised by pgTAP + integration
 * suites) are the seam. jsonb arrays collapse defensively.
 * ========================================================================== */

import type {
  AiProvider, AuditEvent, Conversation, ConversationMessage, CostRecord, EvaluationResult,
  Prompt, PromptExecution, PromptResult, PromptVersion, UsageRecord,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;

export function providerRow(p: AiProvider): Record<string, unknown> {
  return { id: p.id, kind: p.kind, label: p.label, enabled: p.enabled, priority: p.priority, client_id: p.clientId, default_model: p.defaultModel, version: p.version, created_at: p.createdAt, updated_at: p.updatedAt };
}
export function toProvider(r: Record<string, unknown>): AiProvider {
  return { id: String(r["id"]), kind: r["kind"] as AiProvider["kind"], label: String(r["label"]), enabled: r["enabled"] !== false, priority: int(r["priority"]), clientId: nstr(r["client_id"]), defaultModel: nstr(r["default_model"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function promptRow(p: Prompt): Record<string, unknown> {
  return { id: p.id, workspace_id: p.workspaceId, client_id: p.clientId, name: p.name, description: p.description, tags: p.tags, owner_user_id: p.ownerUserId, status: p.status, active_version: p.activeVersion, version: p.version, created_at: p.createdAt, updated_at: p.updatedAt };
}
export function toPrompt(r: Record<string, unknown>): Prompt {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), description: nstr(r["description"]), tags: strArr(r["tags"]), ownerUserId: String(r["owner_user_id"]), status: r["status"] as Prompt["status"], activeVersion: r["active_version"] === null || r["active_version"] === undefined ? null : int(r["active_version"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function promptVersionRow(v: PromptVersion): Record<string, unknown> {
  return { id: v.id, prompt_id: v.promptId, workspace_id: v.workspaceId, client_id: v.clientId, version: v.version, system_prompt: v.systemPrompt, user_template: v.userTemplate, variables: v.variables, temperature: v.temperature, max_tokens: v.maxTokens, provider_preference: v.providerPreference, model: v.model, status: v.status, notes: v.notes, created_by_user_id: v.createdByUserId, created_at: v.createdAt };
}
export function toPromptVersion(r: Record<string, unknown>): PromptVersion {
  return { id: String(r["id"]), promptId: String(r["prompt_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), version: int(r["version"]), systemPrompt: String(r["system_prompt"] ?? ""), userTemplate: String(r["user_template"] ?? ""), variables: strArr(r["variables"]), temperature: num(r["temperature"], 0.7), maxTokens: int(r["max_tokens"], 1024), providerPreference: (r["provider_preference"] as PromptVersion["providerPreference"]) ?? null, model: nstr(r["model"]), status: r["status"] as PromptVersion["status"], notes: nstr(r["notes"]), createdByUserId: String(r["created_by_user_id"]), createdAt: String(r["created_at"]) };
}

export function executionRow(e: PromptExecution): Record<string, unknown> {
  return { id: e.id, workspace_id: e.workspaceId, client_id: e.clientId, prompt_id: e.promptId, prompt_version: e.promptVersion, mode: e.mode, provider: e.provider, model: e.model, status: e.status, duration_ms: e.durationMs, retry_count: e.retryCount, fallback_provider: e.fallbackProvider, requested_by_user_id: e.requestedByUserId, created_at: e.createdAt };
}
export function toExecution(r: Record<string, unknown>): PromptExecution {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), promptId: nstr(r["prompt_id"]), promptVersion: r["prompt_version"] === null || r["prompt_version"] === undefined ? null : int(r["prompt_version"]), mode: r["mode"] as PromptExecution["mode"], provider: r["provider"] as PromptExecution["provider"], model: String(r["model"]), status: r["status"] as PromptExecution["status"], durationMs: int(r["duration_ms"]), retryCount: int(r["retry_count"]), fallbackProvider: (r["fallback_provider"] as PromptExecution["fallbackProvider"]) ?? null, requestedByUserId: String(r["requested_by_user_id"]), createdAt: String(r["created_at"]) };
}

export function resultRow(x: PromptResult): Record<string, unknown> {
  return { id: x.id, execution_id: x.executionId, workspace_id: x.workspaceId, client_id: x.clientId, content: x.content, structured_valid: x.structuredValid, finish_reason: x.finishReason, created_at: x.createdAt };
}
export function toResult(r: Record<string, unknown>): PromptResult {
  return { id: String(r["id"]), executionId: String(r["execution_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), content: String(r["content"] ?? ""), structuredValid: r["structured_valid"] === null || r["structured_valid"] === undefined ? null : Boolean(r["structured_valid"]), finishReason: String(r["finish_reason"] ?? "stop"), createdAt: String(r["created_at"]) };
}

export function usageRow(u: UsageRecord): Record<string, unknown> {
  return { id: u.id, execution_id: u.executionId, workspace_id: u.workspaceId, client_id: u.clientId, provider: u.provider, model: u.model, prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, cached_tokens: u.cachedTokens, total_tokens: u.totalTokens, user_id: u.userId, at: u.at };
}
export function toUsage(r: Record<string, unknown>): UsageRecord {
  return { id: String(r["id"]), executionId: String(r["execution_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), provider: r["provider"] as UsageRecord["provider"], model: String(r["model"]), promptTokens: int(r["prompt_tokens"]), completionTokens: int(r["completion_tokens"]), cachedTokens: int(r["cached_tokens"]), totalTokens: int(r["total_tokens"]), userId: String(r["user_id"]), at: String(r["at"]) };
}

export function costRow(c: CostRecord): Record<string, unknown> {
  return { id: c.id, execution_id: c.executionId, workspace_id: c.workspaceId, client_id: c.clientId, input_cost: c.inputCost, output_cost: c.outputCost, total_cost: c.totalCost, currency: c.currency, pricing_version: c.pricingVersion, at: c.at };
}
export function toCost(r: Record<string, unknown>): CostRecord {
  return { id: String(r["id"]), executionId: String(r["execution_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), inputCost: num(r["input_cost"]), outputCost: num(r["output_cost"]), totalCost: num(r["total_cost"]), currency: String(r["currency"] ?? "USD"), pricingVersion: String(r["pricing_version"]), at: String(r["at"]) };
}

export function auditRow(a: AuditEvent): Record<string, unknown> {
  return { id: a.id, execution_id: a.executionId, workspace_id: a.workspaceId, client_id: a.clientId, provider: a.provider, model: a.model, prompt_version: a.promptVersion, user_id: a.userId, duration_ms: a.durationMs, status: a.status, retry_count: a.retryCount, fallback_provider: a.fallbackProvider, total_tokens: a.totalTokens, total_cost: a.totalCost, currency: a.currency, at: a.at };
}
export function toAudit(r: Record<string, unknown>): AuditEvent {
  return { id: String(r["id"]), executionId: String(r["execution_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), provider: r["provider"] as AuditEvent["provider"], model: String(r["model"]), promptVersion: r["prompt_version"] === null || r["prompt_version"] === undefined ? null : int(r["prompt_version"]), userId: String(r["user_id"]), durationMs: int(r["duration_ms"]), status: r["status"] as AuditEvent["status"], retryCount: int(r["retry_count"]), fallbackProvider: (r["fallback_provider"] as AuditEvent["fallbackProvider"]) ?? null, totalTokens: int(r["total_tokens"]), totalCost: num(r["total_cost"]), currency: String(r["currency"] ?? "USD"), at: String(r["at"]) };
}

export function conversationRow(c: Conversation): Record<string, unknown> {
  return { id: c.id, workspace_id: c.workspaceId, client_id: c.clientId, title: c.title, provider: c.provider, model: c.model, participants: c.participants, message_count: c.messageCount, prompt_tokens_total: c.promptTokensTotal, completion_tokens_total: c.completionTokensTotal, total_cost: c.totalCost, currency: c.currency, status: c.status, created_by_user_id: c.createdByUserId, version: c.version, created_at: c.createdAt, updated_at: c.updatedAt };
}
export function toConversation(r: Record<string, unknown>): Conversation {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"] ?? "Untitled conversation"), provider: r["provider"] as Conversation["provider"], model: String(r["model"]), participants: strArr(r["participants"]), messageCount: int(r["message_count"]), promptTokensTotal: int(r["prompt_tokens_total"]), completionTokensTotal: int(r["completion_tokens_total"]), totalCost: num(r["total_cost"]), currency: String(r["currency"] ?? "USD"), status: r["status"] as Conversation["status"], createdByUserId: String(r["created_by_user_id"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function messageRow(m: ConversationMessage): Record<string, unknown> {
  return { id: m.id, conversation_id: m.conversationId, workspace_id: m.workspaceId, client_id: m.clientId, role: m.role, content: m.content, prompt_tokens: m.promptTokens, completion_tokens: m.completionTokens, sequence: m.sequence, at: m.at };
}
export function toMessage(r: Record<string, unknown>): ConversationMessage {
  return { id: String(r["id"]), conversationId: String(r["conversation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), role: r["role"] as ConversationMessage["role"], content: String(r["content"] ?? ""), promptTokens: int(r["prompt_tokens"]), completionTokens: int(r["completion_tokens"]), sequence: int(r["sequence"]), at: String(r["at"]) };
}

export function evaluationRow(e: EvaluationResult): Record<string, unknown> {
  return { id: e.id, execution_id: e.executionId, workspace_id: e.workspaceId, client_id: e.clientId, evaluator: e.evaluator, outcome: e.outcome, score: e.score, notes: e.notes, at: e.at };
}
export function toEvaluation(r: Record<string, unknown>): EvaluationResult {
  return { id: String(r["id"]), executionId: String(r["execution_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), evaluator: String(r["evaluator"]), outcome: r["outcome"] as EvaluationResult["outcome"], score: r["score"] === null || r["score"] === undefined ? null : int(r["score"]), notes: nstr(r["notes"]), at: String(r["at"]) };
}
