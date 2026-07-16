"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { performTransition } from "../admin/transition-service";

/**
 * Client portal write actions — the J3 approval loop (handoff §07).
 *
 * These reuse the SAME guarded transition service the admin uses. The only
 * difference is the capability required: a client approving passes
 * `own.deliverables.approve`, which only client_admin holds. client_member has
 * `own.deliverables.comment` and is refused by the capability check — and RLS
 * refuses their write independently (there is no client_member write policy).
 *
 * Cross-client safety is enforced by RLS on both the read the service does first
 * and the write it does after: the session client can only see and touch rows in
 * the caller's own org. A client_admin for org A physically cannot approve org
 * B's deliverable — the row isn't visible to read, so the service returns "not
 * found" before it even reaches the guard.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Approve a deliverable (client_admin).
 *
 * J3: in_review → approved → final. Both are legal, guarded transitions; doing
 * both here matches the handoff's "Approve (approved → final)" so an approved
 * deliverable doesn't sit half-finished waiting on an internal step.
 */
export async function approveDeliverable(formData: FormData): Promise<ActionResult> {
  const deliverableId = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  const first = await performTransition({
    table: "deliverables",
    machine: "deliverable",
    entityId: deliverableId,
    to: "approved",
    capability: "own.deliverables.approve",
    reason: "approved by client",
  });
  if (!first.ok) return { ok: false, error: first.error };

  const second = await performTransition({
    table: "deliverables",
    machine: "deliverable",
    entityId: deliverableId,
    to: "final",
    capability: "own.deliverables.approve",
  });
  // approved is a legitimate resting state if finalising fails; report but don't
  // pretend it fully completed.
  if (!second.ok) return { ok: false, error: `Approved, but couldn't finalise: ${second.error}` };

  revalidatePath("/portal");
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  if (projectId) revalidatePath("/portal/project");
  return { ok: true };
}

/**
 * Request a revision (client_admin).
 *
 * in_review → revision_requested. Captures the required feedback note and bumps
 * the version so the next submission is a new version (handoff §03.10).
 */
export async function requestDeliverableRevision(formData: FormData): Promise<ActionResult> {
  const deliverableId = String(formData.get("id") ?? "");
  const feedback = String(formData.get("feedback") ?? "").trim();

  // Handoff §09.2: revision feedback is required, min 10 chars.
  if (feedback.length < 10) {
    return { ok: false, error: "Please give at least a sentence of feedback (10+ characters)" };
  }

  const actor = await getActor();
  if (!actor) return { ok: false, error: "Not signed in" };

  // Bump version alongside the status move so a resubmission is a new version.
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("deliverables")
    .select("version")
    .eq("id", deliverableId)
    .maybeSingle();
  const nextVersion = (current?.version ?? 1) + 1;

  const result = await performTransition({
    table: "deliverables",
    machine: "deliverable",
    entityId: deliverableId,
    to: "revision_requested",
    capability: "own.deliverables.approve",
    reason: feedback,
    patch: { feedback, version: nextVersion },
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/portal");
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  return { ok: true };
}

/** Approve a milestone waiting on the client (client_admin). */
export async function approveMilestone(formData: FormData): Promise<ActionResult> {
  const result = await performTransition({
    table: "milestones",
    machine: "milestone",
    entityId: String(formData.get("id") ?? ""),
    to: "approved",
    capability: "own.deliverables.approve",
    reason: "approved by client",
    patch: { approved_at: new Date().toISOString() },
  });
  if (result.ok) {
    revalidatePath("/portal");
    revalidatePath("/portal/project");
  }
  return { ok: result.ok, error: result.error };
}

export async function requestMilestoneRevision(formData: FormData): Promise<ActionResult> {
  const feedback = String(formData.get("feedback") ?? "").trim();
  if (feedback.length < 10) {
    return { ok: false, error: "Please give at least a sentence of feedback (10+ characters)" };
  }
  const result = await performTransition({
    table: "milestones",
    machine: "milestone",
    entityId: String(formData.get("id") ?? ""),
    to: "revision_requested",
    capability: "own.deliverables.approve",
    reason: feedback,
  });
  if (result.ok) {
    revalidatePath("/portal");
    revalidatePath("/portal/project");
  }
  return { ok: result.ok, error: result.error };
}

/** Mark a notification read (any client role — their own only, via RLS). */
export async function markNotificationRead(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", String(formData.get("id") ?? ""));
    if (error) return { ok: false, error: error.message };
    revalidatePath("/portal/notifications");
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
