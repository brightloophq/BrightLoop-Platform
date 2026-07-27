/* =============================================================================
 * Copilot builders + lifecycle (Phase F · Sprint F2) — PURE. The conversation is
 * a versioned root; messages / citations / actions are append-only. No io.
 * ========================================================================== */

import type {
  CopilotAction, CopilotActionKind, CopilotCitation, CopilotCitationKind, CopilotConversation,
  CopilotConversationStatus, CopilotIntent, CopilotMessage, CopilotMessageRole, CopilotPanel, CopilotResponseState,
} from "@brightloop/schema";

export const COPILOT_CONVERSATION_TRANSITIONS: Record<CopilotConversationStatus, readonly CopilotConversationStatus[]> = {
  active: ["archived"],
  archived: ["active"],
};
export function canTransitionConversation(from: CopilotConversationStatus, to: CopilotConversationStatus): boolean {
  return COPILOT_CONVERSATION_TRANSITIONS[from].includes(to);
}

export interface BuildCopilotConversationInput { id: string; workspaceId: string; clientId: string | null; title: string; panel: CopilotPanel; requestedByUserId: string; correlationId: string; now: string; }
export function buildCopilotConversation(i: BuildCopilotConversationInput): CopilotConversation {
  return { id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, title: i.title.slice(0, 300), panel: i.panel, status: "active", requestedByUserId: i.requestedByUserId, pinned: false, messageCount: 0, lastIntent: null, lastReferences: {}, correlationId: i.correlationId, tokenTotal: 0, cost: 0, version: 1, createdAt: i.now, updatedAt: i.now };
}

export interface BuildMessageInput { id: string; conversationId: string; workspaceId: string; clientId: string | null; role: CopilotMessageRole; content: string; intent?: CopilotIntent | null; state?: CopilotResponseState; capabilityKey?: string | null; ok?: boolean; tokenTotal?: number; cost?: number; order: number; now: string; }
export function buildCopilotMessage(m: BuildMessageInput): CopilotMessage {
  return { id: m.id, conversationId: m.conversationId, workspaceId: m.workspaceId, clientId: m.clientId, role: m.role, content: m.content, intent: m.intent ?? null, state: m.state ?? "completed", capabilityKey: m.capabilityKey ?? null, ok: m.ok ?? true, tokenTotal: m.tokenTotal ?? 0, cost: m.cost ?? 0, order: m.order, createdAt: m.now };
}

export function buildCopilotCitation(id: string, messageId: string, conversationId: string, workspaceId: string, clientId: string | null, kind: CopilotCitationKind, refId: string, title: string, href: string, now: string): CopilotCitation {
  return { id, messageId, conversationId, workspaceId, clientId, kind, refId, title: title.slice(0, 300), href, createdAt: now };
}

export interface BuildActionInput { id: string; conversationId: string; messageId: string | null; workspaceId: string; clientId: string | null; kind: CopilotActionKind; label: string; capabilityKey?: string | null; requiredPermission?: string | null; enabled?: boolean; requiresApproval?: boolean; href?: string; now: string; }
export function buildCopilotAction(a: BuildActionInput): CopilotAction {
  return { id: a.id, conversationId: a.conversationId, messageId: a.messageId, workspaceId: a.workspaceId, clientId: a.clientId, kind: a.kind, label: a.label.slice(0, 200), capabilityKey: a.capabilityKey ?? null, requiredPermission: a.requiredPermission ?? null, enabled: a.enabled ?? true, requiresApproval: a.requiresApproval ?? false, href: a.href ?? "", createdAt: a.now };
}
