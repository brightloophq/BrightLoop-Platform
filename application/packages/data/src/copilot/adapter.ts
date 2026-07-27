/* =============================================================================
 * Supabase AI Copilot repositories (Phase F · Sprint F2).
 *
 * Four adapters (untyped-cast pattern; mappers are the boundary). The conversation
 * is versioned (optimistic concurrency); every message / citation / action is
 * append-only. RLS scopes each row to its tenant.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type CopilotActionRepository, type CopilotCitationRepository, type CopilotConversationRepository,
  type CopilotMessageRepository, type RuntimeResult,
} from "@brightloop/domain";
import type { CopilotAction, CopilotCitation, CopilotConversation, CopilotMessage } from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const CONV = "copilot_conversation";
const MSG = "copilot_message";
const CIT = "copilot_citation";
const ACT = "copilot_action";

function appendMany<T>(db: SupabaseClient, table: string, toRow: (t: T) => Record<string, unknown>, toDomain: (r: Record<string, unknown>) => T, ctx: string) {
  return async (rows: readonly T[]): Promise<RuntimeResult<T[]>> => {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await db.from(table).insert(rows.map(toRow)).select("*");
    if (error) return mapDatabaseError(error, `${ctx}.appendMany`);
    return ok("created", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}
function listByConversation<T>(db: SupabaseClient, table: string, toDomain: (r: Record<string, unknown>) => T, ctx: string, orderCol: string) {
  return async (conversationId: string): Promise<RuntimeResult<T[]>> => {
    const { data, error } = await db.from(table).select("*").eq("conversation_id", conversationId).order(orderCol, { ascending: true });
    if (error) return mapDatabaseError(error, `${ctx}.listByConversation`);
    return ok("found", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}

export class SupabaseCopilotConversationRepository implements CopilotConversationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(c: CopilotConversation): Promise<RuntimeResult<CopilotConversation>> {
    const { data, error } = await this.db.from(CONV).insert(m.conversationRow(c)).select("*").single();
    if (error) return mapDatabaseError(error, "copilotConversation.create");
    return ok("created", m.toConversation(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<CopilotConversation | null>> {
    const { data, error } = await this.db.from(CONV).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "copilotConversation.getById");
    return ok("found", data ? m.toConversation(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<CopilotConversation[]>> {
    const { data, error } = await this.db.from(CONV).select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) return mapDatabaseError(error, "copilotConversation.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toConversation(r as Record<string, unknown>)));
  }
  async save(next: CopilotConversation, expectedVersion: number): Promise<RuntimeResult<CopilotConversation>> {
    const { data, error } = await this.db.from(CONV).update({ title: next.title, panel: next.panel, status: next.status, pinned: next.pinned, message_count: next.messageCount, last_intent: next.lastIntent, last_references: next.lastReferences, token_total: next.tokenTotal, cost: next.cost, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "copilotConversation.save");
    if (data === null) return err("conflict", "copilotConversation.save: version mismatch");
    return ok("updated", m.toConversation(data as Record<string, unknown>));
  }
}

export class SupabaseCopilotMessageRepository implements CopilotMessageRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly CopilotMessage[]) { return appendMany<CopilotMessage>(this.db, MSG, m.messageRow, m.toMessage, "copilotMessage")(rows); }
  listByConversation(id: string) { return listByConversation<CopilotMessage>(this.db, MSG, m.toMessage, "copilotMessage", "order_index")(id); }
}
export class SupabaseCopilotCitationRepository implements CopilotCitationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly CopilotCitation[]) { return appendMany<CopilotCitation>(this.db, CIT, m.citationRow, m.toCitation, "copilotCitation")(rows); }
  listByConversation(id: string) { return listByConversation<CopilotCitation>(this.db, CIT, m.toCitation, "copilotCitation", "created_at")(id); }
}
export class SupabaseCopilotActionRepository implements CopilotActionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly CopilotAction[]) { return appendMany<CopilotAction>(this.db, ACT, m.actionRow, m.toAction, "copilotAction")(rows); }
  listByConversation(id: string) { return listByConversation<CopilotAction>(this.db, ACT, m.toAction, "copilotAction", "created_at")(id); }
}
