/* =============================================================================
 * AI Copilot use-cases (Phase F · Sprint F2).
 *
 * The Copilot is a PRESENTATION layer: it detects intent, selects a capability
 * through the E7 Capability Registry, enforces the SAME registry gate the Tool
 * Gateway enforces (known key → authorization → approval → tenant), and dispatches
 * to EXISTING application services. It never invents facts (answers are composed
 * from assembled context + read-model results and are cited) and never bypasses a
 * service. Conversation memory is session-only. Deterministic; no live providers.
 * ========================================================================== */

import {
  buildCopilotAction, buildCopilotCitation, buildCopilotConversation, buildCopilotMessage, canTransitionConversation,
  capabilityGate, deriveSuggestedActions, detectIntent as domainDetectIntent, renderAnswer, renderCapabilityResult,
  renderErrorAnswer, routeIntentToCapability, may,
} from "@brightloop/domain";
import type {
  CopilotAction, CopilotCitation, CopilotConversation, CopilotIntent, CopilotPanel,
} from "@brightloop/schema";
import { createReport, generateExecutiveReport } from "../reporting/reporting-usecases.js";
import { getWorkspaceExecution } from "../transformation-execution/execution-read.js";
import { listExecutiveReports } from "../reporting/reporting-read.js";
import { listAgentMissions } from "../agents/agent-read.js";
import { assembleConversationContext } from "./context-assembler.js";
import {
  authorize, requireCopilot, COPILOT_READ_CAP, COPILOT_USE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import {
  toCopilotActionDTO, toCopilotCitationDTO, toCopilotConversationDTO, toCopilotMessageDTO,
  type ConversationContextDTO, type CopilotConversationDTO, type CopilotResponseDTO,
} from "./dto.js";

/* ---- conversation lifecycle ------------------------------------------------ */

export interface CreateCopilotConversationInput { workspaceId: string; title?: string; panel?: CopilotPanel; }
export async function createCopilotConversation(ctx: AppContext, input: CreateCopilotConversationInput): Promise<CopilotConversationDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const cp = requireCopilot(ctx);
  authorize(ctx.actor, COPILOT_USE_CAP, ctx.actor.clientId);
  const conv = buildCopilotConversation({ id: ctx.ids("conv"), workspaceId, clientId: ctx.actor.clientId, title: (input.title ?? "New conversation").slice(0, 300), panel: input.panel ?? "workspace", requestedByUserId: ctx.actor.userId, correlationId: ctx.ids("corr"), now: ctx.clock() });
  unwrap(await cp.conversations.create(conv));
  return toCopilotConversationDTO(conv);
}

async function loadConversation(ctx: AppContext, conversationId: string, cap: string) {
  const cp = requireCopilot(ctx);
  const conv = unwrap(await cp.conversations.getById(conversationId));
  if (conv === null) throw new NotFoundError("conversation");
  authorize(ctx.actor, cap, conv.clientId);
  return { cp, conv };
}

/** detectIntent — the public service form (deterministic classifier). */
export function detectCopilotIntent(text: string): { intent: CopilotIntent; isCommand: boolean; command: string | null } {
  const r = domainDetectIntent(requireString(text, "text"));
  return { intent: r.intent, isCommand: r.isCommand, command: r.command };
}

/** buildConversationContext — assemble the context from existing read models. */
export async function buildConversationContext(ctx: AppContext, rawConversationId: unknown): Promise<ConversationContextDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { conv } = await loadConversation(ctx, conversationId, COPILOT_READ_CAP);
  return assembleConversationContext(ctx, conv);
}

/* ---- the registry-gated capability invoker (Tool Gateway enforcement) ------- */

interface CapabilityOutcome { ok: boolean; summary: string; citation: { kind: CopilotCitation["kind"]; refId: string; title: string; href: string } | null; reason: string | null }

