/* =============================================================================
 * AI Copilot (Phase F · Sprint F2) — schema contracts.
 *
 * A conversational PRESENTATION layer over Phases D & E. The Copilot is NOT a new
 * AI system: it orchestrates existing capabilities through the E7 Capability
 * Registry + Tool Gateway and consumes existing application services ONLY. It
 * never touches repositories, the database, providers, or adapters. Conversation
 * memory is SESSION-scoped and never replaces the E2 Knowledge Base. Additive; a
 * new `copilot` bounded context.
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

export const copilotIntentSchema = z.enum([
  "question", "command", "navigation", "summary", "explanation", "analysis", "planning",
  "reporting", "approval", "automation", "search", "clarification", "escalation",
  // F5 — billing & subscription questions (plan, usage, quota, invoices, upgrades).
  "billing",
]);
export type CopilotIntent = z.infer<typeof copilotIntentSchema>;

export const copilotMessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type CopilotMessageRole = z.infer<typeof copilotMessageRoleSchema>;

export const copilotPanelSchema = z.enum(["workspace", "project", "mission", "report", "automation", "approval", "agent"]);
export type CopilotPanel = z.infer<typeof copilotPanelSchema>;

export const copilotConversationStatusSchema = z.enum(["active", "archived"]);
export type CopilotConversationStatus = z.infer<typeof copilotConversationStatusSchema>;

/** The streaming lifecycle of a single assistant turn. */
export const copilotResponseStateSchema = z.enum(["thinking", "running_capability", "waiting_approval", "completed", "failed"]);
export type CopilotResponseState = z.infer<typeof copilotResponseStateSchema>;

export const copilotCitationKindSchema = z.enum(["report", "mission", "strategy", "artifact", "knowledge", "approval", "automation", "plan"]);
export type CopilotCitationKind = z.infer<typeof copilotCitationKindSchema>;

export const copilotActionKindSchema = z.enum([
  "generate_report", "review_approvals", "continue_mission", "resume_checkpoint", "analyze_risks",
  "compare_reports", "explain_kpi", "create_strategy", "generate_workflow", "view_timeline", "open_link",
]);
export type CopilotActionKind = z.infer<typeof copilotActionKindSchema>;

/* ---- conversation (versioned root) ----------------------------------------- */

export const copilotConversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  panel: copilotPanelSchema.default("workspace"),
  status: copilotConversationStatusSchema.default("active"),
  requestedByUserId: z.string(),
  pinned: z.boolean().default(false),
  messageCount: z.number().int().min(0).default(0),
  lastIntent: copilotIntentSchema.nullable().default(null),
  /** Session memory: the last objects the conversation referenced (for follow-ups). */
  lastReferences: z.record(z.unknown()).default({}),
  correlationId: z.string(),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CopilotConversation = z.infer<typeof copilotConversationSchema>;

/* ---- message (append-only) ------------------------------------------------- */

export const copilotMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  role: copilotMessageRoleSchema,
  content: z.string().default(""),
  intent: copilotIntentSchema.nullable().default(null),
  state: copilotResponseStateSchema.default("completed"),
  /** The capability the assistant routed through (via the registry), if any. */
  capabilityKey: z.string().nullable().default(null),
  /** Whether this turn hit an error (the error is explained in `content`). */
  ok: z.boolean().default(true),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type CopilotMessage = z.infer<typeof copilotMessageSchema>;

/* ---- citation (append-only; no hallucinated facts) ------------------------- */

export const copilotCitationSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: copilotCitationKindSchema,
  refId: z.string(),
  title: z.string().default(""),
  href: z.string().default(""),
  createdAt: z.string(),
});
export type CopilotCitation = z.infer<typeof copilotCitationSchema>;

/* ---- suggested action (append-only; permission-aware) ---------------------- */

export const copilotActionSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: copilotActionKindSchema,
  label: z.string().min(1).max(200),
  /** The registry capability this action would invoke (null for pure navigation). */
  capabilityKey: z.string().nullable().default(null),
  requiredPermission: z.string().nullable().default(null),
  /** Whether the caller may run it (resolved against the capability matrix). */
  enabled: z.boolean().default(true),
  /** Whether running it needs a human approval (registry-declared). */
  requiresApproval: z.boolean().default(false),
  href: z.string().default(""),
  createdAt: z.string(),
});
export type CopilotAction = z.infer<typeof copilotActionSchema>;
