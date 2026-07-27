/* =============================================================================
 * Copilot conversation memory (Phase F · Sprint F2) — PURE.
 *
 * SESSION memory only — the last referenced objects, last intent, last capability,
 * and open clarifications for a single conversation. This is NOT the E2 Knowledge
 * Base and never persists long-term business knowledge. A pure fold over the
 * conversation's messages + citations. No io.
 * ========================================================================== */

import type { CopilotCitation, CopilotIntent, CopilotMessage } from "@brightloop/schema";

export interface MemoryReference { kind: string; refId: string; title: string }
export interface ConversationMemory {
  turnCount: number;
  lastIntent: CopilotIntent | null;
  lastCapability: string | null;
  lastReferences: MemoryReference[];
  awaitingClarification: boolean;
}

/** Fold the conversation into its session memory (most recent state wins). */
export function foldMemory(messages: readonly CopilotMessage[], citations: readonly CopilotCitation[]): ConversationMemory {
  const assistant = [...messages].filter((m) => m.role === "assistant").sort((a, b) => a.order - b.order);
  const last = assistant[assistant.length - 1] ?? null;
  const lastRefs = last === null ? [] : citations.filter((c) => c.messageId === last.id).map((c) => ({ kind: c.kind, refId: c.refId, title: c.title }));
  return {
    turnCount: messages.filter((m) => m.role === "user").length,
    lastIntent: last?.intent ?? null,
    lastCapability: last?.capabilityKey ?? null,
    lastReferences: lastRefs.slice(0, 8),
    awaitingClarification: last?.intent === "clarification",
  };
}
