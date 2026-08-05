"use server";

import { may } from "@brightloop/domain";
import type { AiActionOutcome } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { isDemoMode } from "@/lib/repositories";
import { lookupAiAction, type AiRoute } from "./matrix";
import { demoAiResult } from "./demo-content";

export interface AiActionContext {
  readonly route: AiRoute;
  readonly entityId?: string;
}

/**
 * Run a contextual AI action (PX.1e). The ONE server-action entry for every page's
 * AI bar. It authorizes with the SAME `may(actor, permission)` primitive the
 * certified Copilot/capability path uses, then:
 *   • Demo Mode → a deterministic, clearly-labeled demo result (no provider call);
 *   • production + future-phase → an honest "not available yet" state;
 *   • production + advisory/supported → routes to the real deterministic Copilot
 *     (handoff), where the same capability path executes over live data.
 *
 * No AI provider is ever called from the UI, and no second Copilot is introduced.
 * Bound per-route by the page: `runContextualAiAction.bind(null, { route })`.
 */
export async function runContextualAiAction(ctx: AiActionContext, actionKey: string): Promise<AiActionOutcome> {
  const actor = await getActor();
  if (!actor) return { status: "denied", message: "Sign in to use AI assistance." };

  const meta = lookupAiAction(ctx.route, actionKey);
  if (!meta) return { status: "unavailable", reason: "That AI action isn’t recognised.", futurePhase: false };

  if (meta.requiredPermission && !may(actor, meta.requiredPermission)) {
    return {
      status: "denied",
      message: `This action needs the “${meta.requiredPermission}” capability, which your role doesn’t have.`,
    };
  }

  const now = Date.now();

  if (await isDemoMode()) {
    return { status: "ok", result: demoAiResult(ctx.route, actionKey, meta, now) };
  }

  if (meta.status === "future") {
    return { status: "unavailable", reason: meta.futureReason ?? "This AI action isn’t available yet.", futurePhase: true };
  }

  // Advisory/supported in production: the platform's real AI is the deterministic,
  // cited Copilot. Hand off there (inline execution via generateCopilotResponse is
  // the documented next step) — never a provider call from here.
  return {
    status: "ok",
    result: {
      kind: meta.kind,
      title: meta.label,
      body: "Run this as a live, cited answer over your real data in the Copilot — it executes on the same certified capability path (authorization → application service → audited result).",
      evidence: [{ label: "Open the Copilot", href: "/workspace/copilot" }],
      generatedAt: new Date(now).toISOString(),
      capability: "copilot",
      advisory: true,
      demo: false,
      executable: null,
    },
  };
}