async function invokeCopilotCapability(ctx: AppContext, conv: CopilotConversation, capabilityKey: string): Promise<CapabilityOutcome> {
  const gate = capabilityGate(capabilityKey);
  if (!gate.known) return { ok: false, summary: "", citation: null, reason: "that capability is not in the registry" };
  if (gate.requiredPermission !== null && !may(ctx.actor, gate.requiredPermission)) return { ok: false, summary: "", citation: null, reason: "you don't have permission for that action" };
  if (gate.requiresApproval) return { ok: false, summary: "", citation: null, reason: "that action needs a human approval first" };
  const wid = conv.workspaceId;
  try {
    switch (capabilityKey) {
      case "reporting.generate_report": {
        const report = await createReport(ctx, wid, { kind: "executive_summary", title: `Copilot report — ${conv.title}` });
        const g = await generateExecutiveReport(ctx, report.id);
        return { ok: true, summary: `Generated an executive report: ${g.metricCount} metrics, ${g.insightCount} insights (${g.status}).`, citation: { kind: "report", refId: g.id, title: g.title, href: "/workspace/reports" }, reason: null };
      }
      case "execution.get_workspace_state": {
        const w = await getWorkspaceExecution(ctx, wid);
        return { ok: true, summary: `Workspace execution: ${w.tasks.length} tasks, ${w.reviews.length} reviews.`, citation: null, reason: null };
      }
      default:
        return { ok: false, summary: "", citation: null, reason: "that action is available from its dedicated screen" };
    }
  } catch (err) {
    return { ok: false, summary: "", citation: null, reason: err instanceof Error ? err.message.slice(0, 120) : "the capability failed" };
  }
}

/* ---- the orchestrator: generate a response --------------------------------- */

