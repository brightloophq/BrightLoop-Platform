/* =============================================================================
 * Shared AI Action surface — pure state helpers (PX.1e). No React, no DOM.
 * ========================================================================== */

import type { AiActionOutcome, AiResultKind, AiViewState } from "./types";

/** Semantic tone for a result kind (drives the accent; never the only signal). */
export function resultTone(kind: AiResultKind): "info" | "caution" | "critical" | "positive" {
  switch (kind) {
    case "risk":
      return "critical";
    case "forecast":
      return "caution";
    case "recommendation":
    case "action-plan":
      return "positive";
    default:
      return "info";
  }
}

/** A confidence 0..1 → a compact percent label, or null when absent. */
export function formatConfidence(confidence: number | undefined): string | null {
  if (typeof confidence !== "number") return null;
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}% confidence`;
}

/** Is the view currently running an action? */
export function isBusy(state: AiViewState): boolean {
  return state.phase === "loading";
}

/** The action key currently shown/running, if any. */
export function activeKey(state: AiViewState): string | null {
  return state.phase === "idle" ? null : state.actionKey;
}

/** Whether an outcome permits a retry (errors + transient unavailability). */
export function canRetry(outcome: AiActionOutcome): boolean {
  return outcome.status === "error" || (outcome.status === "unavailable" && !outcome.futurePhase);
}

/** Whether the result body can be copied/exported (successful text only). */
export function canCopy(outcome: AiActionOutcome): boolean {
  return outcome.status === "ok" && outcome.result.body.trim().length > 0;
}
