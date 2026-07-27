/* =============================================================================
 * Copilot domain tests (Phase F · Sprint F2) — pure units.
 *
 * Intent detection + slash commands, capability routing over the E7 registry,
 * permission-aware suggestions, session memory, and markdown/error composition.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  canTransitionConversation, capabilityGate, deriveSuggestedActions, detectIntent, foldMemory, renderAnswer,
  renderErrorAnswer, routeIntentToCapability, type SuggestionContext,
} from "./index.js";
import type { CopilotCitation, CopilotMessage } from "@brightloop/schema";

const T0 = "2026-07-27T00:00:00.000Z";

describe("intent detection", () => {
  it("classifies natural-language asks deterministically", () => {
    expect(detectIntent("What happened this week?").intent).toBe("summary");
    expect(detectIntent("Generate my weekly report").intent).toBe("reporting");
    expect(detectIntent("Create an execution plan").intent).toBe("planning");
    expect(detectIntent("Why is this project behind schedule?").intent).toBe("analysis");
    expect(detectIntent("Show pending approvals").intent).toBe("approval");
    expect(detectIntent("What should we prioritize next?").intent).toBe("analysis");
    expect(detectIntent("build a workflow").intent).toBe("automation");
  });
  it("parses slash commands", () => {
    const r = detectIntent("/report last week");
    expect(r.isCommand).toBe(true);
    expect(r.command).toBe("report");
    expect(r.intent).toBe("reporting");
    expect(detectIntent("/help").intent).toBe("clarification");
    expect(detectIntent("/context").intent).toBe("summary");
  });
});

describe("capability routing over the registry", () => {
  it("routes intents to real registry capability keys", () => {
    expect(routeIntentToCapability("reporting", { hasStrategy: false, hasPlan: false, hasAutomation: false }).capabilityKey).toBe("reporting.generate_report");
    expect(routeIntentToCapability("summary", { hasStrategy: false, hasPlan: false, hasAutomation: false }).capabilityKey).toBe("execution.get_workspace_state");
    expect(routeIntentToCapability("planning", { hasStrategy: false, hasPlan: true, hasAutomation: false }).mode).toBe("read");
    expect(routeIntentToCapability("question", { hasStrategy: false, hasPlan: false, hasAutomation: false }).mode).toBe("answer");
  });
  it("resolves registry gate facts (permission + approval + side effect)", () => {
    const gen = capabilityGate("reporting.generate_report");
    expect(gen.known).toBe(true);
    expect(gen.requiredPermission).toBe("report.generate");
    expect(gen.sideEffect).toBe("write");
    const pub = capabilityGate("automation.publish_workflow");
    expect(pub.requiresApproval).toBe(true);
    expect(capabilityGate("evil.exfiltrate").known).toBe(false);
    expect(capabilityGate(null).known).toBe(true); // answer-only routes have no capability
  });
});

describe("permission-aware suggestions", () => {
  const base: SuggestionContext = { hasApprovals: true, hasStrategy: true, hasPlan: false, reportCount: 3, hasAutomation: false, hasActiveMission: true, activeMissionId: "m1" };
  it("surfaces approvals and disables capabilities the role lacks", () => {
    const denied = deriveSuggestedActions("reporting", base, () => false);
    const gen = denied.find((a) => a.kind === "generate_report");
    expect(gen).toBeTruthy();
    expect(gen!.enabled).toBe(false); // roleHas() denied report.generate
    expect(denied.some((a) => a.kind === "review_approvals")).toBe(true);
    const allowed = deriveSuggestedActions("reporting", base, () => true);
    expect(allowed.find((a) => a.kind === "generate_report")!.enabled).toBe(true);
    expect(allowed.some((a) => a.kind === "continue_mission")).toBe(true);
  });
});

describe("session memory + lifecycle", () => {
  it("folds the last referenced objects + intent from the conversation", () => {
    const messages: CopilotMessage[] = [
      { id: "u1", conversationId: "c", workspaceId: "w", clientId: null, role: "user", content: "report?", intent: null, state: "completed", capabilityKey: null, ok: true, tokenTotal: 0, cost: 0, order: 0, createdAt: T0 },
      { id: "a1", conversationId: "c", workspaceId: "w", clientId: null, role: "assistant", content: "here", intent: "reporting", state: "completed", capabilityKey: "reporting.generate_report", ok: true, tokenTotal: 0, cost: 0, order: 1, createdAt: T0 },
    ];
    const citations: CopilotCitation[] = [{ id: "ci1", messageId: "a1", conversationId: "c", workspaceId: "w", clientId: null, kind: "report", refId: "r1", title: "Q3", href: "/workspace/reports", createdAt: T0 }];
    const mem = foldMemory(messages, citations);
    expect(mem.lastIntent).toBe("reporting");
    expect(mem.lastCapability).toBe("reporting.generate_report");
    expect(mem.lastReferences[0]!.refId).toBe("r1");
    expect(mem.turnCount).toBe(1);
  });
  it("guards conversation transitions", () => {
    expect(canTransitionConversation("active", "archived")).toBe(true);
    expect(canTransitionConversation("archived", "active")).toBe(true);
  });
});

describe("response composition", () => {
  it("renders markdown answers + tables and never leaks internals on error", () => {
    const md = renderAnswer({ headline: "This week", bullets: ["2 reports generated"], table: { columns: ["Metric", "Value"], rows: [["Health", "72"]] }, note: "from workspace read models" });
    expect(md).toContain("**This week**");
    expect(md).toContain("| Metric | Value |");
    const err = renderErrorAnswer("that report is not ready yet", ["Try again in a moment", "View existing reports"]);
    expect(err).toContain("couldn't complete");
    expect(err).not.toMatch(/stack|Error:|at .*\(/);
  });
});