export async function generateCopilotResponse(ctx: AppContext, rawConversationId: unknown, rawText: unknown): Promise<CopilotResponseDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const text = requireString(rawText, "text").trim();
  if (text === "") throw new ValidationError("A message is required");
  const { cp, conv } = await loadConversation(ctx, conversationId, COPILOT_USE_CAP);

  const existing = unwrap(await cp.messages.listByConversation(conversationId));
  const nextOrder = existing.length;
  const intentR = domainDetectIntent(text);
  // 1) persist the user turn.
  unwrap(await cp.messages.appendMany([buildCopilotMessage({ id: ctx.ids("cmsg"), conversationId, workspaceId: conv.workspaceId, clientId: conv.clientId, role: "user", content: text.slice(0, 8000), intent: intentR.intent, order: nextOrder, now: ctx.clock() })]));

  // 2) assemble context (from existing read models) + fetch refs for citations.
  const context = await assembleConversationContext(ctx, conv);
  const [reports, missions] = await Promise.all([
    listExecutiveReports(ctx, conv.workspaceId).catch(() => []),
    listAgentMissions(ctx, conv.workspaceId).catch(() => []),
  ]);

  // 3) route intent → capability (registry).
  const route = routeIntentToCapability(intentR.intent, { hasStrategy: context.hasStrategy, hasPlan: context.hasPlan, hasAutomation: context.hasAutomation });
  const isImperative = intentR.isCommand || /^(generate|create|build|run|make|start|produce)\b/i.test(text);

  // 4) compose the answer + citations + capabilityKey.
  const citations: { kind: CopilotCitation["kind"]; refId: string; title: string; href: string }[] = [];
  let content: string;
  let capabilityKey: string | null = null;
  let ok = true;
  let state: "completed" | "failed" | "waiting_approval" = "completed";

  if (route.mode === "action" && route.capabilityKey && isImperative) {
    capabilityKey = route.capabilityKey;
    const outcome = await invokeCopilotCapability(ctx, conv, route.capabilityKey);
    if (outcome.ok) {
      content = renderCapabilityResult(outcome.summary, outcome.citation?.title ?? null);
      if (outcome.citation) citations.push(outcome.citation);
    } else {
      ok = false;
      state = outcome.reason?.includes("approval") ? "waiting_approval" : "failed";
      content = renderErrorAnswer(outcome.reason ?? "the action could not be completed", ["Review the item on its dedicated screen", "Ask me to summarize the current state"]);
    }
  } else {
    // Answer from assembled context (facts only — no hallucination), with citations.
    const bullets = [
      `Workspace health: ${context.health ?? "not scored yet"}${context.health !== null ? "/100" : ""}.`,
      `${context.activeMissions} active mission(s), ${context.waitingApprovals} awaiting approval.`,
      `${context.reportCount} report(s), ${context.automationCount} automation(s).`,
    ];
    content = renderAnswer({ headline: headlineFor(intentR.intent), bullets, note: "Composed from your live workspace read models." });
    const latestReport = reports[0];
    if (latestReport) citations.push({ kind: "report", refId: latestReport.id, title: latestReport.title, href: "/workspace/reports" });
    const activeMission = missions.find((m) => m.status === "waiting_for_approval") ?? missions[0];
    if (activeMission) citations.push({ kind: "mission", refId: activeMission.id, title: activeMission.title, href: `/workspace/missions/${activeMission.id}` });
    if (context.waitingApprovals > 0) citations.push({ kind: "approval", refId: "queue", title: `${context.waitingApprovals} pending approval(s)`, href: "/workspace/approvals" });
  }

  // 5) persist the assistant turn + its citations.
  const msgId = ctx.ids("cmsg");
  unwrap(await cp.messages.appendMany([buildCopilotMessage({ id: msgId, conversationId, workspaceId: conv.workspaceId, clientId: conv.clientId, role: "assistant", content, intent: intentR.intent, state, capabilityKey, ok, order: nextOrder + 1, now: ctx.clock() })]));
  const citationRows: CopilotCitation[] = citations.map((c) => buildCopilotCitation(ctx.ids("ccit"), msgId, conversationId, conv.workspaceId, conv.clientId, c.kind, c.refId, c.title, c.href, ctx.clock()));
  if (citationRows.length > 0) unwrap(await cp.citations.appendMany(citationRows));

  // 6) permission-aware suggested actions.
  const actionRows = await persistSuggestions(ctx, conv, msgId, intentR.intent, context, reports.length, missions);

  // 7) update conversation memory (session-scoped).
  const nextConv: CopilotConversation = { ...conv, messageCount: conv.messageCount + 2, lastIntent: intentR.intent, lastReferences: { citations: citations.map((c) => ({ kind: c.kind, refId: c.refId })) }, updatedAt: ctx.clock(), version: conv.version + 1 };
  unwrap(await cp.conversations.save(nextConv, conv.version));

  const assistantMsg = buildCopilotMessage({ id: msgId, conversationId, workspaceId: conv.workspaceId, clientId: conv.clientId, role: "assistant", content, intent: intentR.intent, state, capabilityKey, ok, order: nextOrder + 1, now: ctx.clock() });
  return { message: toCopilotMessageDTO(assistantMsg), citations: citationRows.map(toCopilotCitationDTO), actions: actionRows.map(toCopilotActionDTO) };
}

function headlineFor(intent: CopilotIntent): string {
  switch (intent) {
    case "summary": return "Here's what's happening";
    case "analysis": return "Analysis";
    case "explanation": return "Explanation";
    case "approval": return "Pending approvals";
    case "reporting": return "Reporting";
    default: return "Your workspace";
  }
}

async function persistSuggestions(ctx: AppContext, conv: CopilotConversation, messageId: string, intent: CopilotIntent, context: ConversationContextDTO, reportCount: number, missions: { id: string; status: string }[]): Promise<CopilotAction[]> {
  const cp = requireCopilot(ctx);
  const active = missions.find((m) => m.status === "running" || m.status === "planning" || m.status === "resuming");
  const derived = deriveSuggestedActions(intent, {
    hasApprovals: context.waitingApprovals > 0, hasStrategy: context.hasStrategy, hasPlan: context.hasPlan,
    reportCount, hasAutomation: context.hasAutomation, hasActiveMission: active !== undefined, activeMissionId: active?.id ?? null,
  }, (perm) => may(ctx.actor, perm));
  const rows = derived.map((d) => buildCopilotAction({ id: ctx.ids("cact"), conversationId: conv.id, messageId, workspaceId: conv.workspaceId, clientId: conv.clientId, kind: d.kind, label: d.label, capabilityKey: d.capabilityKey, requiredPermission: d.requiredPermission, enabled: d.enabled, requiresApproval: d.requiresApproval, href: d.href, now: ctx.clock() }));
  if (rows.length > 0) unwrap(await cp.actions.appendMany(rows));
  return rows;
}

