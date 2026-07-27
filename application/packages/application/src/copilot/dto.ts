/* =============================================================================
 * AI Copilot DTOs (Phase F · Sprint F2) — the outward boundary.
 * ========================================================================== */

import type { CopilotAction, CopilotCitation, CopilotConversation, CopilotMessage } from "@brightloop/schema";

export interface CopilotConversationDTO { id: string; title: string; panel: CopilotConversation["panel"]; status: CopilotConversation["status"]; pinned: boolean; messageCount: number; lastIntent: string | null; createdAt: string; updatedAt: string; }
export const toCopilotConversationDTO = (c: CopilotConversation): CopilotConversationDTO => ({ id: c.id, title: c.title, panel: c.panel, status: c.status, pinned: c.pinned, messageCount: c.messageCount, lastIntent: c.lastIntent, createdAt: c.createdAt, updatedAt: c.updatedAt });

export interface CopilotMessageDTO { id: string; role: CopilotMessage["role"]; content: string; intent: string | null; state: CopilotMessage["state"]; capabilityKey: string | null; ok: boolean; order: number; createdAt: string; }
export const toCopilotMessageDTO = (m: CopilotMessage): CopilotMessageDTO => ({ id: m.id, role: m.role, content: m.content, intent: m.intent, state: m.state, capabilityKey: m.capabilityKey, ok: m.ok, order: m.order, createdAt: m.createdAt });

export interface CopilotCitationDTO { id: string; messageId: string; kind: CopilotCitation["kind"]; refId: string; title: string; href: string; }
export const toCopilotCitationDTO = (c: CopilotCitation): CopilotCitationDTO => ({ id: c.id, messageId: c.messageId, kind: c.kind, refId: c.refId, title: c.title, href: c.href });

export interface CopilotActionDTO { id: string; messageId: string | null; kind: CopilotAction["kind"]; label: string; capabilityKey: string | null; requiredPermission: string | null; enabled: boolean; requiresApproval: boolean; href: string; }
export const toCopilotActionDTO = (a: CopilotAction): CopilotActionDTO => ({ id: a.id, messageId: a.messageId, kind: a.kind, label: a.label, capabilityKey: a.capabilityKey, requiredPermission: a.requiredPermission, enabled: a.enabled, requiresApproval: a.requiresApproval, href: a.href });

/** The assembled context the Copilot reasons over (from existing read models). */
export interface ConversationContextDTO {
  workspaceId: string | null;
  workspaceTitle: string | null;
  panel: string;
  health: number | null;
  activeMissions: number;
  waitingApprovals: number;
  reportCount: number;
  automationCount: number;
  hasStrategy: boolean;
  hasPlan: boolean;
  hasAutomation: boolean;
  activeMissionId: string | null;
  permissions: string[];
  /** F3 runtime awareness — so the Copilot can answer deployment/runtime questions. */
  activeDeployments: number;
  failedDeployments: number;
  awaitingDeploymentApproval: number;
  runtimesHealthy: boolean;
}

/** The complete result of one assistant turn. */
export interface CopilotResponseDTO {
  message: CopilotMessageDTO;
  citations: CopilotCitationDTO[];
  actions: CopilotActionDTO[];
}

export interface ConversationDetailDTO {
  conversation: CopilotConversationDTO;
  messages: CopilotMessageDTO[];
  citations: CopilotCitationDTO[];
  actions: CopilotActionDTO[];
}
