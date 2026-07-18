"use server";

/* =============================================================================
 * Signals server actions (Sprint 5) — the ONLY write path from the UI.
 *
 * Every mutation: authenticate → verify capability → validate input (shared Zod)
 * → call the domain service (which enforces the lifecycle guard, appends the
 * transition audit, and emits a domain event) → revalidate affected routes →
 * return a typed result. The browser never writes to Supabase directly, never
 * supplies a trusted tenant id, and never sees a raw database error.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import { signalCreateInputSchema, type EvidenceItem } from "@brightloop/schema";
import {
  assertCapability,
  AuthorizationError,
  NotFoundError,
  TransitionError,
  ClientScopeError,
  SIGNAL_STATUSES,
} from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { getTransformationService } from "@/lib/repositories";

const WRITE_CAP = "transformation.signals.write";
const EVIDENCE_KINDS = ["metric", "document", "observation", "conversation", "external"] as const;

export interface CreateSignalResult {
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
  if (/signals_client_id_fkey/.test(message)) return "Choose a valid organization for this signal.";
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

function flattenZodErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Create a signal. Internal users legitimately pick the organization the signal
 * is about (they operate cross-org); the FK + internal-only RLS confirm it. The
 * service owns id/status(=detected)/attribution/timestamp.
 */
export async function createSignalAction(formData: FormData): Promise<CreateSignalResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, WRITE_CAP);

    const parsed = signalCreateInputSchema.safeParse({
      clientId: String(formData.get("clientId") ?? "").trim(),
      title: String(formData.get("title") ?? ""),
      detail: String(formData.get("detail") ?? ""),
      sourceRef: String(formData.get("sourceRef") ?? ""),
      evidence: buildEvidence(formData),
    });
    if (!parsed.success) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error.issues) };
    }

    const service = await getTransformationService();
    const signal = await service.createSignal(actor, {
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      detail: parsed.data.detail,
      sourceRef: parsed.data.sourceRef,
      evidence: parsed.data.evidence,
    });

    // The canonical audit lives in transition_log (written by the service); no
    // analytics taxonomy entry is needed for the signal trail.
    revalidatePath("/admin/signals");
    revalidatePath("/admin/dashboard");
    return { ok: true, id: signal.id };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to create signals." };
    return { ok: false, error: e instanceof Error ? friendlyError(e.message) : "Couldn't create the signal." };
  }
}

/**
 * Move a signal to a new lifecycle state. The domain service rejects any
 * transition not permitted by the canonical machine (and the DB guard rejects it
 * again), so an invalid or stale `to` fails closed with a clear message.
 */
export async function transitionSignalAction(input: {
  id: string;
  to: string;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, WRITE_CAP);

    if (!(SIGNAL_STATUSES as readonly string[]).includes(input.to)) {
      return { ok: false, error: "That is not a valid status." };
    }

    const service = await getTransformationService();
    const reason = input.reason?.trim();
    await service.transitionSignal(actor, input.id, input.to, reason && reason.length > 0 ? reason : undefined);

    revalidatePath(`/admin/signals/${input.id}`);
    revalidatePath("/admin/signals");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to change this signal." };
    if (e instanceof NotFoundError) return { ok: false, error: "That signal no longer exists." };
    if (e instanceof ClientScopeError) return { ok: false, error: "That signal is outside your access." };
    if (e instanceof TransitionError) return { ok: false, error: "That change isn't allowed from the signal's current status." };
    return { ok: false, error: e instanceof Error ? friendlyError(e.message) : "Couldn't update the signal." };
  }
}
