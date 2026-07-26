/* =============================================================================
 * Supabase AI Foundation repositories (Phase E · Sprint E1).
 *
 * Production adapters for the eleven AI Foundation ports, constructed per request
 * with the caller's RLS-scoped session. Untyped-cast pattern; the mappers are the
 * type-safe boundary. Prompts + conversations use optimistic concurrency; versions,
 * results, usage, cost, audit, messages and evaluations are append-only.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type AiProviderRepository, type AuditEventRepository, type ConversationMessageRepository, type ConversationRepository,
  type CostRecordRepository, type EvaluationResultRepository, type PromptExecutionRepository, type PromptRepository,
  type PromptResultRepository, type PromptVersionRepository, type RuntimeResult, type UsageRecordRepository,
} from "@brightloop/domain";
import type {
  AiProvider, AuditEvent, Conversation, ConversationMessage, CostRecord, EvaluationResult,
  Prompt, PromptExecution, PromptResult, PromptVersion, UsageRecord,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const PROVIDER = "ai_provider";
const PROMPT = "ai_prompt";
const VERSION = "ai_prompt_version";
const EXEC = "ai_prompt_execution";
const RESULT = "ai_prompt_result";
const USAGE = "ai_usage_record";
const COST = "ai_cost_record";
const AUDIT = "ai_audit_event";
const CONV = "ai_conversation";
const MSG = "ai_conversation_message";
const EVAL = "ai_evaluation_result";

export class SupabaseAiProviderRepository implements AiProviderRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async upsert(p: AiProvider): Promise<RuntimeResult<AiProvider>> {
    const { data, error } = await this.db.from(PROVIDER).upsert(m.providerRow(p)).select("*").single();
    if (error) return mapDatabaseError(error, "aiProvider.upsert");
    return ok("updated", m.toProvider(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<AiProvider | null>> {
    const { data, error } = await this.db.from(PROVIDER).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "aiProvider.getById");
    return ok("found", data ? m.toProvider(data as Record<string, unknown>) : null);
  }
  async list(): Promise<RuntimeResult<AiProvider[]>> {
    const { data, error } = await this.db.from(PROVIDER).select("*").order("priority", { ascending: true });
    if (error) return mapDatabaseError(error, "aiProvider.list");
    return ok("found", (data ?? []).map((r) => m.toProvider(r as Record<string, unknown>)));
  }
}

export class SupabasePromptRepository implements PromptRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(p: Prompt): Promise<RuntimeResult<Prompt>> {
    const { data, error } = await this.db.from(PROMPT).insert(m.promptRow(p)).select("*").single();
    if (error) return mapDatabaseError(error, "prompt.create");
    return ok("created", m.toPrompt(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<Prompt | null>> {
    const { data, error } = await this.db.from(PROMPT).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "prompt.getById");
    return ok("found", data ? m.toPrompt(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Prompt[]>> {
    const { data, error } = await this.db.from(PROMPT).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "prompt.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toPrompt(r as Record<string, unknown>)));
  }
  async save(next: Prompt, expectedVersion: number): Promise<RuntimeResult<Prompt>> {
    const { data, error } = await this.db.from(PROMPT).update({ name: next.name, description: next.description, tags: next.tags, status: next.status, active_version: next.activeVersion, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "prompt.save");
    if (data === null) return err("conflict", "prompt.save: version mismatch");
    return ok("updated", m.toPrompt(data as Record<string, unknown>));
  }
}

export class SupabasePromptVersionRepository implements PromptVersionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(v: PromptVersion): Promise<RuntimeResult<PromptVersion>> {
    const { data, error } = await this.db.from(VERSION).insert(m.promptVersionRow(v)).select("*").single();
    if (error) { if (error.code === "23505") return err("conflict", "prompt version already exists"); return mapDatabaseError(error, "promptVersion.append"); }
    return ok("created", m.toPromptVersion(data as Record<string, unknown>));
  }
  async getByPromptAndVersion(promptId: string, version: number): Promise<RuntimeResult<PromptVersion | null>> {
    const { data, error } = await this.db.from(VERSION).select("*").eq("prompt_id", promptId).eq("version", version).maybeSingle();
    if (error) return mapDatabaseError(error, "promptVersion.getByPromptAndVersion");
    return ok("found", data ? m.toPromptVersion(data as Record<string, unknown>) : null);
  }
  async listByPrompt(promptId: string): Promise<RuntimeResult<PromptVersion[]>> {
    const { data, error } = await this.db.from(VERSION).select("*").eq("prompt_id", promptId).order("version", { ascending: true });
    if (error) return mapDatabaseError(error, "promptVersion.listByPrompt");
    return ok("found", (data ?? []).map((r) => m.toPromptVersion(r as Record<string, unknown>)));
  }
}

export class SupabasePromptExecutionRepository implements PromptExecutionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(e: PromptExecution): Promise<RuntimeResult<PromptExecution>> {
    const { data, error } = await this.db.from(EXEC).insert(m.executionRow(e)).select("*").single();
    if (error) return mapDatabaseError(error, "execution.create");
    return ok("created", m.toExecution(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<PromptExecution | null>> {
    const { data, error } = await this.db.from(EXEC).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "execution.getById");
    return ok("found", data ? m.toExecution(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<PromptExecution[]>> {
    const { data, error } = await this.db.from(EXEC).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "execution.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toExecution(r as Record<string, unknown>)));
  }
}

export class SupabasePromptResultRepository implements PromptResultRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(x: PromptResult): Promise<RuntimeResult<PromptResult>> {
    const { data, error } = await this.db.from(RESULT).insert(m.resultRow(x)).select("*").single();
    if (error) return mapDatabaseError(error, "result.append");
    return ok("created", m.toResult(data as Record<string, unknown>));
  }
  async getByExecution(executionId: string): Promise<RuntimeResult<PromptResult | null>> {
    const { data, error } = await this.db.from(RESULT).select("*").eq("execution_id", executionId).maybeSingle();
    if (error) return mapDatabaseError(error, "result.getByExecution");
    return ok("found", data ? m.toResult(data as Record<string, unknown>) : null);
  }
}

export class SupabaseUsageRecordRepository implements UsageRecordRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(r: UsageRecord): Promise<RuntimeResult<UsageRecord>> {
    const { data, error } = await this.db.from(USAGE).insert(m.usageRow(r)).select("*").single();
    if (error) return mapDatabaseError(error, "usage.append");
    return ok("created", m.toUsage(data as Record<string, unknown>));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<UsageRecord[]>> {
    const { data, error } = await this.db.from(USAGE).select("*").eq("workspace_id", workspaceId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "usage.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toUsage(r as Record<string, unknown>)));
  }
}

export class SupabaseCostRecordRepository implements CostRecordRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(r: CostRecord): Promise<RuntimeResult<CostRecord>> {
    const { data, error } = await this.db.from(COST).insert(m.costRow(r)).select("*").single();
    if (error) return mapDatabaseError(error, "cost.append");
    return ok("created", m.toCost(data as Record<string, unknown>));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<CostRecord[]>> {
    const { data, error } = await this.db.from(COST).select("*").eq("workspace_id", workspaceId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "cost.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toCost(r as Record<string, unknown>)));
  }
}

export class SupabaseAuditEventRepository implements AuditEventRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(e: AuditEvent): Promise<RuntimeResult<AuditEvent>> {
    const { data, error } = await this.db.from(AUDIT).insert(m.auditRow(e)).select("*").single();
    if (error) return mapDatabaseError(error, "audit.append");
    return ok("created", m.toAudit(data as Record<string, unknown>));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<AuditEvent[]>> {
    const { data, error } = await this.db.from(AUDIT).select("*").eq("workspace_id", workspaceId).order("at", { ascending: false });
    if (error) return mapDatabaseError(error, "audit.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toAudit(r as Record<string, unknown>)));
  }
}

export class SupabaseConversationRepository implements ConversationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(c: Conversation): Promise<RuntimeResult<Conversation>> {
    const { data, error } = await this.db.from(CONV).insert(m.conversationRow(c)).select("*").single();
    if (error) return mapDatabaseError(error, "conversation.create");
    return ok("created", m.toConversation(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<Conversation | null>> {
    const { data, error } = await this.db.from(CONV).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "conversation.getById");
    return ok("found", data ? m.toConversation(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<Conversation[]>> {
    const { data, error } = await this.db.from(CONV).select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) return mapDatabaseError(error, "conversation.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toConversation(r as Record<string, unknown>)));
  }
  async save(next: Conversation, expectedVersion: number): Promise<RuntimeResult<Conversation>> {
    const { data, error } = await this.db.from(CONV).update({ title: next.title, message_count: next.messageCount, prompt_tokens_total: next.promptTokensTotal, completion_tokens_total: next.completionTokensTotal, total_cost: next.totalCost, status: next.status, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "conversation.save");
    if (data === null) return err("conflict", "conversation.save: version mismatch");
    return ok("updated", m.toConversation(data as Record<string, unknown>));
  }
}

export class SupabaseConversationMessageRepository implements ConversationMessageRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(x: ConversationMessage): Promise<RuntimeResult<ConversationMessage>> {
    const { data, error } = await this.db.from(MSG).insert(m.messageRow(x)).select("*").single();
    if (error) return mapDatabaseError(error, "message.append");
    return ok("created", m.toMessage(data as Record<string, unknown>));
  }
  async listByConversation(conversationId: string): Promise<RuntimeResult<ConversationMessage[]>> {
    const { data, error } = await this.db.from(MSG).select("*").eq("conversation_id", conversationId).order("sequence", { ascending: true });
    if (error) return mapDatabaseError(error, "message.listByConversation");
    return ok("found", (data ?? []).map((r) => m.toMessage(r as Record<string, unknown>)));
  }
}

export class SupabaseEvaluationResultRepository implements EvaluationResultRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(e: EvaluationResult): Promise<RuntimeResult<EvaluationResult>> {
    const { data, error } = await this.db.from(EVAL).insert(m.evaluationRow(e)).select("*").single();
    if (error) return mapDatabaseError(error, "evaluation.append");
    return ok("created", m.toEvaluation(data as Record<string, unknown>));
  }
  async listByExecution(executionId: string): Promise<RuntimeResult<EvaluationResult[]>> {
    const { data, error } = await this.db.from(EVAL).select("*").eq("execution_id", executionId).order("at", { ascending: true });
    if (error) return mapDatabaseError(error, "evaluation.listByExecution");
    return ok("found", (data ?? []).map((r) => m.toEvaluation(r as Record<string, unknown>)));
  }
}