/** suggestActions — the current permission-aware suggestions for a conversation. */
export async function suggestActions(ctx: AppContext, rawConversationId: unknown): Promise<ReturnType<typeof toCopilotActionDTO>[]> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { conv } = await loadConversation(ctx, conversationId, COPILOT_READ_CAP);
  const context = await assembleConversationContext(ctx, conv);
  const missions = await listAgentMissions(ctx, conv.workspaceId).catch(() => []);
  const rows = await persistSuggestions(ctx, conv, ctx.ids("cmsg"), conv.lastIntent ?? "summary", context, context.reportCount, missions);
  return rows.map(toCopilotActionDTO);
}

/** executeCopilotAction — run a suggested action's capability through the gate. */
export async function executeCopilotAction(ctx: AppContext, rawConversationId: unknown, capabilityKey: unknown): Promise<CopilotResponseDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const key = requireString(capabilityKey, "capabilityKey");
  const { cp, conv } = await loadConversation(ctx, conversationId, COPILOT_USE_CAP);
  const outcome = await invokeCopilotCapability(ctx, conv, key);
  const existing = unwrap(await cp.messages.listByConversation(conversationId));
  const content = outcome.ok ? renderCapabilityResult(outcome.summary, outcome.citation?.title ?? null) : renderErrorAnswer(outcome.reason ?? "that action could not run", ["Open the item on its screen", "Ask me for a summary"]);
  const msgId = ctx.ids("cmsg");
  unwrap(await cp.messages.appendMany([buildCopilotMessage({ id: msgId, conversationId, workspaceId: conv.workspaceId, clientId: conv.clientId, role: "assistant", content, intent: "command", state: outcome.ok ? "completed" : "failed", capabilityKey: key, ok: outcome.ok, order: existing.length, now: ctx.clock() })]));
  const citations = outcome.citation ? [buildCopilotCitation(ctx.ids("ccit"), msgId, conversationId, conv.workspaceId, conv.clientId, outcome.citation.kind, outcome.citation.refId, outcome.citation.title, outcome.citation.href, ctx.clock())] : [];
  if (citations.length > 0) unwrap(await cp.citations.appendMany(citations));
  unwrap(await cp.conversations.save({ ...conv, messageCount: conv.messageCount + 1, updatedAt: ctx.clock(), version: conv.version + 1 }, conv.version));
  const msg = buildCopilotMessage({ id: msgId, conversationId, workspaceId: conv.workspaceId, clientId: conv.clientId, role: "assistant", content, intent: "command", state: outcome.ok ? "completed" : "failed", capabilityKey: key, ok: outcome.ok, order: existing.length, now: ctx.clock() });
  return { message: toCopilotMessageDTO(msg), citations: citations.map(toCopilotCitationDTO), actions: [] };
}

export async function archiveConversation(ctx: AppContext, rawConversationId: unknown): Promise<CopilotConversationDTO> {
  const conversationId = requireId(rawConversationId, "conversationId");
  const { cp, conv } = await loadConversation(ctx, conversationId, COPILOT_USE_CAP);
  if (!canTransitionConversation(conv.status, "archived")) throw new ConflictError("Cannot archive this conversation");
  const next = { ...conv, status: "archived" as const, updatedAt: ctx.clock(), version: conv.version + 1 };
  unwrap(await cp.conversations.save(next, conv.version));
  return toCopilotConversationDTO(next);
}
