/* =============================================================================
 * Route-to-AI capability matrix (PX.1e) — pure, unit-tested. The single source
 * of which AI actions each route exposes, the permission each needs, and whether
 * it is advisory/supported (runs on the certified path) or a future phase (honest
 * unavailable state — never a fabricated result in production).
 * ========================================================================== */

import type { AiActionDef } from "@brightloop/ui";

export type AiRoute = "console" | "signals" | "analytics" | "approvals";

export interface AiActionMeta extends AiActionDef {
  /** Permission required to run it (via `may`); null = any authenticated actor. */
  readonly requiredPermission: string | null;
  /**
   * advisory  — deterministic, read-model-composed answer on the certified path.
   * supported — backed by a dispatchable capability.
   * future    — read-model exists but no AI capability is wired yet.
   */
  readonly status: "advisory" | "supported" | "future";
  /** Shown in production when status = future. */
  readonly futureReason?: string;
}

const READ = "transformation.read";
const ANALYTICS = "analytics.read";

export const AI_ROUTES: Readonly<Record<AiRoute, readonly AiActionMeta[]>> = {
  console: [
    { key: "summarize-today", label: "Summarize today", icon: "book-open", kind: "summary", requiredPermission: READ, status: "advisory" },
    { key: "explain-health", label: "Explain business health", icon: "gauge", kind: "explanation", requiredPermission: READ, status: "advisory" },
    { key: "top-risks", label: "Top risks", icon: "bell", kind: "risk", requiredPermission: READ, status: "advisory" },
    { key: "next-actions", label: "Recommend next actions", icon: "target", kind: "recommendation", requiredPermission: READ, status: "advisory" },
  ],
  signals: [
    { key: "explain-signal", label: "Explain signal", icon: "lightbulb", kind: "explanation", requiredPermission: READ, status: "future", futureReason: "Signal-level AI reasoning is a future phase — no signals capability is wired on the certified path yet. Enable Demo Mode to preview it." },
    { key: "action-plan", label: "Generate action plan", icon: "route", kind: "action-plan", requiredPermission: READ, status: "future", futureReason: "Action-plan generation for signals is a future phase. Enable Demo Mode to preview it." },
    { key: "estimate-impact", label: "Estimate impact", icon: "trending-up", kind: "forecast", requiredPermission: READ, status: "future", futureReason: "Impact estimation for signals is a future phase. Enable Demo Mode to preview it." },
  ],
  analytics: [
    { key: "explain-trend", label: "Explain trend", icon: "trending-up", kind: "explanation", requiredPermission: ANALYTICS, status: "future", futureReason: "Analytics AI is a future phase — it will reuse the reporting capability once wired. Enable Demo Mode to preview it." },
    { key: "summarize-period", label: "Summarize period", icon: "book-open", kind: "summary", requiredPermission: ANALYTICS, status: "future", futureReason: "Period summaries are a future phase. Enable Demo Mode to preview it." },
  ],
  approvals: [
    { key: "summarize-request", label: "Summarize request", icon: "book-open", kind: "summary", requiredPermission: READ, status: "advisory" },
    { key: "highlight-risks", label: "Highlight risks", icon: "bell", kind: "risk", requiredPermission: READ, status: "advisory" },
  ],
};

/** Look up one action's metadata. */
export function lookupAiAction(route: AiRoute, key: string): AiActionMeta | undefined {
  return AI_ROUTES[route]?.find((a) => a.key === key);
}

/** The public action defs a page renders (strips server-only meta). */
export function actionDefs(route: AiRoute): AiActionDef[] {
  return (AI_ROUTES[route] ?? []).map(({ key, label, icon, kind }) => ({ key, label, icon, kind }));
}

/**
 * Whether to render the AI bar for a route in the current environment — avoids
 * "dead buttons": in production only when the route has an advisory/supported
 * action; in Demo Mode always (every action produces a labeled demo output).
 */
export function routeHasLiveAi(route: AiRoute): boolean {
  return (AI_ROUTES[route] ?? []).some((a) => a.status !== "future");
}
