/* =============================================================================
 * AI Copilot — row ↔ domain mappers (Phase F · Sprint F2). The conversation's
 * `last_references` is jsonb (session memory); everything else is scalar. The
 * type-safe boundary between Supabase rows and the domain aggregates.
 * ========================================================================== */

import type { CopilotAction, CopilotCitation, CopilotConversation, CopilotMessage } from "@brightloop/schema";

const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function conversationRow(c: CopilotConversation): Record<string, unknown> {
  return { id: c.id, workspace_id: c.workspaceId, client_id: c.clientId, title: c.title, panel: c.panel, status: c.status, requested_by_user_id: c.requestedByUserId, pinned: c.pinned, message_count: c.messageCount, last_intent: c.lastIntent, last_references: c.lastReferences, correlation_id: c.correlationId, token_total: c.tokenTotal, cost: c.cost, version: c.version, created_at: c.createdAt, updated_at: c.updatedAt };
}
export function toConversation(r: Record<string, unknown>): CopilotConversation {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), panel: r["panel"] as CopilotConversation["panel"], status: r["status"] as CopilotConversation["status"], requestedByUserId: String(r["requested_by_user_id"]), pinned: r["pinned"] === true, messageCount: int(r["message_count"]), lastIntent: (r["last_intent"] ?? null) as CopilotConversation["lastIntent"], lastReferences: obj(r["last_references"]), correlationId: String(r["correlation_id"] ?? ""), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function messageRow(m: CopilotMessage): Record<string, unknown> {
  return { id: m.id, conversation_id: m.conversationId, workspace_id: m.workspaceId, client_id: m.clientId, role: m.role, content: m.content, intent: m.intent, state: m.state, capability_key: m.capabilityKey, ok: m.ok, token_total: m.tokenTotal, cost: m.cost, order_index: m.order, created_at: m.createdAt };
}
export function toMessage(r: Record<string, unknown>): CopilotMessage {
  return { id: String(r["id"]), conversationId: String(r["conversation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), role: r["role"] as CopilotMessage["role"], content: String(r["content"] ?? ""), intent: (r["intent"] ?? null) as CopilotMessage["intent"], state: r["state"] as CopilotMessage["state"], capabilityKey: nstr(r["capability_key"]), ok: r["ok"] !== false, tokenTotal: int(r["token_total"]), cost: num(r["cost"]), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function citationRow(c: CopilotCitation): Record<string, unknown> {
  return { id: c.id, message_id: c.messageId, conversation_id: c.conversationId, workspace_id: c.workspaceId, client_id: c.clientId, kind: c.kind, ref_id: c.refId, title: c.title, href: c.href, created_at: c.createdAt };
}
export function toCitation(r: Record<string, unknown>): CopilotCitation {
  return { id: String(r["id"]), messageId: String(r["message_id"]), conversationId: String(r["conversation_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as CopilotCitation["kind"], refId: String(r["ref_id"]), title: String(r["title"] ?? ""), href: String(r["href"] ?? ""), createdAt: String(r["created_at"]) };
}

export function actionRow(a: CopilotAction): Record<string, unknown> {
  return { id: a.id, conversation_id: a.conversationId, message_id: a.messageId, workspace_id: a.workspaceId, client_id: a.clientId, kind: a.kind, label: a.label, capability_key: a.capabilityKey, required_permission: a.requiredPermission, enabled: a.enabled, requires_approval: a.requiresApproval, href: a.href, created_at: a.createdAt };
}
export function toAction(r: Record<string, unknown>): CopilotAction {
  return { id: String(r["id"]), conversationId: String(r["conversation_id"]), messageId: nstr(r["message_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as CopilotAction["kind"], label: String(r["label"]), capabilityKey: nstr(r["capability_key"]), requiredPermission: nstr(r["required_permission"]), enabled: r["enabled"] !== false, requiresApproval: r["requires_approval"] === true, href: String(r["href"] ?? ""), createdAt: String(r["created_at"]) };
}
