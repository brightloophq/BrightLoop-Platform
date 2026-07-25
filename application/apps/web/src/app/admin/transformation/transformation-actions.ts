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
import {
  activateInitiative,
  approveReview,
  archiveInitiative,
  assignTask,
  blockTask,
  completeInitiative,
  completeTask,
  createTask,
  isApplicationError,
  linkDependency,
  openReview,
  planInitiative,
  rejectReview,
  removeTaskAssignment,
  requestChanges,
  seedTransformation,
  startTask,
  unlinkDependency,
} from "@brightloop/application";
import type { DependencyType } from "@brightloop/schema";
import { buildAppContext } from "@/lib/runtime-api";

const TRANSFORMATION_PATH = "/admin/transformation";

/** The four initiative lifecycle transitions, keyed by the form's `action` field. */
const TRANSITIONS = { plan: planInitiative, activate: activateInitiative, complete: completeInitiative, archive: archiveInitiative } as const;
type TransitionKey = keyof typeof TRANSITIONS;

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

/**
 * Transition an initiative's lifecycle (D2), then reload the workspace. The button
 * is only rendered for the legal next action, but the use-case re-validates the
 * transition and is idempotent, so a stale double-click is safe.
 */
export async function transitionInitiativeFormAction(formData: FormData): Promise<void> {
  const initiativeId = String(formData.get("initiativeId") ?? "").trim();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim() as TransitionKey;
  const transition = TRANSITIONS[action];
  const dest = workspaceId === "" ? TRANSFORMATION_PATH : `${TRANSFORMATION_PATH}/${workspaceId}`;
  if (initiativeId === "" || transition === undefined) redirect(`${dest}?error=${encodeURIComponent("Invalid transition request.")}`);

  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await transition(ctx!, initiativeId);
  } catch (error) {
    const message = isApplicationError(error) ? error.message : "Couldn't transition the initiative.";
    redirect(`${dest}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(dest);
  redirect(dest);
}

/* ---- D3/D4 execution-management actions ------------------------------------ */

function backTo(workspaceId: string, error?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : "";
  redirect(`${TRANSFORMATION_PATH}/${workspaceId}${q}`);
}
function msg(error: unknown, fallback: string): string {
  return isApplicationError(error) ? error.message : fallback;
}

/** Open / decide a review (open · approve · request_changes · reject). */
export async function reviewFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const reviewId = String(formData.get("reviewId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (decision === "open") await openReview(ctx!, initiativeId);
    else if (decision === "approve") await approveReview(ctx!, reviewId, note);
    else if (decision === "request_changes") await requestChanges(ctx!, reviewId, note);
    else if (decision === "reject") await rejectReview(ctx!, reviewId, note);
    else backTo(workspaceId, "Unknown review action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't update the review.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Create a task under an initiative. */
export async function taskCreateFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");
  const priority = (["low", "medium", "high"].includes(priorityRaw) ? priorityRaw : "medium") as "low" | "medium" | "high";
  if (title === "") backTo(workspaceId, "Enter a task title.");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await createTask(ctx!, initiativeId, { title, priority });
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't create the task.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Transition a task (start · complete · block). */
export async function taskTransitionFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const action = String(formData.get("action") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (action === "start") await startTask(ctx!, taskId);
    else if (action === "complete") await completeTask(ctx!, taskId);
    else if (action === "block") await blockTask(ctx!, taskId);
    else backTo(workspaceId, "Unknown task action.");
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't move the task.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Assign / reassign / unassign a task owner. */
export async function taskAssignFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const assignee = String(formData.get("assignee") ?? "").trim();
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    if (assignee === "") await removeTaskAssignment(ctx!, taskId);
    else await assignTask(ctx!, taskId, assignee);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't update the assignment.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Link an initiative dependency. */
export async function dependencyLinkFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const typeRaw = String(formData.get("type") ?? "depends_on");
  const type = (["depends_on", "blocks"].includes(typeRaw) ? typeRaw : "depends_on") as DependencyType;
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await linkDependency(ctx!, workspaceId, from, to, type);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't link the dependency.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}

/** Remove an initiative dependency. */
export async function dependencyUnlinkFormAction(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const dependencyId = String(formData.get("dependencyId") ?? "");
  try {
    const ctx = await buildAppContext();
    if (ctx === null) redirect("/admin");
    await unlinkDependency(ctx!, dependencyId);
  } catch (error) { backTo(workspaceId, msg(error, "Couldn't remove the dependency.")); }
  revalidatePath(`${TRANSFORMATION_PATH}/${workspaceId}`);
  backTo(workspaceId);
}
