"use server";

/* =============================================================================
 * Insights server actions (Sprint 6) — the ONLY write path from the UI.
 *
 * Every mutation: authenticate → verify capability → resolve the parent Signal
 * (deriving the tenant from it, never trusting a client-supplied clientId) →
 * validate input (shared Zod) → call the domain service (which enforces the
 * lifecycle guard, appends the transition audit, and emits a domain event) →
 * revalidate affected routes → return a typed result. The browser never writes to
 * Supabase directly, never supplies a trusted tenant id, and never sees a raw
 * database error.
 *
 * NOTE (scope): Sprint 6 is deliberately NOT AI. An insight is authored by a
 * human; `confidence` is an optional manual rating. No model, prompt, scoring, or
 * clustering runs here — that is a later sprint.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import { insightCreateInputSchema, type EvidenceItem } from "@brightloop/schema";
import {
  assertCapability,
  AuthorizationError,
  NotFoundError,
  TransitionError,
  ClientScopeError,
  INSIGHT_STATUSES,
} from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { getInsightsRepository, getTransformationService } from "@/lib/repositories";

const WRITE_CAP = "transformation.insights.write";
const EVIDENCE_KINDS = ["metric", "document", "observation", "conversation", "external"] as const;

export interface CreateInsightResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Human-readable text for the few DB failures a form can actually trigger. */
function friendlyError(message: string): string {
  if (/insights_signal_id_fkey/.test(message)) return "Choose a valid signal for this insight.";
  if (/insights_client_id_fkey/.test(message)) return "The signal's organization is no longer valid.";
  if (/permission denied/i.test(message)) return "You don't have permission to do that.";
  return "Something went wrong. Please try again.";
}

/** Optional single evidence item captured from the form ("supporting context"). */
function buildEvidence(formData: FormData): EvidenceItem[] | undefined {
  const ref = String(formData.get("evidenceRef") ?? "").trim();
  if (!ref) return undefined;
  const kindRaw = String(formData.get("evidenceKind") ?? "observation");
  const kind = (EVIDENCE_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as EvidenceItem["kind"])
    : "observation";
  const label = String(formData.get("evidenceLabel") ?? "").trim();
  return [{ kind, ref, ...(label ? { label } : {}) }];
}

/**
 * Optional confidence — captured from the form as a 0–100 percentage and stored
 * as a calibrated 0..1 value. Blank/invalid → null (unrated). This is a manual
 * rating, never an AI score.
 */
function buildConfidence(formData: FormData): number | null {
  const raw = String(formData.get("confidence") ?? "").trim();
  if (!raw) return null;
  const pct = Number(raw);
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(1, pct / 100));
}

function flattenZodErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Create an insight. The insight interprets a Signal, so the tenant (`clientId`)
 * is derived from that Signal server-side — the form never supplies it, which
 * guarantees an insight cannot be filed under a different org than its signal.
 * The service owns id/status(=generated)/attribution/timestamp.
 */
export async function createInsightAction(formData: FormData): Promise<CreateInsightResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, WRITE_CAP);

    const signalId = String(formData.get("signalId") ?? "").trim();
    if (!signalId) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { signalId: "Select a signal" } };
    }

    // Derive the tenant from the parent signal — never trust a client-supplied id.
    const repo = await getInsightsRepository();
    const signal = await repo.signalRef(signalId);
    if (!signal) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { signalId: "That signal no longer exists." } };
    }

    const parsed = insightCreateInputSchema.safeParse({
      clientId: signal.clientId,
      signalId,
      summary: String(formData.get("summary") ?? ""),
      detail: String(formData.get("detail") ?? ""),
      confidence: buildConfidence(formData),
      evidence: buildEvidence(formData),
    });
    if (!parsed.success) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error.issues) };
    }

    const service = await getTransformationService();
    const insight = await service.createInsight(actor, {
      clientId: parsed.data.clientId,
      signalId: parsed.data.signalId,
      summary: parsed.data.summary,
      detail: parsed.data.detail,
      confidence: parsed.data.confidence ?? null,
      evidence: parsed.data.evidence,
    });

    revalidatePath("/admin/insights");
    revalidatePath(`/admin/signals/${signalId}`);
    revalidatePath("/admin/dashboard");
    return { ok: true, id: insight.id };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to create insights." };
    return { ok: false, error: e instanceof Error ? friendlyError(e.message) : "Couldn't create the insight." };
  }
}

/**
 * Move an insight to a new lifecycle state (Endorse / Dismiss). The domain service
 * rejects any transition not permitted by the canonical machine (and the DB guard
 * rejects it again), so an invalid or stale `to` fails closed with a clear message.
 */
export async function transitionInsightAction(input: {
  id: string;
  to: string;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, WRITE_CAP);

    if (!(INSIGHT_STATUSES as readonly string[]).includes(input.to)) {
      return { ok: false, error: "That is not a valid status." };
    }

    const service = await getTransformationService();
    const reason = input.reason?.trim();
    await service.transitionInsight(actor, input.id, input.to, reason && reason.length > 0 ? reason : undefined);

    revalidatePath(`/admin/insights/${input.id}`);
    revalidatePath("/admin/insights");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to change this insight." };
    if (e instanceof NotFoundError) return { ok: false, error: "That insight no longer exists." };
    if (e instanceof ClientScopeError) return { ok: false, error: "That insight is outside your access." };
    if (e instanceof TransitionError) return { ok: false, error: "That change isn't allowed from the insight's current status." };
    return { ok: false, error: e instanceof Error ? friendlyError(e.message) : "Couldn't update the insight." };
  }
}
