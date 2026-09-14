"use server";

/* Business Scan server actions (Phase 1C) — the ONLY write path. Authenticate →
 * capability → validate (shared Zod) → CoreSurfaceService → revalidate. The
 * browser never writes to Supabase directly. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { businessScanCreateInputSchema, scanFindingCreateInputSchema } from "@brightloop/schema";
import { assertCapability, AuthorizationError } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { readBaselineScores } from "@/lib/baseline-scores";
import { getCoreSurfaceService } from "@/lib/repositories";

const SCAN_WRITE = "transformation.scan.write";

export interface ActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function flatten(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Open a Business Scan (Diagnose) for an organization. Domains start unlit. */
export async function startScanAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const parsed = businessScanCreateInputSchema.safeParse({
      clientId: String(formData.get("clientId") ?? "").trim(),
      targetIndex: Number(formData.get("targetIndex") ?? 92),
    });
    if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flatten(parsed.error.issues) };

    const svc = await getCoreSurfaceService();
    // Idempotent: reuses an existing scan and seeds the seven domains exactly once.
    const scan = await svc.startDiagnosis(actor, { clientId: parsed.data.clientId, targetIndex: parsed.data.targetIndex });
    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true, id: scan.id };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to run a scan." };
    // Surface the real typed failure — never a silent success. The adapter throws
    // `core-surfaces.<op> failed: <db message>`; show it so the UI is honest.
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't start the scan." };
  }
}

/** Record a per-domain diagnosis finding. */
export async function addFindingAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const parsed = scanFindingCreateInputSchema.safeParse({
      scanId: String(formData.get("scanId") ?? ""),
      clientId: String(formData.get("clientId") ?? ""),
      domainKey: String(formData.get("domainKey") ?? ""),
      finding: String(formData.get("finding") ?? ""),
      baseline: String(formData.get("baseline") ?? ""),
      priority: String(formData.get("priority") ?? "medium"),
    });
    if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: flatten(parsed.error.issues) };

    const svc = await getCoreSurfaceService();
    await svc.addFinding(actor, parsed.data);
    revalidatePath("/admin/business-scan");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to add findings." };
    // Surface the typed failure, exactly as startScanAction does. This used to
    // discard `e.message` and return a fixed sentence, so a real database error
    // arrived as an unexplained refusal.
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the finding." };
  }
}

/* Server-rendered <form action> wrappers.
 * Start Diagnosis redirects back with the real error in ?scanError= on failure —
 * never a silent success — and to the clean workspace URL on success. */
export async function startScanForm(formData: FormData): Promise<void> {
  const result = await startScanAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&scanError=${encodeURIComponent(result.error ?? "Couldn't start the scan.")}`);
}
/**
 * Add Finding — the same contract as Start Diagnosis above.
 *
 * This used to `await addFindingAction(formData)` and DISCARD the result. A
 * refused write, a validation failure and a successful one were indistinguish-
 * able: the page re-rendered, the finding was simply not in the ledger, and
 * nothing anywhere said why. The redirect carries the real reason back instead,
 * matching the `?scanError=` pattern its sibling already used.
 */
export async function addFindingForm(formData: FormData): Promise<void> {
  const result = await addFindingAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&findingError=${encodeURIComponent(result.error ?? "Couldn't add the finding.")}`);
}

/* ---- Baseline scoring ------------------------------------------------------
 * Diagnosis produces a NUMBER, and until now nothing in the product could set
 * one. `upsertDomain` has always accepted `baselineScore`, the System Map and
 * the Index gauge have always read it, and no screen ever wrote it — so the
 * seven nodes stayed unlit and the Baseline Index stayed 0 no matter what you
 * did. "Start diagnosis" appeared to do nothing because the instrument it feeds
 * had no input.
 * ------------------------------------------------------------------------- */

/** Score the seven domains 0–100. A blank field leaves that domain untouched. */
export async function setBaselinesAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, SCAN_WRITE);

    const clientId = String(formData.get("clientId") ?? "").trim();
    if (!clientId) return { ok: false, error: "Missing the organization." };

    // Blank means "not scored yet", never zero — see baseline-scores.ts.
    const parsed = readBaselineScores(formData);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    if (parsed.scores.length === 0) {
      return { ok: false, error: "Nothing to save — enter a score for at least one domain." };
    }

    const svc = await getCoreSurfaceService();
    for (const { key, score } of parsed.scores) {
      await svc.upsertDomain(actor, { clientId, key, baselineScore: score });
    }

    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to score domains." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the baseline scores." };
  }
}

/** Form wrapper — carries the reason back, never a silent no-op. */
export async function setBaselinesForm(formData: FormData): Promise<void> {
  const result = await setBaselinesAction(formData);
  const clientId = String(formData.get("clientId") ?? "");
  const base = `/admin/business-scan?client=${encodeURIComponent(clientId)}`;
  redirect(result.ok ? base : `${base}&baselineError=${encodeURIComponent(result.error ?? "Couldn't save the baseline scores.")}`);
}
