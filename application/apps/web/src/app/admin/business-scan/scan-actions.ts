"use server";

/* Business Scan server actions (Phase 1C) — the ONLY write path. Authenticate →
 * capability → validate (shared Zod) → CoreSurfaceService → revalidate. The
 * browser never writes to Supabase directly. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { businessScanCreateInputSchema, scanFindingCreateInputSchema } from "@brightloop/schema";
import { assertCapability, AuthorizationError } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
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
    return { ok: false, error: "Couldn't add the finding." };
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
export async function addFindingForm(formData: FormData): Promise<void> {
  await addFindingAction(formData);
}
