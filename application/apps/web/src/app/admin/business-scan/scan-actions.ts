"use server";

/* Business Scan server actions (Phase 1C) — the ONLY write path. Authenticate →
 * capability → validate (shared Zod) → CoreSurfaceService → revalidate. The
 * browser never writes to Supabase directly. */

import { revalidatePath } from "next/cache";
import { businessScanCreateInputSchema, scanFindingCreateInputSchema, DOMAIN_KEYS } from "@brightloop/schema";
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
    const scan = await svc.createScan(actor, { clientId: parsed.data.clientId, baselineIndex: 0, targetIndex: parsed.data.targetIndex });
    // Seed the seven System Map nodes (unlit) so Diagnose + Activation have domains.
    for (const key of DOMAIN_KEYS) {
      await svc.upsertDomain(actor, { clientId: parsed.data.clientId, key, status: "not_operating" });
    }
    revalidatePath("/admin/business-scan");
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true, id: scan.id };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to run a scan." };
    return { ok: false, error: e instanceof Error ? "Couldn't start the scan." : "Couldn't start the scan." };
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

/* Void-returning wrappers for server-rendered <form action> use. */
export async function startScanForm(formData: FormData): Promise<void> {
  await startScanAction(formData);
}
export async function addFindingForm(formData: FormData): Promise<void> {
  await addFindingAction(formData);
}
