"use server";

/* =============================================================================
 * Transformation Execution server actions (Phase D · Sprint D1).
 *
 * The ONLY write path for D1: seed a Transformation Workspace from a certified
 * scan. Authenticate → the seed use-case (which authorizes `transformation.write`
 * against the scan's tenant, reads the proposal read-only, and persists
 * idempotently) → revalidate. React never touches a repository or a runtime
 * service. Seeding is idempotent, so a double-submit returns the same workspace.
 * ========================================================================== */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isApplicationError, seedTransformation } from "@brightloop/application";
import { buildAppContext } from "@/lib/runtime-api";

const TRANSFORMATION_PATH = "/admin/transformation";

/**
 * Seed (or return the existing) transformation workspace for a scan run id, then
 * redirect to it. Idempotent — a double-submit lands on the same workspace. On a
 * known application error, redirect back with a surfaced message.
 */
export async function seedTransformationFormAction(formData: FormData): Promise<void> {
  const scanRunId = String(formData.get("scanRunId") ?? "").trim();
  if (scanRunId === "") redirect(`${TRANSFORMATION_PATH}?error=${encodeURIComponent("Enter a certified scan run id.")}`);

  let workspaceId: string;
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    const detail = await seedTransformation(ctx!, scanRunId);
    workspaceId = detail.workspace.id;
  } catch (error) {
    const message = isApplicationError(error) ? error.message : "Couldn't seed a workspace from that scan.";
    redirect(`${TRANSFORMATION_PATH}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(TRANSFORMATION_PATH);
  redirect(`${TRANSFORMATION_PATH}/${workspaceId}`);
}
