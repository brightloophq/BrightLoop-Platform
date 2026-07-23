"use server";

/* =============================================================================
 * Prospect Scanner server actions (Phase C · Sprint C4) — the ONLY write path.
 *
 * Authenticate → capability → validate (pure `parseProspectScanForm`) → C1
 * use-case → revalidate. React never touches a repository or a runtime service:
 * every mutation goes through `@brightloop/application`, so authorization,
 * tenancy, validation and the error taxonomy are the same ones the public API
 * enforces.
 *
 * Stage execution deliberately does NOT live here — it goes through the C2.1
 * internal `POST /api/internal/runtime/run-once` entry point, one stage per
 * click. Nothing in this file loops, schedules, or advances more than one stage.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelScan, createScan, isApplicationError, retryScan } from "@brightloop/application";
import { buildAppContext } from "@/lib/runtime-api";
import { parseProspectScanForm, type FieldErrors } from "@/lib/prospect-form";

export interface ScannerActionResult {
  ok: boolean;
  /** The created run id, on success. */
  id?: string;
  error?: string;
  fieldErrors?: FieldErrors;
}

const SCANNER_PATH = "/admin/prospect-scanner";

function failure(error: unknown, fallback: string): ScannerActionResult {
  // Only a canonical ApplicationError message crosses back — never a stack,
  // SQLSTATE, or runtime failure code.
  if (isApplicationError(error)) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/** Create a controlled prospect scan through the C1 create-scan use-case. */
export async function createProspectScanAction(formData: FormData): Promise<ScannerActionResult> {
  const parsed = parseProspectScanForm(formData);
  if (!parsed.ok || parsed.value === undefined) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors ?? {} };
  }

  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "You are not signed in." };

    const scan = await createScan(ctx, {
      clientId: parsed.value.clientId,
      metadata: parsed.value.metadata,
    });

    revalidatePath(SCANNER_PATH);
    return { ok: true, id: scan.id };
  } catch (error) {
    return failure(error, "Couldn't create the scan.");
  }
}

/** Cancel a non-terminal scan. */
export async function cancelProspectScanAction(runId: string): Promise<ScannerActionResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "You are not signed in." };
    await cancelScan(ctx, runId);
    revalidatePath(`${SCANNER_PATH}/${runId}`);
    revalidatePath(SCANNER_PATH);
    return { ok: true, id: runId };
  } catch (error) {
    return failure(error, "Couldn't cancel the scan.");
  }
}

/** Retry a stuck scan from its last valid checkpoint, when eligible. */
export async function retryProspectScanAction(runId: string): Promise<ScannerActionResult> {
  try {
    const ctx = await buildAppContext();
    if (ctx === null) return { ok: false, error: "You are not signed in." };
    await retryScan(ctx, runId);
    revalidatePath(`${SCANNER_PATH}/${runId}`);
    revalidatePath(SCANNER_PATH);
    return { ok: true, id: runId };
  } catch (error) {
    return failure(error, "Couldn't retry the scan.");
  }
}

/**
 * `useActionState` signature for the create form: returns field-level errors to
 * render inline, and redirects INTO the new workspace on success (redirect
 * throws, so nothing is returned in that case).
 */
export async function createProspectScanState(_prev: ScannerActionResult, formData: FormData): Promise<ScannerActionResult> {
  const result = await createProspectScanAction(formData);
  if (result.ok && result.id !== undefined) redirect(`${SCANNER_PATH}/${result.id}`);
  return result;
}

/* ---- form wrappers ----------------------------------------------------------- */

/**
 * Server-rendered `<form action>` wrapper. On success it redirects INTO the new
 * scan's workspace; on failure it returns to the form with the reason in the
 * query string — never a silent success.
 */
export async function createProspectScanForm(formData: FormData): Promise<void> {
  const result = await createProspectScanAction(formData);
  if (result.ok && result.id !== undefined) redirect(`${SCANNER_PATH}/${result.id}`);

  const params = new URLSearchParams();
  params.set("formError", result.error ?? "Couldn't create the scan.");
  for (const [field, message] of Object.entries(result.fieldErrors ?? {})) params.append("fieldError", `${field}:${message}`);
  redirect(`${SCANNER_PATH}?${params.toString()}`);
}

export async function cancelProspectScanForm(formData: FormData): Promise<void> {
  const runId = String(formData.get("runId") ?? "");
  const result = await cancelProspectScanAction(runId);
  redirect(result.ok ? `${SCANNER_PATH}/${runId}` : `${SCANNER_PATH}/${runId}?actionError=${encodeURIComponent(result.error ?? "Couldn't cancel.")}`);
}

export async function retryProspectScanForm(formData: FormData): Promise<void> {
  const runId = String(formData.get("runId") ?? "");
  const result = await retryProspectScanAction(runId);
  redirect(result.ok ? `${SCANNER_PATH}/${runId}` : `${SCANNER_PATH}/${runId}?actionError=${encodeURIComponent(result.error ?? "Couldn't retry.")}`);
}
