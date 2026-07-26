/* =============================================================================
 * AI Foundation — REPOSITORY PORTS (Phase E · Sprint E1).
 *
 * Persistence contracts the application depends on. Ports only; Supabase adapters
 * live in `@brightloop/data`. Every method returns `RuntimeResult`. Prompts +
 * conversations are versioned (optimistic concurrency). Prompt versions, results,
 * usage, cost, audit, messages and evaluations are append-only. RLS is the tenant
 * boundary; adapters add no filters.
 * ========================================================================== */

import type {
  AiProvider, AuditEvent, Conversation, ConversationMessage, CostRecord, EvaluationResult,
  Prompt, PromptExecution, PromptResult, PromptVersion, UsageRecord,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface AiProviderRepository {
  upsert(provider: AiProvider): Promise<RuntimeResult<AiProvider>>;
  getById(id: string): Promise<RuntimeResult<AiProvider | null>>;
  list(): Promise<RuntimeResult<AiProvider[]>>;
}

export interface PromptRepository {
  create(prompt: Prompt): Promise<RuntimeResult<Prompt>>;
  getById(id: string): Promise<RuntimeResult<Prompt | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Prompt[]>>;
  save(next: Prompt, expectedVersion: number): Promise<RuntimeResult<Prompt>>;
}

export interface PromptVersionRepository {
  /** Append an immutable version; unique on (promptId, version). */
  append(version: PromptVersion): Promise<RuntimeResult<PromptVersion>>;
  getByPromptAndVersion(promptId: string, version: number): Promise<RuntimeResult<PromptVersion | null>>;
  listByPrompt(promptId: string): Promise<RuntimeResult<PromptVersion[]>>;
}

export interface PromptExecutionRepository {
  create(execution: PromptExecution): Promise<RuntimeResult<PromptExecution>>;
  getById(id: string): Promise<RuntimeResult<PromptExecution | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<PromptExecution[]>>;
}

export interface PromptResultRepository {
  append(result: PromptResult): Promise<RuntimeResult<PromptResult>>;
  getByExecution(executionId: string): Promise<RuntimeResult<PromptResult | null>>;
}

export interface UsageRecordRepository {
  append(record: UsageRecord): Promise<RuntimeResult<UsageRecord>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<UsageRecord[]>>;
}

export interface CostRecordRepository {
  append(record: CostRecord): Promise<RuntimeResult<CostRecord>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<CostRecord[]>>;
}

export interface AuditEventRepository {
  append(event: AuditEvent): Promise<RuntimeResult<AuditEvent>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<AuditEvent[]>>;
}

export interface ConversationRepository {
  create(conversation: Conversation): Promise<RuntimeResult<Conversation>>;
  getById(id: string): Promise<RuntimeResult<Conversation | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Conversation[]>>;
  save(next: Conversation, expectedVersion: number): Promise<RuntimeResult<Conversation>>;
}

export interface ConversationMessageRepository {
  append(message: ConversationMessage): Promise<RuntimeResult<ConversationMessage>>;
  listByConversation(conversationId: string): Promise<RuntimeResult<ConversationMessage[]>>;
}

export interface EvaluationResultRepository {
  append(result: EvaluationResult): Promise<RuntimeResult<EvaluationResult>>;
  listByExecution(executionId: string): Promise<RuntimeResult<EvaluationResult[]>>;
}

/** The ports the AI Foundation application use-cases are wired with. */
export interface AiFoundationRepositories {
  providers: AiProviderRepository;
  prompts: PromptRepository;
  promptVersions: PromptVersionRepository;
  executions: PromptExecutionRepository;
  results: PromptResultRepository;
  usage: UsageRecordRepository;
  costs: CostRecordRepository;
  audit: AuditEventRepository;
  conversations: ConversationRepository;
  messages: ConversationMessageRepository;
  evaluations: EvaluationResultRepository;
}
